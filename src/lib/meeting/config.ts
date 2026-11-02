/**
 * Jitsi meeting runtime configuration.
 *
 * These are EXPO_PUBLIC_* vars, so they are inlined into the client bundle at
 * build time and are public by design (they are already public in the web
 * loader). The domain hosts the self-hosted jitsi-meet; the backend boots the
 * on-demand Jitsi VM and validates the join ticket.
 */
export const JITSI_DOMAIN = process.env.EXPO_PUBLIC_JITSI_DOMAIN ?? '';
export const JITSI_BACKEND_URL = process.env.EXPO_PUBLIC_JITSI_BACKEND_URL ?? '';

export function assertJitsiConfigured() {
  if (!JITSI_DOMAIN || !JITSI_BACKEND_URL) {
    throw new Error('Add EXPO_PUBLIC_JITSI_DOMAIN and EXPO_PUBLIC_JITSI_BACKEND_URL to .env.');
  }
}
