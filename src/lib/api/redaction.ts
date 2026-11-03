import { supabase } from '../supabase';
import { PickedCaseFile } from '../../types';
import { API_BASE, makeUuid } from './config';
import { getAccessToken } from './profile';
import { triggerApplyRedactionChanges } from './pipeline';

export type RedactionStyle = 'blur' | 'whiteout' | 'blackout';

/** Normalized region on the page, origin top-left, all values in [0,1]. Matches the DB `bbox` JSONB shape. */
export interface RedactionBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RedactionRegion {
  id: string;
  /** 0-indexed page number, as stored by the DB and expected by `commit_case_edits`. */
  page: number;
  bbox: RedactionBBox;
  style: RedactionStyle;
  source?: 'automated_text' | 'automated_visual' | 'manual';
}

export interface LocalChange {
  kind: 'add' | 'remove';
  region?: RedactionRegion;
  redactionId?: string;
}

export interface ReportFileInfo {
  filename: string;
  url: string;
}

/** Display name without the anonymization prefix or extension — the DB's `document_key`. */
export function toDocumentName(filename: string): string {
  return filename.replace(/^ANO_NNCMFAGSSS_\d+_/, '').replace(/\.[^./]+$/, '');
}

/**
 * Documents removed from the case and not since re-added. Removals commit to
 * the database first; the S3 file is only renamed when processing reaches it,
 * so filtering by the listing alone would briefly resurface a removed file.
 */
export async function fetchRemovedDocumentKeys(caseId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('case_documents')
    .select('document_name, deleted_at')
    .eq('case_id', caseId);
  if (error) throw error;
  const rows = data ?? [];
  const live = new Set(rows.filter((row: any) => !row.deleted_at).map((row: any) => row.document_name as string));
  return new Set(
    rows
      .filter((row: any) => row.deleted_at && !live.has(row.document_name))
      .map((row: any) => row.document_name as string),
  );
}

/** `case_documents` rows, for rebuilding the document list at a past generation. */
export async function fetchCaseDocumentRows(caseId: string) {
  const { data, error } = await supabase
    .from('case_documents')
    .select('document_name, file_name, added_generation, deleted_generation, deleted_s3_key, created_at')
    .eq('case_id', caseId);
  if (error) throw error;
  return data ?? [];
}

/** Immutable per-version files, so a document redacted later still reads as verified. */
export async function fetchCaseDocumentVersions(caseId: string) {
  const { data, error } = await supabase
    .from('case_document_versions')
    .select('document_name, version, generation, s3_key')
    .eq('case_id', caseId);
  if (error) throw error;
  return data ?? [];
}

export async function fetchReportFiles(requestId: string): Promise<ReportFileInfo[]> {
  const response = await fetch(`${API_BASE}/get-reports?request_id=${encodeURIComponent(requestId)}`);
  if (!response.ok) throw new Error(`Could not load reports (${response.status}).`);
  const data = await response.json();
  return data.files ?? [];
}

export async function fetchReportFileUrl(requestId: string, filename: string): Promise<string> {
  const response = await fetch(
    `${API_BASE}/get-reports?request_id=${encodeURIComponent(requestId)}&filename=${encodeURIComponent(filename)}`,
  );
  if (!response.ok) throw new Error('Could not get a fresh document link.');
  const data = await response.json();
  const url = data.files?.find((file: { filename: string }) => file.filename === filename)?.url;
  if (!url) throw new Error('This report is no longer available.');
  return url as string;
}

/**
 * Freshly signed URLs for specific document keys (only this request's data/
 * and versions/ — the Lambda refuses anything else). Used to show MTB members
 * the document versions from the case's last verified state.
 */
export async function fetchSignedKeys(requestId: string, keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const response = await fetch(
    `${API_BASE}/get-reports?request_id=${encodeURIComponent(requestId)}&version_keys=${encodeURIComponent(keys.join(','))}`,
  );
  if (!response.ok) throw new Error(`Couldn't get access to these documents (${response.status}).`);
  const data = await response.json();
  const files: { key: string; url: string }[] = data.files ?? [];
  return Object.fromEntries(files.map((file) => [file.key, file.url]));
}

export interface NewDocumentUploadConfig {
  uploadUrl: string;
  uploadPrefix: string;
  uploadFields: Record<string, string>;
}

/** Presigned S3 config for adding documents to an EXISTING case's request. */
export async function getUploadConfigForExistingRequest(requestId: string): Promise<NewDocumentUploadConfig> {
  const response = await fetch(`${API_BASE}/get-upload-urls_4_new_documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get upload config: ${text}`);
  }
  const payload = await response.json();
  const data = typeof payload?.body === 'string' ? JSON.parse(payload.body) : payload?.body ?? payload;
  const upload = data?.upload ?? data;
  const uploadUrl = upload?.url;
  const uploadPrefix = upload?.prefix;
  const uploadFields = upload?.fields ?? {};
  if (!uploadUrl || !uploadPrefix) throw new Error('The upload server returned an invalid response.');
  return { uploadUrl, uploadPrefix, uploadFields };
}

