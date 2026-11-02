import { JITSI_BACKEND_URL } from './config';

/**
 * Waiting-room service.
 *
 * The self-hosted Jitsi VM boots on demand, so joining before it is up causes a
 * connection error. This polls POST {JITSI_BACKEND_URL}/start-jitsi with the
 * opaque join ticket until the server reports `already_running`. It is a faithful
 * port of the web loader's meetingService.ts.
 *
 * The ticket rides in the `X-Join-Ticket` header (never a query string) and the
 * endpoint 401s without a valid, unexpired ticket.
 */

export type ComponentState = {
  state?: string;
  detail?: string;
  https?: string;
};

export type StartJitsiResponse = {
  status: string;
  components?: Record<string, ComponentState>;
};

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 60; // ~5 minutes
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONSECUTIVE_ERRORS = 10;
const JOIN_TICKET_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_READY_RESPONSES = 2;

export class MeetingService {
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private requestController: AbortController | null = null;
  private isCleanedUp = false;
  private lastComponents: Record<string, ComponentState> = {};

  /** Resolves when the server is ready; rejects on timeout / repeated failures. */
  waitForMeetingReady(
    joinTicket: string,
    onComponents?: (components: Record<string, ComponentState>) => void,
  ): Promise<void> {
    if (!JOIN_TICKET_PATTERN.test(joinTicket)) {
      return Promise.reject(new Error('The meeting join ticket is invalid. Go back and try again.'));
    }
    this.isCleanedUp = false;
    return this.pollUntilReady(joinTicket, onComponents);
  }

  getComponents(): Record<string, ComponentState> {
    return this.lastComponents;
  }

  private async callStartJitsi(joinTicket: string): Promise<StartJitsiResponse> {
    const endpoint = `${JITSI_BACKEND_URL}/start-jitsi`;
    if (!JITSI_BACKEND_URL) {
      throw new Error('Meeting activation backend is not configured in this app build.');
    }
    const controller = new AbortController();
    this.requestController = controller;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.info(`[meeting] POST ${endpoint}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Join-Ticket': joinTicket,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(`[meeting] Activation backend responded with HTTP ${response.status}`);
        throw new Error(`Meeting activation backend returned HTTP ${response.status}.`);
      }
      const data = (await response.json()) as StartJitsiResponse;
      if (data.components) this.lastComponents = data.components;
      console.info('[meeting] Activation backend status:', data.status, data.components ?? {});
      return data;
    } catch (error) {
      console.error('[meeting] Activation request failed:', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (this.requestController === controller) this.requestController = null;
    }
  }

  private pollUntilReady(
    joinTicket: string,
    onComponents?: (components: Record<string, ComponentState>) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let callCount = 0;
      let consecutiveErrors = 0;
      let consecutiveReadyResponses = 0;

      const poll = async () => {
        if (this.isCleanedUp) return;

        callCount++;
        if (callCount > MAX_ATTEMPTS) {
          this.cleanup();
          reject(new Error('Server startup timeout'));
          return;
        }

        try {
          const response = await this.callStartJitsi(joinTicket);
          consecutiveErrors = 0;
          onComponents?.(this.lastComponents);

          if (response.status === 'already_running') {
            consecutiveReadyResponses++;
            if (consecutiveReadyResponses >= REQUIRED_READY_RESPONSES) {
              this.cleanup();
              resolve();
              return;
            }
          } else {
            // A single ready response can be stale during VM transitions. Match
            // the web loader and require two consecutive readiness checks.
            consecutiveReadyResponses = 0;
          }
          // `starting` -> keep polling; components map drives the loader UI.
        } catch {
          consecutiveErrors++;
          consecutiveReadyResponses = 0;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            this.cleanup();
            reject(new Error('Unable to connect to the meeting server.'));
            return;
          }
        }

        if (!this.isCleanedUp) {
          this.pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      void poll();
    });
  }

  cleanup(): void {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.requestController?.abort();
    this.requestController = null;
  }
}
