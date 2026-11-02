import { PickedCaseFile } from '../../types';
import { API_BASE, ALLOWED_EXTENSIONS } from './config';

export interface UploadConfig {
  requestId: string;
  uploadUrl: string;
  prefix: string;
  fields: Record<string, string>;
}

export async function getUploadConfig(): Promise<UploadConfig> {
  const response = await fetch(`${API_BASE}/get-upload-urls`, { method: 'POST' });
  if (!response.ok) throw new Error(`Could not prepare document upload (${response.status}).`);
  const payload = await response.json();
  const data = typeof payload?.body === 'string' ? JSON.parse(payload.body) : payload?.body ?? payload;
  const requestId = data?.request_id ?? data?.requestId;
  const uploadUrl = data?.upload_url ?? data?.uploadUrl ?? data?.upload?.url;
  const prefix = data?.upload_prefix ?? data?.uploadPrefix ?? data?.upload?.prefix;
  const fields = data?.fields ?? data?.formFields ?? data?.upload?.fields;
  if (!requestId || !uploadUrl || !prefix || !fields) {
    throw new Error('The upload server returned an invalid response.');
  }
  return { requestId, uploadUrl, prefix, fields };
}

export async function uploadFile(file: PickedCaseFile, config: UploadConfig) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`${file.name}: unsupported file type.`);
  const form = new FormData();
  Object.entries(config.fields).forEach(([key, value]) => {
    if (key !== 'key' && key !== 'acl') form.append(key, String(value));
  });
  const serverKey = (config.fields as Record<string, string>).key;
  form.append(
    'key',
    serverKey ? String(serverKey).replace('${filename}', file.name) : `${config.prefix}${file.name}`,
  );
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  } as any);
  const response = await fetch(config.uploadUrl, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Upload failed for ${file.name} (${response.status}).`);
}
