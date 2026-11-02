import { callFunction } from '../supabase';

/**
 * Server-verified speaker identity.
 *
 * The join ticket is bound to auth.uid() when minted (create_meeting_join_ticket
 * RPC). The meeting_participant_identity Edge Function — running with the
 * service-role key — is the only thing that turns a ticket back into a profile
 * and writes the meeting_participants row. This app is authenticated (unlike the
 * anon web loader), so `redeem` is a belt-and-braces prefill; `bind` is the part
 * that matters for transcript attribution.
 *
 * Two actions:
 *   redeem { ticket }                            -> { display_name, profession }
 *   bind   { ticket, participant_id, meeting_session_id, display_name? }
 *
 * Every call is fail-soft: a meeting must be joinable even when this endpoint is
 * unreachable — the cost is an unverified speaker label, never a broken meeting.
 */

const FUNCTION_NAME = 'meeting_participant_identity';
const REQUEST_TIMEOUT_MS = 5000;
const JOIN_TICKET_PATTERN = /^[a-f0-9]{64}$/;

export interface VerifiedIdentity {
  displayName: string | null;
  profession: string | null;
}

/**
 * Combine a verified name and profession into the prejoin display name,
 * e.g. "Dr. Priya Sharma (Medical Oncologist)". Undefined when there is no name.
 */
export function formatPrejoinDisplayName(
  name?: string | null,
  profession?: string | null,
): string | undefined {
  const trimmedName = name?.trim();
  if (!trimmedName) return undefined;
  const trimmedProfession = profession?.trim();
  return trimmedProfession ? `${trimmedName} (${trimmedProfession})` : trimmedName;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function invokeWithTimeout(body: Record<string, unknown>): Promise<any | null> {
  try {
    const result = await Promise.race([
      callFunction(FUNCTION_NAME, body),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS)),
    ]);
    if (!result) return null; // timed out -> fail-soft
    return result;
  } catch {
    return null;
  }
}

/** Exchange a ticket for the display name/profession to prefill prejoin with. */
export async function redeemTicket(ticket: string | null): Promise<VerifiedIdentity | null> {
  if (!ticket || !JOIN_TICKET_PATTERN.test(ticket)) return null;
  const body = await invokeWithTimeout({ action: 'redeem', ticket });
  if (!body) return null;
  return {
    displayName: readString(body.display_name),
    profession: readString(body.profession),
  };
}

/**
 * Bind the ticket to this Jitsi participant so the server records who actually
 * spoke. `displayName` is what the participant shows on their tile (recorded for
 * analytics, not used for attribution). Requires meetingSessionId — the endpoint
 * rejects a bind without one or with a mismatched MTB. Returns false on failure;
 * the caller logs and carries on, leaving the speaker unverified.
 */
export async function bindTicketIdentity(args: {
  ticket: string | null;
  participantId: string;
  meetingSessionId: string | null;
  displayName?: string | null;
}): Promise<boolean> {
  const { ticket, participantId, meetingSessionId, displayName } = args;
  if (!ticket || !JOIN_TICKET_PATTERN.test(ticket) || !meetingSessionId) return false;

  const body = await invokeWithTimeout({
    action: 'bind',
    ticket,
    participant_id: participantId,
    meeting_session_id: meetingSessionId,
    display_name: displayName ?? null,
  });
  return !!body;
}
