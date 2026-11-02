# vMTB Android App — Agent Instructions

## Product scope
This is the Android counterpart to `../vMTB-Veritas/main`. The source of truth for features and implementation contracts is `docs/FEATURES.md` and the web app. The user has authorized implementation across the full feature list. Preserve shared Supabase, storage, AWS pipeline, role rules, UI language, and behavior; adapt only where Android requires it.

## Runtime and workflow
Work in WSL only. Use NVM Node 24.

```bash
source ~/.nvm/nvm.sh
nvm use 24
cd /home/harish/Code/DCP/vmtb-android-app
npx tsc --noEmit
npx expo-doctor
npx expo start --dev-client --tunnel
```

Native dependency or config changes require a rebuilt development APK using the existing EAS project. Never change the package identifier or EAS project without explicit authorization. Expo Go is not the supported authenticated test path.

## Organization
- `App.tsx` is the root: session lifecycle, profile load, and screen routing.
- `src/auth/` — `AuthFlow.tsx` (OAuth/OTP/password handlers) + `screens/` for login, signup, OTP, and password reset.
- `src/screens/` — feature screens: `FeatureRouter.tsx` dispatches by `Screen`; `cases/` (incl. `tabs/`), `mtbs/`, `meetings/`, `profile/`, `feedback/`, `samples/`, plus `HomeScreen.tsx` and `SamplePage.tsx`.
- `src/screens/meetings/` — `MeetingWaitingScreen.tsx` (VM boot progress), `MeetingLiveScreen.tsx` (hosts `JitsiMeeting`, owns `JITSI_CONFIG` and the event listeners), `MeetingDetailScreen.tsx` (MoM via `get_mtb_transcripts`).
- `src/components/ui/` — shared primitives (Button, Field, Page, Pill, FormModal, Avatar, …).
- `src/lib/api/` — data operations (`cases`, `mtbs`, `meetings`, `opinions`, `treatment`, `profile`, `feedback`, `uploads`, `pipeline`, `redaction`, `whatsapp`, shared `config`).
- `src/lib/meeting/` — Jitsi runtime: `config.ts` (`EXPO_PUBLIC_JITSI_*` + assert), `meetingService.ts` (start/join + VM boot polling), `meetingAnalytics.ts` (session, heartbeats, participants), `meetingIdentity.ts` (ticket redeem + identity bind).
- `src/lib/supabase.ts` — client + `callFunction`. `src/services/voiceTranscription.ts` owns audio transcription.
- `patches/` — `patch-package` diffs for `@jitsi/react-native-sdk`; applied by the `postinstall` script. `plugins/` — local Expo config plugins.
- `src/types.ts`, `src/data`, `src/theme/styles.ts` — shared types, reference data, styles.

## Backend and security contracts
- Public Supabase configuration comes from `.env`; never include service credentials in the client or output.
- Phone verification state, role, clinician links, OTP actions, meeting tickets, archive and pipeline changes are server-authoritative. Use the existing Edge Functions and RPCs; do not bypass them with direct writes.
- Keep MTB Expert and Site Data Coordinator permissions in parity with the web app. SDC ownership writes must target the linked clinician.
- Do not await profile/database work inside `onAuthStateChange`; defer it to avoid auth-js lock deadlocks.
- Never expose private patient data from `cases`; use `cases_viewer_safe` for shared/viewer case screens.

## UI parity
Match the web tokens, copy, role names, logo, and icons. Keep every form keyboard-safe, responsive for phone/tablet, and use touch-appropriate controls. Password client validation is limited to non-empty and matching confirmation, per user preference.

## Current implementation notes
Codebase restructured (behavior-preserving): auth flows live in `src/auth/`, feature screens in `src/screens/`, UI primitives in `src/components/ui/`, and all data operations in `src/lib/api/`. Implemented app areas include case and MTB browsing/creation, case pipeline kickoff, summary save/verify/regenerate, report viewing and owner redaction editing (blur/whiteout/blackout via `commit_case_edits` + pipeline trigger), opinions, treatment plans and linked follow-up records, archive/restore, profile editing/photo upload/WhatsApp re-verification, feedback, MTB notification toggle, avatar display with URL cache, meeting Start/Join polling and MoM detail via `get_mtb_transcripts`, and full local sample case/board screens. This remains partial parity: inspect `docs/FEATURES.md` and the web app before assuming any listed feature is complete. Known gaps: applied dark/system palettes (preference is saved only) and deferred items (voice dictation outside case explanation, onboarding). Native in-app Jitsi meetings are **validated working on device** (2026-11-02): waiting room, native prejoin, two-way audio/video, unmute-and-speak, transcription and MoM. The remaining device matrix not yet exercised is camera switching and sustained multi-participant behaviour.

### Jitsi `sendEvent of null` — root cause and durable fix (2026-11-02)
- **Symptom:** `TypeError: Cannot read property 'sendEvent' of null`, fired only when the local user unmuted and spoke (~10x, from `react-native-webrtc`'s `RTCDataChannel` `message` dispatch). Joining muted for minutes produced nothing.
- **Root cause:** Android ships **no** `ExternalAPI` native module (`JitsiMeetReactNativePackage.createNativeModules` omits it; only iOS has `ExternalAPI.m`). `isExternalAPIAvailable()` tested `ExternalAPI !== null`, but an absent module resolves to `undefined`, so it wrongly returned `true`. That registered `mobile/external-api/middleware.ts`, whose `sendEvent()` then dereferenced the missing module whenever a data-channel message arrived — the dominant-speaker change caused by speaking.
- **Second bug from the same root cause:** that middleware's registration also made `mobile/react-native-sdk/middleware.js` skip its own `!externalAPIEnabled` guard, so every `eventListeners` callback passed to `JitsiMeeting` (`onConferenceJoined`, `onParticipantJoined`, `onParticipantLeft`, `onReadyToClose`) was **dead on Android**. Since `maybeBeginJoin()` depends on those for the local participant id, `onLocalParticipantJoined()` and `bindTicketIdentity()` never ran. **Confirmed fixed** — the meeting feature works end-to-end on device after the patch; the join path now executes (it is idempotent via `joinStartedRef`).
- **Fix (3 layers):** (1) `isExternalAPIAvailable()` → `ExternalAPI != null`; (2) `sendEvent()` → `NativeModules.ExternalAPI?.sendEvent(...)`; (3) meeting config sets `analytics: { disabled: true }` + `disableThirdPartyRequests: true`.
- **Durability:** (1) and (2) are `node_modules` edits, so they are captured in `patches/@jitsi+react-native-sdk+13.3.0.patch` and re-applied by the `postinstall: "patch-package"` script. **Any `npm install` reverts them if that hook is removed** — if the crash reappears after an install, check `patches/` and `postinstall` first. Do not hand-edit these files again; change the patch instead.
- **Not the cause:** Expo/RN/React versions (error reproduced on SDK 57 and 58), amplitude (no `amplitudeAPPKey`), `Statistics.analytics` (assigned once, never nulled), Node/nvm version (build tooling only, not in the APK).
- **Upgrades applied:** Expo 57.0.31→58.0.22, RN 0.86.3→0.88.1, React 19.2.3→19.3.0, all `expo-*` →58.x. `react-native-webrtc` stays pinned at 155.0.0 (`expo.install.exclude`) and `@jitsi/react-native-sdk` at 13.3.0. Manifest rollback copies: `/tmp/opencode/pkg-backup/`.

## Before handoff
Run `npx tsc --noEmit` and `npx expo-doctor`. State whether JavaScript reload or a new development APK is needed. Give the user concrete manual phone test steps and list incomplete/skipped features accurately.


