/**
 * Normalize an `EXPO_PUBLIC_*` value.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time, but values entered in
 * EAS (or copied verbatim out of a `.env` file) can arrive wrapped in quotes.
 * A quoted URL is still truthy, so Supabase reports "Invalid supabaseUrl"
 * instead of a missing-config error. Strip surrounding quotes/whitespace so a
 * cosmetic typo can never take the app down.
 *
 * Always pass a static `process.env.EXPO_PUBLIC_*` expression — Expo can only
 * inline static accesses.
 */
export function publicEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').trim();
}
