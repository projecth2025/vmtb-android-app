import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE, makeUuid } from '../lib/api/config';

export type TranscriptionSource = 'step2' | 'general_opinion' | 'question' | 'answer' | 'reply' | 'feedback';

export async function transcribeRecording(uri: string, userId: string, source: TranscriptionSource) {
  const recordingId = makeUuid();
  const mimeType = 'audio/mp4';
  const { error: rowError } = await supabase.from('speech_transcriptions').insert({
    recording_id: recordingId,
    user_id: userId,
    source,
    status: 'pending',
    transcript: null,
    mime_type: mimeType,
    language: 'en',
  });
  if (rowError) throw rowError;

  const presignedResponse = await fetch(`${API_BASE}/get-presignedURLs-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording_id: recordingId, user_id: userId }),
  });
  const presigned = await presignedResponse.json();
  if (!presignedResponse.ok || !presigned?.presigned_url) {
    throw new Error(presigned?.error || 'Could not prepare voice transcription.');
  }
  const upload = await FileSystem.uploadAsync(presigned.presigned_url, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': mimeType },
  });
  if (upload.status < 200 || upload.status >= 300) throw new Error('Voice recording upload failed.');

  const start = await fetch(`${API_BASE}/transcribe-audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording_id: recordingId, user_id: userId }),
  });
  if (!start.ok) throw new Error(`Could not start transcription (${start.status}).`);

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { data, error } = await supabase
      .from('speech_transcriptions')
      .select('*')
      .eq('recording_id', recordingId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) continue;
    if (data?.status === 'failed') throw new Error(data.error_message || 'Voice transcription failed.');
    if (data?.status === 'completed') {
      const text = data.transcript ?? data.transcription_text ?? data.transcript_text ?? data.transcribed_text ?? '';
      if (text.trim()) return text as string;
    }
  }
  throw new Error('Voice transcription timed out. Please try again.');
}
