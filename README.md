# vMTB Android

Android client for **vMTB** — a multidisciplinary tumour board (MTB) application for clinicians,
Site Data Coordinators and MTB experts. This app is the native counterpart to the web app in
`../vMTB-Veritas`; `docs/FEATURES.md` and the web app remain the source of truth for behaviour.

**Stack:** Expo SDK 58 · React Native 0.88.1 · React 19.3.0 · TypeScript · Supabase · native Jitsi Meet (in-app)

> Android only. The app uses native modules (auth, WebRTC, Jitsi), so it must run in an Expo
> **development client** — Expo Go is not a supported test path.

---

## Prerequisites

- **Node 24** via nvm (build tooling only; it does not ship in the APK)
- An Expo/EAS account with access to the existing project — never change the package id
  (`com.harishbabu2007.vmtb`) or the EAS project without explicit authorisation
- A Supabase project with the shared schema, Edge Functions and RPCs deployed

## Setup

```bash
source ~/.nvm/nvm.sh
nvm use 24
cd /home/harish/Code/DCP/vmtb-android-app
npm install
cp .env.example .env      # then fill in the values
```

`.env` is public-by-design configuration and is inlined into the client bundle:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `EXPO_PUBLIC_JITSI_DOMAIN` | Host serving the self-hosted jitsi-meet |
| `EXPO_PUBLIC_JITSI_BACKEND_URL` | Edge Function that boots the on-demand Jitsi VM and validates join tickets |

**Never** put service-role credentials in `.env` or anywhere in the client.

### Supabase Auth URL configuration

The following redirect URLs must be allowed:

- `vmtb://auth/callback`
- `exp://**/--/auth/callback`

## Running

```bash
npm start        # expo start --dev-client
npm run android  # expo start --dev-client --android
npm run tunnel   # expo start --dev-client --tunnel --clear   (remote device)
npm run typecheck
```

## Building an Android APK

Native dependency or app configuration changes require a **fresh** development APK — a JS reload
is not enough, because the native runtime changed underneath.

```bash
npx eas-cli@latest build --profile development --platform android --clear-cache
```

Build profiles are defined in `eas.json`: `development` (dev client, internal distribution),
`preview` (internal) and `production` (auto-increment).

---

## Project structure

```
App.tsx                    Root: session lifecycle, profile load, screen routing
src/
├── auth/                  AuthFlow + login, signup, OTP, password-reset screens
├── screens/               Feature screens; FeatureRouter dispatches by Screen
│   ├── cases/             Case list/detail/create + tabs (summary, reports,
│   │                      opinions, treatment, document editor, settings)
│   ├── mtbs/              MTB list + detail (meeting Start/Join launcher)
│   ├── meetings/          Waiting, live and MoM detail screens
│   ├── profile/, feedback/, samples/
│   └── HomeScreen.tsx, FeatureRouter.tsx
├── components/ui/         Shared primitives (Button, Field, Page, Pill, FormModal, Avatar…)
├── lib/
│   ├── api/               Data operations (cases, mtbs, meetings, opinions,
│   │                      treatment, profile, feedback, uploads, pipeline, redaction…)
│   ├── meeting/           Jitsi runtime: config, meetingService, meetingAnalytics, meetingIdentity
│   └── supabase.ts        Client + callFunction
├── services/              voiceTranscription (audio transcription)
├── theme/styles.ts        Design tokens
├── types.ts, src/data/    Shared types and reference data
```

### Backend contracts

Server-authoritative state — phone verification, roles, clinician links, OTP actions, meeting
tickets, archive and pipeline changes — must go through the existing Edge Functions and RPCs.
Never bypass them with direct writes. Never expose private patient data from `cases`
(`cases_viewer_safe` is the shared/viewer projection). Do not await profile or database work
inside `onAuthStateChange`; defer it to avoid auth-js lock deadlocks.

Roles are `clinician`, `site_data_coordinator` and `mtb_expert`, kept in parity with the web app.

---

## Meetings (in-app Jitsi)

Meetings and MTBs run **fully in-app** — no Play Store or external-browser detour. The native
`@jitsi/react-native-sdk` supplies its own prejoin page; there is no custom prejoin UI.

Flow: `MTBDetailScreen` (role-gated Start/Join) → `MeetingWaitingScreen` (VM boot progress) →
`MeetingLiveScreen` (JitsiMeeting) → back to MTB detail on leave. After transcription completes,
the MoM appears in `MeetingDetailScreen` via `get_mtb_transcripts`.

Runtime wiring lives in `src/lib/meeting/`:

- `config.ts` — reads the `EXPO_PUBLIC_JITSI_*` vars and asserts they are set
- `meetingService.ts` — starts/joins, polls VM boot state
- `meetingAnalytics.ts` — meeting session + heartbeats + participant tracking
- `meetingIdentity.ts` — redeems the join ticket and binds the verified identity

`MeetingLiveScreen` sets `analytics: { disabled: true }` and `disableThirdPartyRequests: true`.

### ⚠️ Patches to `@jitsi/react-native-sdk`

Two files inside `node_modules` are patched to fix a crash on Android:

- `react/features/mobile/react-native-sdk/functions.js` — `isExternalAPIAvailable()` now tests
  `ExternalAPI != null` instead of `!== null`
- `react/features/mobile/external-api/functions.ts` — `sendEvent()` uses optional chaining

Android ships **no** `ExternalAPI` native module, so the original `!== null` test returned `true`,
registering middleware that then dereferenced a missing module. See `AGENTS.md` for the full
root-cause write-up.

These are captured in `patches/@jitsi+react-native-sdk+13.3.0.patch` and re-applied by the
`postinstall: "patch-package"` script. **Do not hand-edit those `node_modules` files** — edit the
patch instead (`npx patch-package @jitsi/react-native-sdk`). If the crash reappears after an
install, check `patches/` and the `postinstall` script first.

> `react-native-webrtc` is pinned at `155.0.0` via `expo.install.exclude`, and
> `@jitsi/react-native-sdk` at `13.3.0`. Keep these pins.

---

## Smoke test

1. Install the development APK on two Android devices; sign in with a **clinician** account on
   device A and an **MTB Expert** account on device B.
2. On A, open an MTB and start a meeting. Confirm the waiting screen shows startup progress, then
   Jitsi prejoin opens with the profile name. Grant camera and microphone access and join.
3. On B, open the same MTB and join the active meeting. Confirm both devices can see and hear each
   other and that the participant count/history updates.
4. **Unmute and speak** — confirm no `sendEvent of null` console errors appear.
5. Background B briefly, reopen it, then leave the meeting from A. Confirm B remains connected until
   it leaves and the ended meeting appears in history.
6. After transcription completes, open the meeting history row and confirm the Minutes of Meeting
   appear.

---

## Known gaps

Partial parity — inspect `docs/FEATURES.md` and the web app before assuming a feature is complete:

- Applied dark/system palettes (the preference is saved but not applied)
- Voice dictation outside case explanation
- Onboarding