/** POSTs each file to the presigned URL, using the server's key template. */
export async function uploadFilesToS3(files: PickedCaseFile[], config: NewDocumentUploadConfig): Promise<void> {
  const requiredFields = ['x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-security-token', 'policy', 'x-amz-signature'];
  for (const field of requiredFields) {
    if (!config.uploadFields[field]) throw new Error(`Missing upload field: ${field}`);
  }
  for (const file of files) {
    const form = new FormData();
    // Prefer the server-provided template; fall back to the prefix.
    const keyTemplate = config.uploadFields.key || `${config.uploadPrefix}${file.name}`;
    form.append('key', keyTemplate.replace('${filename}', file.name));
    Object.entries(config.uploadFields).forEach(([field, value]) => {
      if (field === 'key' || field === 'acl') return; // do not send acl unless the policy requires it
      form.append(field, String(value).replace('${filename}', file.name));
    });
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);
    const response = await fetch(config.uploadUrl, { method: 'POST', body: form });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to upload ${file.name} (${response.status}).`);
    }
  }
}

export async function fetchOriginalsPageUrls(requestId: string, documentName: string): Promise<string[]> {
  const token = await getAccessToken();
  const response = await fetch(
    `${API_BASE}/get-originals?request_id=${encodeURIComponent(requestId)}&document_name=${encodeURIComponent(documentName)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Could not load originals (${response.status}).`);
  }
  const data = await response.json();
  return data.page_urls ?? data.pages ?? [];
}

export async function fetchRedactions(caseId: string, documentName: string): Promise<RedactionRegion[]> {
  const { data, error } = await supabase
    .from('case_document_redactions')
    .select('*')
    .eq('case_id', caseId)
    .eq('document_name', documentName);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    page: row.page_number ?? 0,
    bbox: toBBox(row.bbox),
    style: (row.style ?? 'blackout') as RedactionStyle,
    source: row.source,
  }));
}

/** Accepts the DB's `{x0,y0,x1,y1}` object (and defensively tolerates a legacy `[x,y,w,h]` array). */
function toBBox(value: any): RedactionBBox {
  if (Array.isArray(value)) {
    const [x, y, w, h] = value;
    return { x0: x ?? 0, y0: y ?? 0, x1: (x ?? 0) + (w ?? 0), y1: (y ?? 0) + (h ?? 0) };
  }
  return {
    x0: value?.x0 ?? 0,
    y0: value?.y0 ?? 0,
    x1: value?.x1 ?? 0,
    y1: value?.y1 ?? 0,
  };
}

/** What `commit_case_edits` returns: the new run row plus `duplicate`/`archived`. */
export interface CommitResult {
  id: string;
  duplicate?: boolean;
  archived?: boolean;
}

/**
 * Saves one whole edit batch in a single transaction (redactions, removals,
 * uploads, notes). Idempotent per `sessionId`: a retry returns the run that
 * session already created instead of committing twice.
 */
export async function commitCaseEdits(input: {
  caseId: string;
  sessionId?: string;
  /** Omit both to commit document/note changes only. */
  documentName?: string;
  changes?: LocalChange[];
  uploadFiles?: { file_name: string; size: string; type: string }[];
  deleteFiles?: string[];
  additionalData?: { title: string; content: string } | null;
  /** Required when the batch would leave the case with no documents or notes. */
  emptyAction?: 'archive' | null;
}): Promise<CommitResult> {
  const sessionId = input.sessionId ?? makeUuid();
  const documentChanges = (input.changes ?? []).map((change) => {
    if (change.kind === 'add' && change.region) {
      return {
        action: 'add' as const,
        page_number: change.region.page,
        bbox: change.region.bbox,
        style: change.region.style,
      };
    }
    return {
      action: 'remove' as const,
      redaction_id: change.redactionId,
    };
  });
  const documents =
    input.documentName && documentChanges.length > 0
      ? [{ document_filename: input.documentName, changes: documentChanges }]
      : [];

  const { data, error } = await supabase.rpc('commit_case_edits', {
    p_case_id: input.caseId,
    p_session_id: sessionId,
    p_documents: documents,
    p_delete_files: input.deleteFiles ?? [],
    p_upload_files: input.uploadFiles ?? [],
    p_additional_data: input.additionalData ?? null,
    p_empty_action: input.emptyAction ?? null,
  });
  if (error) throw error;

  const run = Array.isArray(data) ? data[0] : data;
  if (run?.id) await triggerApplyRedactionChanges(run.id);
  return run as CommitResult;
}

// Shared with the pipeline module so both surfaces show identical messages.
export { mapPipelineError, describePipelineError } from './pipeline';
