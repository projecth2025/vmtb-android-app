import { supabase } from '../supabase';
import { MeetingSession, MeetingTranscript } from '../../types';

export function deriveRoomName(mtbName: string) {
  return mtbName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

export async function createMeetingJoinTicket(mtbId: string, roomName: string): Promise<string> {
  const { data: ticket, error } = await supabase.rpc('create_meeting_join_ticket', {
    p_mtb_id: mtbId,
    p_room_name: roomName,
  });
  if (error || typeof ticket !== 'string') throw error ?? new Error('Could not prepare the meeting.');
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw new Error('The meeting server returned an invalid join ticket.');
  return ticket;
}

export async function fetchMeetingSessions(mtbId: string): Promise<MeetingSession[]> {
  const { data, error } = await supabase
    .from('meeting_sessions')
    .select('*')
    .eq('mtb_id', mtbId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MeetingSession[];
}

export async function fetchActiveMeeting(mtbId: string): Promise<MeetingSession | null> {
  const { data, error } = await supabase
    .from('meeting_sessions')
    .select('*')
    .eq('mtb_id', mtbId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const heartbeat = data.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0;
  const stale = Date.now() - heartbeat > 2 * 60 * 1000;
  return stale ? null : (data as MeetingSession);
}

export async function fetchMeetingTranscripts(mtbId: string): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_mtb_transcripts', { p_mtb_id: mtbId });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchMeetingTranscriptSummary(meetingId: string): Promise<MeetingTranscript | null> {
  const { data, error } = await supabase
    .from('meeting_transcripts')
    .select('*')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw error;
  return (data as MeetingTranscript) ?? null;
}

/** Fetch transcript by MTB and match the RPC's session_id to the app history ID.
 * meeting_transcripts.meeting_id is the Jitsi conference UUID, not the
 * meeting_sessions.id used for navigation.
 */
export async function fetchMeetingTranscriptForSession(
  mtbId: string,
  sessionId: string,
): Promise<MeetingTranscript | null> {
  const { data, error } = await supabase.rpc('get_mtb_transcripts', { p_mtb_id: mtbId });
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as MeetingTranscript[]) : [];
  return rows.find((row) => row.session_id === sessionId) ?? null;
}

export async function fetchMeetingTranscriptSegments(meetingId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('meeting_transcript_segments')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('start_ms');
  if (error) throw error;
  return data ?? [];
}
