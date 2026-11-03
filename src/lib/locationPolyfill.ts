/**
 * Gives `global.location` a real `href` so Supabase's PKCE exchange can parse it.
 *
 * Why this exists
 * ---------------
 * `@supabase/auth-js` decides it is running in a browser with:
 *
 *     const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
 *
 * and `_exchangeCodeForSession()` then does:
 *
 *     parseParametersFromURL(window.location.href)   // → new URL(href)
 *
 * React Native has neither `window.location` nor `document`, so on a bare RN app
 * `isBrowser()` is false and that branch is skipped. But the Jitsi SDK installs
 * both, in `@jitsi/react-native-sdk/react/features/mobile/polyfills/browser.js`:
 *
 *     if (typeof global.document === 'undefined') { global.document = ...Strophe... }
 *     if (typeof global.location === 'undefined') { global.location = { href: '', search: '' }; }
 *
 * That flips `isBrowser()` to true and hands Supabase an empty href, so
 * `new URL('')` throws `TypeError: Invalid URL: ` — aborting
 * `exchangeCodeForSession()` immediately after Google redirects back to the app.
 * Symptom: "Continue with Google" completes in the browser, then fails with an
 * "Invalid URL" alert.
 *
 * The fix
 * -------
 * Install a well-formed `location` before anything reads it. Jitsi only ever
 * reads `href` and `search` (for xmpp.js), so it is unaffected, and
 * `parseParametersFromURL` now finds no `sb_flow_id` parameter, resolving the
 * flow id to null and falling back to the stored PKCE verifier — exactly the
 * path taken when `isBrowser()` was false.
 *
 * If Jitsi's polyfill ran first, it will have created `{ href: '', search: '' }`,
 * so we repair `href` in place instead. Both orders are safe.
 */

/** App origin: a real, parseable URL with no `sb_flow_id` query parameter. */
const APP_LOCATION = {
  href: 'vmtb://auth/callback',
  search: '',
  hash: '',
  origin: 'vmtb://',
  hostname: 'auth',
  protocol: 'vmtb:',
  pathname: '/auth/callback',
};

type MaybeLocation = Partial<Record<keyof typeof APP_LOCATION, unknown>>;

function ensureLocation(): void {
  const globalScope = globalThis as { location?: MaybeLocation; window?: unknown };

  // React Native aliases `window` to the global object, but don't assume it.
  const roots: Array<{ location?: MaybeLocation }> = [];
  if (globalScope.window && typeof globalScope.window === 'object') {
    roots.push(globalScope.window as { location?: MaybeLocation });
  }
  roots.push(globalScope);

  for (const root of roots) {
    const existing = root.location;
    if (!existing || typeof existing !== 'object') {
      root.location = { ...APP_LOCATION };
      continue;
    }
    // Repair an empty/absent href in place; fill any other missing accessors.
    const keys = Object.keys(APP_LOCATION) as Array<keyof typeof APP_LOCATION>;
    for (const key of keys) {
      if (typeof existing[key] !== 'string' || existing[key] === '') {
        existing[key] = APP_LOCATION[key];
      }
    }
  }
}

ensureLocation();
