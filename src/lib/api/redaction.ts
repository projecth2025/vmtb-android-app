import { supabase } from '../supabase';
import { API_BASE, makeUuid } from './config';
import { getAccessToken } from './profile';
import { triggerApplyRedactionChanges } from './pipeline';

export type RedactionStyle = 'blur' | 'whiteout' | 'blackout';

export interface RedactionRegion {
  id: string;
  page: number;
  bbox: [number, number, number, number]; // normalized [x, y, w, h] top-left origin
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
    page: row.page_number ?? row.page ?? 1,
    bbox: row.bbox ?? [0, 0, 0, 0],
    style: (row.style ?? 'blackout') as RedactionStyle,
    source: row.source,
  }));
}

export async function commitCaseEdits(input: {
  caseId: string;
  sessionId?: string;
  documentName: string;
  changes: LocalChange[];
  uploadFiles?: { file_name: string; size: number; type: string }[];
  deleteFiles?: string[];
}): Promise<void> {
  const sessionId = input.sessionId ?? makeUuid();
  const documentChanges = input.changes.map((change) => {
    if (change.kind === 'add' && change.region) {
      return {
        action: 'add_redaction' as const,
        page_number: change.region.page,
        bbox: change.region.bbox,
        style: change.region.style,
      };
    }
    return {
      action: 'remove_redaction' as const,
      redaction_id: change.redactionId,
    };
  });

  const { data, error } = await supabase.rpc('commit_case_edits', {
    p_case_id: input.caseId,
    p_session_id: sessionId,
    p_documents: [
      {
        document_filename: input.documentName,
        changes: documentChanges,
      },
    ],
    p_delete_files: input.deleteFiles ?? [],
    p_upload_files: input.uploadFiles ?? [],
    p_additional_data: null,
    p_empty_action: null,
  });
  if (error) throw error;

  const run = Array.isArray(data) ? data[0] : data;
  if (run?.id) await triggerApplyRedactionChanges(run.id);
}

export function mapPipelineError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/NOT_OWNER/i.test(message)) return 'Only the case owner can edit documents.';
  if (/RUN_IN_PROGRESS/i.test(message)) return 'A processing run is already in progress. Wait for it to finish.';
  if (/STALE_GENERATION/i.test(message)) return 'This case changed on the server. Refresh and try again.';
  if (/REGENERATION_LIMIT/i.test(message)) return 'This case has reached its regenerations limit.';
  if (/CASE_WOULD_BE_EMPTY/i.test(message)) return 'The case would be empty after these changes.';
  return message || 'Could not commit document edits.';
}
