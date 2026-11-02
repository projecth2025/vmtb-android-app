import { supabase } from '../supabase';

/**
 * Meeting analytics (session lifecycle + participant leave).
 *
 * Faithful port of the web loader's meetingAnalytics.ts. Principles:
 * 1. Client ONLY creates/updates its OWN records.
 * 2. Client NEVER closes/modifies other meetings.
 * 3. Stale meetings are IGNORED (filtered out), not closed.
 * 4. A session is marked 'ended' ONLY when the local user explicitly leaves.
 * 5. Client writes NO meeting_participants rows on join (those are written
 *    server-side by the meeting_participant_identity Edge Function via bind).
 *
 * Remote participants are counted for max_participants and nothing more. The
 * only client-permitted participant write is the leave columns (left_at,
 * duration_seconds, left_reason) via column-level grants.
 */

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STALE_THRESHOLD_MINUTES = 2;

export interface MeetingParams {
  roomName: string;
  mtbId: string;
}

export class MeetingAnalytics {
  private meetingSessionId: string | null = null;
  private currentParticipantId: string | null = null;
  private params: MeetingParams | null = null;
  private participantCount = 0;
  private maxParticipants = 0;
  private isTracking = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private hasEnded = false;

  initialize(params: MeetingParams): boolean {
    if (!params.mtbId || !params.roomName) return false;
    this.params = params;
    this.hasEnded = false;
    this.isTracking = true;
    return true;
  }

  getMeetingSessionId(): string | null {
    return this.meetingSessionId;
  }

  /** Called when the local participant joins. Resolves once the session exists. */
  async onLocalParticipantJoined(participantId: string): Promise<void> {
    if (!this.isTracking || !this.params) return;
    this.currentParticipantId = participantId;

    await this.getOrCreateMeetingSession();
    if (!this.meetingSessionId) return;

    this.participantCount = 1;
    await this.updateMaxParticipants();
    this.startHeartbeat();
  }

  private async getOrCreateMeetingSession(): Promise<void> {
    if (!this.params) return;
    try {
      const recentThreshold = new Date(
        Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000,
      ).toISOString();

      const { data: existing } = await supabase
        .from('meeting_sessions')
        .select('*')
        .eq('mtb_id', this.params.mtbId)
        .eq('room_name', this.params.roomName)
        .eq('status', 'active')
        .gte('last_heartbeat', recentThreshold)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        this.meetingSessionId = existing.id;
        this.maxParticipants = existing.max_participants || 0;
        return;
      }

      const now = new Date().toISOString();
      const { data: created, error } = await supabase
        .from('meeting_sessions')
        .insert({
          mtb_id: this.params.mtbId,
          room_name: this.params.roomName,
          started_at: now,
          last_heartbeat: now,
          status: 'active',
          max_participants: 1,
        })
        .select()
        .single();

      if (error || !created) return;
      this.meetingSessionId = created.id;
    } catch {
      // Analytics must never break a meeting.
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    void this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => void this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /** One extra heartbeat, e.g. when the app is backgrounded (web visibility parity). */
  async sendHeartbeat(): Promise<void> {
    if (!this.meetingSessionId || this.hasEnded) return;
    try {
      await supabase
        .from('meeting_sessions')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', this.meetingSessionId);
    } catch {
      // Ignore.
    }
  }

  /** Remote participant joined: count only. */
  async onParticipantJoined(participantId: string): Promise<void> {
    if (!this.isTracking || !this.meetingSessionId) return;
    if (participantId === this.currentParticipantId) return;
    this.participantCount++;
    await this.updateMaxParticipants();
  }

  /** Remote participant left. */
  async onParticipantLeft(participantId: string): Promise<void> {
    if (!this.isTracking || !this.meetingSessionId) return;
    if (participantId === this.currentParticipantId) return;
    await this.markParticipantLeft(participantId, 'normal');
    this.participantCount = Math.max(0, this.participantCount - 1);
  }

  /**
   * Local participant left. The ONLY time a session is marked ended.
   * Idempotent (guarded by hasEnded) so screen unmount and the Jitsi leave
   * event can both call it safely.
   */
  async onLocalParticipantLeft(reason = 'normal'): Promise<void> {
    if (!this.isTracking || this.hasEnded) return;
    this.hasEnded = true;
    this.stopHeartbeat();
    if (this.currentParticipantId) {
      await this.markParticipantLeft(this.currentParticipantId, reason);
    }
    await this.endMeetingSession();
    this.cleanup();
  }

  private async markParticipantLeft(participantId: string, reason: string): Promise<void> {
    if (!this.meetingSessionId) return;
    try {
      const now = new Date();
      const { data: participant } = await supabase
        .from('meeting_participants')
        .select('*')
        .eq('meeting_session_id', this.meetingSessionId)
        .eq('participant_id', participantId)
        .is('left_at', null)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!participant) return;

      const joinedAt = new Date(participant.joined_at).getTime();
      const durationSeconds = Math.floor((now.getTime() - joinedAt) / 1000);

      await supabase
        .from('meeting_participants')
        .update({
          left_at: now.toISOString(),
          duration_seconds: durationSeconds,
          left_reason: reason,
        })
        .eq('id', participant.id);
    } catch {
      // Ignore.
    }
  }

  private async updateMaxParticipants(): Promise<void> {
    if (!this.meetingSessionId) return;
    if (this.participantCount > this.maxParticipants) {
      this.maxParticipants = this.participantCount;
      await supabase
        .from('meeting_sessions')
        .update({ max_participants: this.maxParticipants })
        .eq('id', this.meetingSessionId);
    }
  }

  private async endMeetingSession(): Promise<void> {
    if (!this.meetingSessionId) return;
    try {
      const { data: session } = await supabase
        .from('meeting_sessions')
        .select('*')
        .eq('id', this.meetingSessionId)
        .maybeSingle();
      if (!session || session.status === 'ended') return;

      const now = new Date();
      const startedAt = new Date(session.started_at).getTime();
      const totalDurationSeconds = Math.floor((now.getTime() - startedAt) / 1000);

      await supabase
        .from('meeting_sessions')
        .update({
          ended_at: now.toISOString(),
          total_duration_seconds: totalDurationSeconds,
          status: 'ended',
        })
        .eq('id', this.meetingSessionId);
    } catch {
      // Ignore.
    }
  }

  cleanup(): void {
    this.stopHeartbeat();
    this.isTracking = false;
    this.meetingSessionId = null;
    this.currentParticipantId = null;
    this.params = null;
    this.participantCount = 0;
    this.maxParticipants = 0;
  }
}
