# vMTB Android — Engineering Handoff & Implementation Report

**Audience:** future Android developers, reviewers, and maintainers of the vMTB mobile client.
**Purpose:** explain what the app is, what was built against `docs/FEATURES.md`, how each part works, where to look when something breaks, how to build and ship it, and what is still missing.
**Status of this document:** written against commit `3514eba` (branch `main`). Keep it updated when behaviour changes.

---

## Table of contents

1. [What this app is](#1-what-this-app-is)
2. [How to read `docs/FEATURES.md`](#2-how-to-read-docsfeaturesmd)
3. [Technology stack](#3-technology-stack)
4. [Architecture and navigation](#4-architecture-and-navigation)
5. [Repository map](#5-repository-map)
6. [Configuration and environments](#6-configuration-and-environments)
7. [Feature-by-feature implementation matrix](#7-feature-by-feature-implementation-matrix)
8. [Subsystem deep dives](#8-subsystem-deep-dives)
9. [Backend contracts](#9-backend-contracts)
10. [Build and release pipeline](#10-build-and-release-pipeline)
11. [Troubleshooting playbook](#11-troubleshooting-playbook)
12. [Testing and QA](#12-testing-and-qa)
13. [Known gaps, limitations and technical debt](#13-known-gaps-limitations-and-technical-debt)
14. [Recommended roadmap](#14-recommended-roadmap)
15. [Appendix A — commit history](#appendix-a--commit-history)
16. [Appendix B — release checklist](#appendix-b--release-checklist)
17. [Appendix C — glossary](#appendix-c--glossary)
18. [Appendix D — How the app was built (chronological history)](#appendix-d--how-the-app-was-built-chronological-history)
19. [Appendix E — Contributor recipes](#appendix-e--contributor-recipes)

---

## 1. What this app is

vMTB is a **molecular tumour board (MTB) workflow application** for clinicians, Site Data Coordinators (SDCs) and MTB experts. It lets a clinician:

- create a patient case and upload clinical documents;
- have the documents anonymised and summarised by an AWS document-AI pipeline;
- review, edit and **verify** the AI-generated summary;
- discuss the case with a tumour board (questions, opinions, replies);
- record a structured treatment plan and longitudinal follow-ups;
- start or join a **native, in-app Jitsi meeting**;
- read the meeting's Minutes of Meeting (MoM) after transcription.

The Android app is a **parallel client** to the web app in `../vMTB-Veritas/main`. It is not a rewrite of the backend: it uses the same Supabase project, the same database tables and RPCs, the same Edge Functions, the same AWS HTTP API and the same S3 layout. Behaviour is intended to be identical; only the presentation is native Android.

> **Source of truth:** `docs/FEATURES.md` (requirements) and the web app (reference implementation). If this document and the web app disagree, **the web app wins** — then update both.

### Delivery status at a glance

| Area | Status |
| --- | --- |
| Authentication (Google OAuth, phone/password, WhatsApp OTP, password reset, re-verification) | Working |
| Case management (create, list, 5-tab detail, archive/restore/delete) | Working |
| Document AI pipeline integration (upload → anonymise → summary → verify) | Working |
| Reports and in-app document viewer (PDF, image, text) | Working |
| Redaction **editing** | **Web only** on mobile (explicit message) |
| Opinions / questions / replies | Working |
| Treatment plan and follow-ups | Working |
| MTBs (create, join, share, rename, leave, notifications toggle) | Working |
| Native Jitsi meetings + analytics + MoM | Working, validated on device |
| Themes (dark/system) | Preference saved, **not applied** |
| Onboarding walkthrough | **Not implemented**; local sample case/board exist |
| Automated tests | None; `tsc` + `expo-doctor` + manual device smoke test |

### Verified device reality

- Native in-app Jitsi meetings were **validated end-to-end on a real Android device**: waiting room, native prejoin, two-way audio/video, unmute-and-speak, transcription and MoM.
- Not yet exercised on device: camera switching during a call, sustained behaviour with many participants.
- PDF rendering after the `expo-file-system` download change was implemented but final on-device confirmation should be repeated when testing a new APK.

---

## 2. How to read `docs/FEATURES.md`

`docs/FEATURES.md` is the **product requirements baseline** for the Android client. It lists every feature the app is expected to have, grouped by area:

1. Authentication
2. Case management
3. MTBs (Molecular Tumor Boards)
4. Meetings
5. Roles and permissions
6. Document AI pipeline (client side)
7. Notifications
8. Theme and UI
9. Onboarding (web reference; simplified on mobile)
10. Feedback
11. Settings and account
12. Integrations

Read it as **“what should exist”**, not “what definitely exists”. It was written before implementation and contains a few aspirational items that the Android client intentionally does not do (most importantly **redaction editing**, which stays on the web, and **onboarding**). Section 7 of this document maps every `FEATURES.md` bullet to its real status and code location.

When planning work:

1. Find the feature in `docs/FEATURES.md`.
2. Find the equivalent screen/flow in the web app.
3. Port the **server contract** exactly (RPC names, parameter names, error strings, enums).
4. Only then adapt the UI to native Android.

---

## 3. Technology stack

| Layer | Choice | Version |
| --- | --- | --- |
| App framework | Expo (dev client, prebuild) | SDK 58 (`expo` 58.0.22) |
| Runtime | React Native | 0.88.1 |
| UI | React | 19.3.0 |
| Language | TypeScript | ~6.0.3 |
| Backend SDK | `@supabase/supabase-js` | 2.118.0 |
| Meetings | `@jitsi/react-native-sdk` | 13.3.0 (patched) |
| WebRTC | `react-native-webrtc` | **155.0.0 (pinned)** |
| PDF rendering | `react-native-pdf` | ^7.0.5 |
| PDF inspection | `pdf-lib` | ^1.17.1 |
| Icons | `lucide-react-native` | ^1.61.0 |
| Build system | EAS Build + Expo config plugins | `eas-cli` 27.3.0 |
| Node for tooling | Node 24 via nvm (build time only) | — |

### Why Expo + prebuild

The app needs native modules (Jitsi/WebRTC, file system, document picker, image picker). Expo Go cannot load these, so the app runs in a **development client**. `expo prebuild` generates the `android/` project at build time; `android/` is **not committed** (it is generated, and `expo-doctor` fails its “non-CNG project” check if it is left on disk).

### Deliberate version pins

- `react-native-webrtc` is pinned at **155.0.0** and excluded from Expo dependency validation in `package.json` (`expo.install.exclude`). Do not bump casually — the Jitsi SDK is sensitive to the WebRTC version.
- `@jitsi/react-native-sdk` is patched at **13.3.0**. The patch file is named `patches/@jitsi+react-native-sdk+13.3.0.patch`, so **any version bump must regenerate the patch**.
- Several Jitsi transitive dependencies use GitHub commit URLs (`react-native-background-timer`, `react-native-calendar-events`, `react-native-default-preference`, `react-native-orientation-locker`, `react-native-sound`, `react-native-worklets-core`). This is intentional and required by the Jitsi SDK.

---

## 4. Architecture and navigation

### 4.1 Process model

The app is a single React Native process with a Supabase client. There is no custom backend of our own and no local database.

```
┌──────────────────────────── Android app ────────────────────────────┐
│  App.tsx  (session + screen state machine)                          │
│     │                                                               │
│     ├── AuthFlow (login / signup / OTP / reset)                     │
│     ├── HomeScreen (drawer, stats, recent cases)                    │
│     └── FeatureRouter (switch on Screen)                            │
│            ├── CasesScreen / CreateCaseScreen / CaseDetailScreen    │
│            ├── MTBListScreen / MTBDetailScreen                      │
│            ├── MeetingWaiting / MeetingLive / MeetingDetail         │
│            ├── Profile / VerifyPhone / Feedback / Samples           │
│            └── EmptyPage                                            │
│                                                                     │
│  src/lib/api/*      → Supabase + AWS HTTP                           │
│  src/lib/meeting/*  → Jitsi backend + analytics + identity          │
│  src/lib/supabase.ts→ supabase-js client + Edge Function wrapper    │
└─────────────────────────────────────────────────────────────────────┘
        │                    │                      │
        ▼                    ▼                      ▼
   Supabase            AWS API Gateway         Jitsi activation
 (Auth/Postgres/      (upload triggers,        backend (VM boot,
  Storage/Edge Fn)     reports, originals)     join ticket check)
        │                    │                      │
        └──────────────► AWS S3 ◄───────────────────┘
```

### 4.2 Navigation model

There is **no React Navigation stack**. Navigation is a `screen` string held in `App.tsx`:

```ts
type Screen =
  | 'login' | 'signup' | 'otp' | 'forgot-phone' | 'forgot-otp' | 'forgot-password' | 'home'
  | 'cases' | 'archived' | 'case-create' | 'case-detail' | 'mtbs' | 'mtb-detail'
  | 'sample-case' | 'sample-board' | 'profile' | 'feedback' | 'verify-phone'
  | 'meeting-detail' | 'meeting-waiting' | 'meeting-live';
```

`FeatureRouter` switches on that value. `App.tsx` also owns:

- `activeCaseId`, `activeMtbId`, `activeMeetingId` — the entity currently open;
- `meetingLaunch` — `{ room, ticket, mtbId, mtbName }` handed to the meeting screens;
- the `goBack()` rules (e.g. `meeting-live` → `mtb-detail`, `case-detail` → MTB detail if opened from an MTB, otherwise → cases).

**Consequences to be aware of:**

- Android hardware back is handled by the custom `Page` header button, not a navigation stack. Meeting-live overrides hardware back to leave the meeting.
- App restarts return to the login screen unless a Supabase session is persisted (it is, in AsyncStorage). Only the current screen is lost.
- Adding a screen means touching `src/types.ts` (`Screen`), `FeatureRouter`, and usually `App.goBack`.

### 4.3 Session lifecycle

`App.tsx`:

1. Calls `supabase.auth.getSession()` once (splash spinner “Loading vMTB…”).
2. Loads the profile row.
3. If `profiles.whatsapp_verified` is true → `home`; otherwise → `signup` (abandoned-signup recovery).
4. Subscribes to `onAuthStateChange`. **Never awaits database work inside the callback** — auth-js holds an internal lock while notifying listeners, and awaiting a query there can deadlock the PKCE exchange after Google OAuth. Profile loading is deferred with `setTimeout(..., 0)`.

### 4.4 Error presentation

The app does not use a toast library. Errors are shown with:

- `<ErrorBox message={...} />` inside a screen, and/or
- native `Alert.alert('vMTB', message)`.

There are ~30 `Alert.alert` calls. This is deliberate parity with the web’s dialog behaviour, but it means errors are modal and blocking. If a future task asks for “toasts”, that is new work (FEATURES.md lists toasts as a UI expectation, but only Alerts were implemented).

### 4.5 Keyboard and safe areas

- Every screen is wrapped in `SafeAreaProvider` + `SafeAreaView` in `App.tsx`.
- `Page` and `FormModal` use `KeyboardAvoidingView` with `behavior='height'` on Android (verified working on device; matches `AuthFlow`).
- `app.json` sets `softwareKeyboardLayoutMode: "resize"`.
- The app is **portrait-locked** (`orientation: "portrait"`). Tablet layouts inherit the same flex layouts; there is no dedicated tablet breakpoint.

---

## 5. Repository map

```
App.tsx                          Root: session lifecycle, routing, back rules
index.ts                         registerRootComponent(App)
app.json                         Expo config (package id, permissions, plugins)
eas.json                         Build profiles
patches/
  @jitsi+react-native-sdk+13.3.0.patch   Native + middleware fixes (applied by postinstall)
plugins/
  with-jitsi-gradle-plugin-version.js    Injects rootProject.ext.gradlePluginVersion
  with-proguard-keep-rules.js            ProGuard keep rules + disables R8 minification
src/
├── auth/
│   ├── AuthFlow.tsx             All auth handlers (OAuth, OTP, password, reset)
│   └── screens/                 Login / Signup / OTP / PhoneStep / PasswordStep
├── screens/
│   ├── FeatureRouter.tsx        Screen switch
│   ├── HomeScreen.tsx           Drawer, stats, recent cases
│   ├── EmptyPage.tsx
│   ├── cases/
│   │   ├── CasesScreen.tsx      List + search + sort + status filter (+ archived mode)
│   │   ├── CreateCaseScreen.tsx Two-step wizard
│   │   ├── CaseDetailScreen.tsx Five tabs, polling, snapshot logic
│   │   └── tabs/
│   │       ├── SummaryTab.tsx       Summary, verify, regenerate, retry
│   │       ├── ReportsTab.tsx       Document list, add/remove, notes, viewer, save batch
│   │       ├── DocumentViewer.tsx   PDF/image/text modal viewer
│   │       ├── DocumentEditor.tsx   Legacy redaction editor (currently unreachable)
│   │       ├── OpinionsTab.tsx      Questions, threaded opinions, replies
│   │       ├── TreatmentTab.tsx     Plan (3 sections) + follow-ups
│   │       └── CaseSettingsTab.tsx  MTB sharing, archive, delete
│   ├── mtbs/                    MTB list + detail (cases/meetings tabs)
│   ├── meetings/                Waiting, live Jitsi, MoM detail
│   ├── profile/                 Profile & settings, phone re-verification
│   ├── feedback/                Feedback form
│   └── samples/                 Local-only sample case and sample board
├── components/ui/               Button, Field, Input, Page, Pill, FormModal, Avatar,
│                                CaseCard, EmptyCard, ErrorBox, Loading, Brand, PhoneFields…
├── lib/
│   ├── supabase.ts              Client (AsyncStorage, PKCE), getError, callFunction (Edge Functions)
│   ├── env.ts                   EXPO_PUBLIC_* normalization (quotes/whitespace)
│   ├── api/
│   │   ├── config.ts            API_BASE, allowed extensions, UUID, error helper
│   │   ├── cases.ts             Case CRUD, summary save, cascade delete
│   │   ├── uploads.ts           Presigned S3 upload for NEW cases
│   │   ├── redaction.ts         Reports, signed URLs, uploads to existing case, commit edits
│   │   ├── pipeline.ts          Run state, start/regenerate/retry, error code mapping
│   │   ├── mtbs.ts              MTB list/detail/share/join/notifications
│   │   ├── meetings.ts          Sessions, tickets, transcripts, room name
│   │   ├── opinions.ts          Questions + opinions + edits
│   │   ├── treatment.ts         Plan + follow-ups
│   │   ├── profile.ts           Profile, avatar upload/view URL, access token
│   │   ├── whatsapp.ts          OTP Edge Function wrappers
│   │   └── feedback.ts          Feedback insert
│   ├── meeting/
│   │   ├── config.ts            JITSI_DOMAIN / JITSI_BACKEND_URL + assert
│   │   ├── meetingService.ts    Activation VM polling
│   │   ├── meetingAnalytics.ts  Session/heartbeat/participant lifecycle
│   │   └── meetingIdentity.ts   Ticket redeem/bind (fail-soft)
│   ├── useCaseRunState.ts       Pipeline polling hook (4s/30s)
│   ├── locationPolyfill.ts      Makes Supabase PKCE work alongside Jitsi
│   ├── base64.ts                atob-free base64 for PDF validation
│   └── phone.ts                 Digits-only phone normalisation
├── data/
│   ├── cancerTypes.json         418 cancer types, grouped by category
│   ├── cancerTypes.ts           Flatten + search scoring
│   └── sampleCase.ts            All local sample content
├── theme/styles.ts              Single StyleSheet with hard-coded light colours
├── types.ts                     Screen, Role, Profile, Case*, MTB, Meeting*, props
└── constants.ts                 Profession list
```

---

## 6. Configuration and environments

### 6.1 Environment variables

All client configuration is **public by design** and is inlined into the JS bundle at build time. There is no private runtime config.

| Variable | Meaning | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | e.g. `https://gwvqxetjheveelqrkjhg.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key | RLS is the security boundary |
| `EXPO_PUBLIC_JITSI_DOMAIN` | Host of self-hosted jitsi-meet | e.g. `server-vmtb-v2.3billionpairs.com` |
| `EXPO_PUBLIC_JITSI_BACKEND_URL` | Activation backend base URL | `https://jitsi-activation-backend-qaxgwzn3ua-as.a.run.app` |
| `EXPO_PUBLIC_USE_RN_FETCH` | `1` = keep React Native's built-in `fetch` | **Required for file uploads** (see below) |

`.env` is gitignored; `.env.example` is committed and documents every key.

#### Why `EXPO_PUBLIC_USE_RN_FETCH=1` exists

Expo SDK 58 installs its own `fetch`/`FormData` patch (`expo/src/winter/runtime.native.ts`). Its `FormData` rejects React Native-style file parts (`{ uri, name, type }`) with:

```
Unsupported FormDataPart implementation
```

That breaks **every** upload (case documents, new documents, profile photo). Setting `EXPO_PUBLIC_USE_RN_FETCH=1` makes Expo keep the React Native `fetch`, which accepts `{ uri }` parts. **This is a hard requirement for uploads; do not remove it.**

#### Environment-value hygiene (a real production incident)

EAS environment values are injected into the build. Two rules:

1. **Visibility must be `plaintext` (PUBLIC).** Sensitive/secret values are not inlined into client bundles. All `EXPO_PUBLIC_*` values must be plaintext in every EAS environment.
2. **Never store values wrapped in quotes.** EAS stores exactly what you type. If you paste `EXPO_PUBLIC_SUPABASE_URL="https://…"` (with quotes) into the dashboard, the app receives a URL starting with `"`, Supabase throws `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.` during module init, and the release app aborts with `SIGABRT` before any UI appears.

   This actually happened: the `preview` and `production` environments held quote-wrapped values while `development` was clean, so only standalone builds crashed. The values were re-set without quotes, and `src/lib/env.ts` now strips surrounding quotes/whitespace defensively.

   Verify with:

   ```bash
   npx eas env:list --environment preview
   ```

   Clean values print bare (`KEY=value`); quote-wrapped values print as `KEY="value"`.

### 6.2 `.env` versus EAS environments

| Build type | Where JS comes from | Where config comes from |
| --- | --- | --- |
| Development client | Metro dev server | Local `.env` (via Expo CLI) |
| Preview APK | Inlined JS bundle | EAS `preview` environment |
| Production | Inlined JS bundle | EAS `production` environment |

This is why “it works in the dev build but crashes in the preview APK” almost always means **config inlining**, not code.

### 6.3 Supabase Auth redirect URLs

These must be allow-listed in Supabase → Authentication → URL Configuration:

- `vmtb://auth/callback` (standalone/dev client)
- `exp://**/--/auth/callback` (Expo Go, kept for compatibility)

The scheme is declared in `app.json` as `"scheme": "vmtb"`.

### 6.4 `app.json` (native config)

Key values:

- package id: `com.harishbabu2007.vmtb` — **do not change** without explicit authorisation; it identifies the app to EAS, Supabase redirects and existing installs.
- EAS project id: `42f4dd3c-4f9f-4365-a695-8f3e03eead93`, owner `harishbabu2007`.
- permissions: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET` (audio permission is for Jitsi; **no dictation feature exists**).
- `predictiveBackGestureEnabled: false` (custom back handling).
- `userInterfaceStyle: "automatic"` — note the JS UI is still light-only today (see gaps).
- plugins: `expo-web-browser`, `expo-sharing`, `expo-asset`, `expo-splash-screen`, `@config-plugins/react-native-webrtc`, local `with-jitsi-gradle-plugin-version`, local `with-proguard-keep-rules`, `expo-status-bar`.

### 6.5 EAS profiles (`eas.json`)

| Profile | Output | Distribution | Notes |
| --- | --- | --- | --- |
| `development` | Dev client APK | internal | JS from Metro |
| `preview` | **APK** | internal | `autoIncrement: true`; used for manager demos |
| `production` | AAB (default) | store | `autoIncrement: true` |

EAS automatically maps a build profile to the environment of the same name (`preview` → `preview`, `production` → `production`). There is no explicit `environment` key in `eas.json`.

---

## 7. Feature-by-feature implementation matrix

Legend: **✅ Implemented** · **🟡 Partial** · **⛔ Not on mobile** · **☁️ Server-side only**

### 7.1 Authentication (`FEATURES.md` → Authentication)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Google OAuth sign-in (login/signup) | ✅ | `AuthFlow.google()`. Supabase `signInWithOAuth` (`skipBrowserRedirect`), `WebBrowser.openAuthSessionAsync` raced with a `Linking` listener, then `exchangeCodeForSession`. Deep link handled by `scheme: vmtb`. Requires the redirect allow-list. |
| Abandoned-signup recovery | ✅ | `App.loadProfile`: authenticated but `whatsapp_verified !== true` → `signup` screen, so an interrupted signup resumes. |
| Phone number + password login | ✅ | `AuthFlow.passwordLogin()` → Edge Function `verify_whatsapp_otp` with `{ action: 'get_email', phone }`, then `signInWithPassword`. |
| WhatsApp OTP signup | ✅ | `sendSignupOtp()` sends the code; `verifySignupOtp()` calls `verify_whatsapp_otp` with phone, OTP, `user_id`, password, profile fields, role and (for SDC) `linked_clinician_id`. The function sets the password, verifies the phone and writes the profile server-side. 6-digit code. |
| WhatsApp OTP login | ✅ | `sendLoginOtp()` (`purpose: 'login'`) then `verifySignupOtp()` login branch: `verify_whatsapp_otp { action: 'login' }` returns `email` + `email_otp`, exchanged with `supabase.auth.verifyOtp({ type: 'email' })`. |
| Forgot password via WhatsApp OTP | ✅ | `forgot-phone` → `forgot-otp` (`action: 'reset_verify'` → `reset_token`) → `forgot-password` (`action: 'reset_password'`). |
| Standalone phone re-verification | ✅ | `VerifyPhoneScreen`: collect number → send OTP → verify. Auto-sends when entering the verify step; 60-second resend cooldown. Reached from Profile. |
| Roles at signup | ✅ | `clinician`, `site_data_coordinator`, `mtb_expert` in `src/types.ts`; selection in `SignupScreen`. |
| SDC links to clinician by phone | ✅ | `find_clinician_by_phone` RPC at both send and verify. Fails with “No verified clinician was found with that phone number.” |
| Per-user theme preference | 🟡 | Saved to `profiles.theme_preference` and editable in Profile, but **not applied** — `src/theme/styles.ts` is a single light palette. |
| Profile fields + avatar upload | ✅ | `ProfileScreen`; photo must be ≤ 2 MB; presigned upload via AWS; `avatar_key` saved on profile; `Avatar` resolves a signed view URL with an 800 s cache. |
| Logout | ✅ | `supabase.auth.signOut()`; `onAuthStateChange` resets the screen to `login`. |

### 7.2 Case management (`FEATURES.md` → Case management)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| My Cases list + status badges + search + sort | ✅ | `CasesScreen`. Status filter pills: all / processing / unverified / verified / failed. Sort: newest / oldest / name. Auto-refreshes every 7 s while any case is `processing`. |
| Archived cases view | ✅ | Same screen with `archived` flag (`cases` vs `archived`); restore action per row. |
| Create-case wizard (2 steps) | ✅ | `CreateCaseScreen`. Step 1: patient name (optional), cancer type, documents. Step 2: explanation. |
| Patient name optional, defaults to `Anonymous` | ✅ | Client sends trimmed value or `Anonymous`; DB stores it. |
| Cancer type search (418) + “Other” free text | ✅ | `src/data/cancerTypes.json` flattened in `cancerTypes.ts`; scoring search; `CT0417` is the “Other” entry, whose free text becomes the stored cancer type. |
| File upload types | ✅ | `png, jpg, jpeg, doc, docx, ppt, pptx, pdf, txt` (`ALLOWED_EXTENSIONS`). Android uses `expo-document-picker` (no drag/drop). |
| PDF page-count validation (max 50) | ✅ | `pdf-lib` parses a base64 copy; > 50 pages rejects the file. Base64-decoded by a local helper because Hermes has no `atob`. |
| Duplicate-filename rejection | ✅ | At creation, duplicates **within the selection** are rejected. In Reports, duplicates against existing reports and staged uploads are rejected. The server also rejects duplicates when committing edits (`DUPLICATE_DOCUMENT`). |
| Case explanation text | ✅ | Stored in `case_additional_documents` with title `Case Explanation`; shown on the Summary tab and editable as “Your data” in Reports. |
| Sample-case flow (local only) | ✅ | `SampleCaseScreen`: full 5-tab walkthrough, verify interaction, local PDF asset, no uploads/DB writes. Resets when you leave. |
| Auto-generated case name (abbreviation + digits) | ✅ | Server RPC `generate_case_name({ p_abbreviation })`; collision checking is server-side. |
| Case detail with 5 tabs | ✅ | Summary, Reports, Opinions, Treatment, Settings. |
| Case details + summary card | ✅ | Case name (read-only), patient name, age, sex, cancer type, that case's notes, and the markdown summary. |
| Editable patient name (owner only) | ✅ | `isOwner` controls editability; save goes through `save_case_summary_edit`. |
| Rich-text summary editing | 🟡 | Native uses a **markdown textarea** plus `react-native-markdown-display` for rendering. There is no WYSIWYG/HTML editor; the web’s markdown-to-HTML editor was not ported. |
| Regenerate summary (cap 5, server-enforced) | ✅ | Client pre-checks `summary_regeneration_count >= 5`, then `start_regeneration`. Server also enforces (`REGENERATION_LIMIT`). |
| Save / Save & Verify / Cancel | ✅ | `SummaryTab.save(verify)`; Cancel restores the record values. |
| Verification gated on age + sex | ✅ | Client blocks with “Add the patient’s age and sex before verifying.”; server also returns `PATIENT_DETAILS_MISSING`. |
| Tabs lock until verified once | ✅ | Only Summary and Settings are enabled until `first_verified_at` is set. |
| AI-extracted age/sex, “Not detected” until available | ✅ | Fields initialise to empty and show placeholder “Not detected”. |
| MTB members see last verified version | ✅ | `CaseDetailScreen` computes `memberSnapshot` when `verified_generation !== content_generation`; Summary and Reports render the snapshot, including the document versions at that generation. |
| Polling while processing | ✅ | `useCaseRunState`: 4 s while a run is pending/running, 30 s otherwise. Reading the RPC also expires stale runs so they show `failed` instead of hanging. |
| Reports tab: document viewer | ✅ | In-app for PDF, images and text; other types go to the system share sheet. |
| Reports tab: redaction tools (blur/whiteout/blackout) | ⛔ | On mobile “Edit redactions” explicitly says editing is website-only. `DocumentEditor.tsx` still exists but is unreachable (`mode` is never set to `'edit'`). |
| Redaction versions / originals retention | 🟡 | The API supports originals and version signing, and members can view verified-generation document versions. Mobile has no UI to browse redaction history or originals. |
| Opinions: threads, questions/answers, replies, MTB filtering | ✅ | `OpinionsTab`: questions, answers, nested replies, per-MTB context selector, legacy `mtb_id IS NULL` fallback. |
| Treatment tab: plan + longitudinal follow-ups | ✅ | `TreatmentTab`: 3 sections, exact option sets, validation strings, follow-up CRUD. |
| Settings: MTB sharing add/remove | ✅ | `CaseSettingsTab`; sharing only when verified and not archived. Bulk add to multiple MTBs. |
| Settings: archive / restore | ✅ | `archive_case` / `restore_case` RPCs. Archive removes the case from all MTBs; restore does not re-share. |
| Settings: permanent delete (clinician only) | ✅ | Hidden for SDC; requires typing “permanently delete”. Client performs a **cascade delete of child tables then the case**. Server-side role trigger also protects SDC. |
| Case archiving removes from all MTBs | ☁️ | Server behaviour; client only calls the RPC. |
| Delete cascading cleanup | ✅ | Client-side multi-statement cleanup (see risk in §13). |

### 7.3 MTBs (`FEATURES.md` → MTBs)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| MTB list (owned or member of), with counts | ✅ | `MTBListScreen` + `fetchMTBs`; deduplicates owned and membership rows; `member_count = members + 1` (owner is not in `mtb_members`). Owned boards sort first, then alphabetical. |
| Create MTB (generates join code) | ✅ | Client inserts into `mtbs` with a random 8-character join code. Owner is the effective owner (SDC → linked clinician). |
| Join MTB by code | ✅ | `join_mtb_by_code` RPC; code uppercased. |
| MTB shared-case list with status pills | ✅ | `MTBDetailScreen` cases tab; `CaseCard`. |
| Add case to MTB (verified, non-archived only) | ✅ | `fetchAvailableCasesForMtb` filters `summary_status === 'verified'`, not archived, not already shared. |
| Remove case from MTB | ✅ | Owner only (`isOwner`), confirmed with an alert. |
| Rename MTB | ✅ | Header action for owner; updates `mtbs.name` scoped by `owner_id`. |
| Leave MTB | ✅ | Deletes the caller's `mtb_members` row; not owner. |
| Notification toggle | ✅ | Writes `mtbs.notification_enabled`. Notifications themselves are server-side. |
| Meeting launcher | ✅ | Role-gated button (below). |
| Meeting history with transcript/MoM status | ✅ | Meetings tab; status normalised to lowercase; completed if `status === 'completed'` **or** any MoM content exists; active meetings show `live`. |
| View case in MTB context (scoped opinions) | ✅ | Opening a case from an MTB sets `activeMtbId`; `fetchCase` filters opinions by `mtb_id`. |

### 7.4 Meetings (`FEATURES.md` → Meetings)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Start a meeting from an MTB | ✅ | `MTBDetailScreen.openMeeting()`: room name derived from MTB name, `create_meeting_join_ticket` RPC, then `MeetingWaitingScreen`. |
| Join a meeting in-app via Jitsi RN SDK | ✅ | `MeetingLiveScreen` renders `JitsiMeeting` with the self-hosted domain and native prejoin. |
| Meeting analytics | ✅ | `MeetingAnalytics`: create/reuse session, heartbeat every 30 s, participant counts, leave/end. Client never writes other participants' join rows. |
| Meeting detail: transcript segments and MoM | ✅ | `MeetingDetailScreen` via `get_mtb_transcripts`, matched by `session_id`; optional segments from `meeting_transcript_segments`. |
| Meeting-history polling while in progress | ✅ | MTB detail polls `fetchActiveMeeting` every 15 s; Meeting detail polls MoM every 15 s while pending/processing. |
| Server-verified speaker identity | ✅ | Ticket redeemed for display name prefill; `bind` associates the Jitsi participant with the authenticated profile (fail-soft). |

### 7.5 Roles and permissions (`FEATURES.md` → Roles and permissions)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Clinician: full access | ✅ | Default role. Case create/edit/delete, opinions, meetings. |
| SDC: full case parity, archive but no delete, no opinions/meetings | ✅ | `effectiveOwnerId = linked_clinician_id`; case creation writes to the linked clinician; delete hidden; Opinions tab replaced with an “unavailable” card; meeting button hidden; MTB case-add hidden. |
| MTB Expert: read-only cases/MTBs, may post opinions | ✅ | Case list is derived from MTB membership + `mtb_cases`; no create; meeting start disabled until someone else starts, then “Join Meeting”. |
| Role-based routing/navigation prefixes | 🟡 | Role-based UI is implemented, but the web’s `/`, `/sdc`, `/mtb-exp` URL prefixes do not exist in a native app. The concept maps to role state, not URLs. |
| Effective ownership for SDC | ✅ | Used consistently for case list, MTB ownership, case create, shareable MTBs. |
| Server-side enforcement (RLS/triggers) | ☁️ | Primary security boundary. Client checks are UX only. |

### 7.6 Document AI pipeline, client side (`FEATURES.md` → Document AI pipeline)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Presigned S3 upload flow | ✅ | `get-upload-urls` → multipart POST to S3 (new case); `get-upload-urls_4_new_documents` for existing cases. |
| Pipeline run tracking (initial/edit/regenerate/retry) | ✅ | `start_initial_run`, `start_regeneration`, `retry_case_run`, plus edit runs created by `commit_case_edits`. |
| Status and error reporting | ✅ | `get_case_run_state` + `describePipelineError` (verbatim web strings). |
| Case edit commits in one transaction | ✅ | `commit_case_edits` with `p_documents`, `p_delete_files`, `p_upload_files`, `p_additional_data`, `p_empty_action`; idempotent per `p_session_id`. |
| Polling for completion / summary availability | ✅ | `useCaseRunState`; Reports also polls document listing and refreshes signed URLs every 10 min. |

### 7.7 Notifications (`FEATURES.md` → Notifications)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| WhatsApp notifications (case created/shared, meeting started, opinion added) | ☁️ | Server triggers/Edge Functions; the app sends nothing. |
| Client notification toggle per MTB | ✅ | Switch in MTB detail. |

### 7.8 Theme and UI (`FEATURES.md` → Theme and UI)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Light / dark / system theme | 🟡 | Preference is persisted but the palette is hard-coded light. `userInterfaceStyle: automatic` only affects native chrome, not the JS UI. |
| Semantic colour tokens | ⚠️ | Not implemented as tokens. `src/theme/styles.ts` uses literal hex values (`#4A90E2`, `#111827`, …). The file is the single styling source, so a refactor to tokens is feasible. |
| Responsive phone/tablet | 🟡 | Flex/wrap layouts scale, but the app is portrait-locked and has no tablet-specific layout. |
| Toast notifications, modals, loading states | 🟡 | Modals (`FormModal`) and loading states exist; “toasts” are native `Alert`s. |
| Avatar display with fallback | ✅ | Initials fallback; signed URL cache; tap to fall back if the image fails. |

### 7.9 Onboarding (`FEATURES.md` → Onboarding)

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| First-time walkthrough (welcome / case / MTB / tips) | ⛔ | Not implemented. No onboarding flag is stored. |
| Sample case | ✅ | Local-only interactive sample. |
| Sample board | ✅ | Local-only MTB sample; actions show “disabled in the sample board” alerts. |

### 7.10 Feedback, settings, integrations

| Feature | Status | Implementation and notes |
| --- | --- | --- |
| Submit feedback (type + text) | ✅ | `FeedbackScreen` → `feedback` table; type is prefixed into the content (`[Bug] …`). |
| Profile editing | ✅ | Name, profession, hospital, WhatsApp number (change triggers re-verification), theme preference. |
| Archived cases shortcut | ✅ | Drawer entry. |
| Sign out | ✅ | Drawer bottom. |
| Supabase (Auth/Postgres/Storage/Realtime/Edge Functions) | ✅ | Realtime is not used; polling is used instead. |
| AWS S3 document upload/storage | ✅ | Presigned URLs; no long-lived credentials in the app. |
| Jitsi in-app meetings | ✅ | Native SDK, self-hosted deployment. |
| Google OAuth via Supabase | ✅ | Browser-based OAuth + PKCE. |
| WhatsApp (Gupshup) via Edge Functions | ✅ | `send_whatsapp_otp` / `verify_whatsapp_otp`. |

---

## 8. Subsystem deep dives

Each subsection ends with **“If it breaks”** — the first files/functions to inspect.

### 8.1 Authentication

**Google OAuth flow (most fragile part of the app):**

1. `Linking.createURL('auth/callback', { scheme: 'vmtb' })` builds the redirect.
2. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })` returns an authorize URL.
3. The URL is opened with `WebBrowser.openAuthSessionAsync`.
4. A `Linking.addEventListener('url', …)` also waits for the callback and accepts either `code=` or `error=`. `Promise.race` resolves whichever fires first.
5. `Linking.parse(result)` reads query params; an OAuth error surfaces its `error_description`.
6. `supabase.auth.exchangeCodeForSession(code)` completes sign-in.

There are temporary `console.log('[auth]', …)` diagnostics throughout. They are useful when debugging redirect problems; keep them until OAuth is stable across devices, then remove.

**The `locationPolyfill` problem (important):**

`@supabase/auth-js` decides it is in a browser when both `window` and `document` exist. The Jitsi SDK installs both globals. Supabase then calls `parseParametersFromURL(window.location.href)`, but Jitsi's polyfill sets `location.href = ''`, so `new URL('')` throws `TypeError: Invalid URL`. The result: Google login completes in the browser, then the app shows “Invalid URL”.

`src/lib/locationPolyfill.ts` is imported in `App.tsx` **before** the Jitsi SDK can install its shim. It sets `location.href = 'vmtb://auth/callback'` with no `sb_flow_id`, so Supabase falls back to the stored PKCE verifier. If Jitsi installed its shim first, the polyfill repairs `href` in place.

**Signup vs login vs reset:**

- **Signup** is unusual: the user must complete Google OAuth first, then fill the form, then verify WhatsApp. `verify_whatsapp_otp` receives the password and profile so the server can create a usable password login.
- **OTP login** is passwordless: the Edge Function returns an email and a one-time email token; the client exchanges it with `supabase.auth.verifyOtp`.
- **Password login** resolves phone → email server-side, then uses Supabase password auth.
- **Reset** uses a server-issued `reset_token` between the verify and password steps.

**Validation rules (client):** full name, profession and hospital required; role required; phone 7–15 digits; password non-empty; confirmation must match; SDC requires the linked clinician's phone (≥ 7 digits). Password strength is intentionally **not** validated client-side (user preference / web parity).

**If it breaks:**
- Google returns to the app but shows “Invalid URL” → check `src/lib/locationPolyfill.ts` import order in `App.tsx`.
- “Google sign-in was cancelled” → check the Supabase redirect allow-list and the `scheme` in `app.json`.
- Session works but the app bounces back to login → check `App.loadProfile` and `profiles.whatsapp_verified`.
- App hangs right after OAuth → someone awaited a Supabase query inside `onAuthStateChange`.

### 8.2 Case lifecycle and the AI pipeline

**Case statuses** (`summary_status`): `processing`, `unverified`, `verified`, `failed`.
**Report status** (`report_status`): `not_ready`, `unverified`, `verified` (nullable).
**Generations:** `content_generation`, `summary_generation`, `verified_generation`. A member sees a snapshot when `verified_generation !== content_generation`.

**Create flow:**

```
pick files ──► PDF/type/duplicate validation
           ──► POST /get-upload-urls                 (request_id, prefix, fields)
           ──► POST each file to presigned S3 URL     (multipart, RN {uri} part)
           ──► RPC generate_case_name
           ──► INSERT cases  (summary_status='processing', request_id)
           ──► INSERT case_documents
           ──► INSERT case_additional_documents (explanation)
           ──► RPC start_initial_run
                 └── on failure: POST /trigger-converter-files-to-png (fallback)
```

The fallback exists because the case row already exists at that point. Surfacing “Could not create the case” would make the user retry and create a duplicate. If even the fallback fails, the message is: “The case was created, but processing could not be started. Open the case and retry.”

**Run kinds:** `initial`, `edit`, `regenerate`, `retry`. Retry does not count against the 5-regeneration cap (server rule).

**Polling:** `useCaseRunState` calls `get_case_run_state` every 4 s while active, 30 s idle. Reading the RPC also expires runs that died while the app was closed.

**Triggering work:** after `start_*` or `commit_case_edits` returns a run id, the client calls `POST /trigger-apply-redaction-changes` with retries at 0 / 800 / 2400 ms for 5xx/network failures (web parity). If all fail, the error is “Your changes are saved, but processing couldn't be started.” — the run stays `pending` and Retry is available.

**User-facing error mapping** (`describePipelineError`, copied verbatim from the web app):

| Code | Message |
| --- | --- |
| `NOT_AUTHENTICATED` | You were signed out. Sign in again to save your changes. |
| `NOT_OWNER` | Only the case owner can change this case. |
| `NOTHING_TO_SAVE` | These changes were already saved. |
| `DOCUMENT_NOT_READY` | “X” is still being processed. You can redact it once processing finishes. |
| `DOCUMENT_NOT_FOUND` | “X” is no longer part of this case. |
| `DUPLICATE_DOCUMENT` | This case already has a document named “X”… |
| `INVALID_CHANGE` | One of the changes is invalid. Reload the case and try again. |
| `CASE_WOULD_BE_EMPTY` | This would leave the case with no documents or notes. |
| `RUN_IN_PROGRESS` | An update is already in progress… |
| `REGENERATION_LIMIT` | This case has reached its limit of 5 summary regenerations. |
| `NOTHING_TO_RETRY` | There is no failed update to retry. |
| `STALE_GENERATION` | This case changed since you opened it. Reload… |
| `SUMMARY_NOT_READY` | The updated summary isn’t ready yet… |
| `PATIENT_DETAILS_MISSING` | Add the patient’s age and sex before verifying. |
| `NETWORK` | Couldn’t reach the server… |

**If it breaks:**
- Case stuck at `processing` → `src/lib/useCaseRunState.ts` and `get_case_run_state`; check whether `/trigger-apply-redaction-changes` was reached (console `[pipeline] trigger failed`).
- Case created but documents missing → `createAndProcessCase` ordering: upload first, then DB rows.
- Summary never updates for a member → `memberSnapshot` condition in `CaseDetailScreen`.
- Regenerate disabled at 0/5 → `summary_regeneration_count` from the DB, not local state.

### 8.3 Summary and verification

`SummaryTab` keeps local draft state and deliberately **does not clobber edits** when polling refreshes the case (`if (editing) return`).

Rules:

- Editing is owner-only.
- `save()` sends the **current generation** so the server can reject stale writes (`STALE_GENERATION`).
- Verification requires age and sex; the client checks first, then the server enforces `PATIENT_DETAILS_MISSING`.
- After a verify, the client asserts the returned row is actually `verified`; otherwise it errors.
- Regeneration is capped at 5 both client-side (button label) and server-side.
- The “Done reviewing? / Verify Case” banner appears for an owner on an `unverified` summary (web parity).
- If `summary_status === 'failed'`, the owner sees the run’s error and a Retry button.

**Member snapshot:** when a member opens a case whose `verified_generation` is older than `content_generation`, the Summary tab shows the frozen `verified_snapshot` (summary, age, sex, cancer type) and an explanatory banner. Reports switches to **snapshot mode** and reconstructs the document list as of that generation using `case_documents` (`added_generation`, `deleted_generation`, `deleted_s3_key`) and `case_document_versions` (immutable per-version S3 keys), then signs those keys through `/get-reports?version_keys=…`.

**If it breaks:** `save_case_summary_edit` is the only write path; check generation values first. Snapshot bugs live in `ReportsTab.loadSnapshot` and `fetchCaseDocumentRows` / `fetchCaseDocumentVersions`.

### 8.4 Documents, reports and the viewer

**Listing:** `GET /get-reports?request_id=…` returns the current files. The client additionally filters names that are removed-but-not-yet-renamed in S3 using `case_documents.deleted_at` (`fetchRemovedDocumentKeys`). A name removed and later re-added is live again.

**Display names:** S3 reports are prefixed `ANO_NNCMFAGSSS_22246_`; `stripReportPrefix` removes it, and `toDocumentName` removes both prefix and extension to match `document_name` in the DB.

**Signed URLs** expire after ~15 minutes, so the Reports tab re-fetches the listing every 10 minutes while mounted.

**Adding documents to an existing case:**

1. `POST /get-upload-urls_4_new_documents` with `{ request_id }`.
2. Validate that the presigned fields include `x-amz-algorithm`, `x-amz-credential`, `x-amz-date`, `x-amz-security-token`, `policy`, `x-amz-signature`.
3. POST each file with the server's `key` template (`${filename}` substituted).
4. Stage uploads/removals/notes locally.
5. On save: upload files, then call `commit_case_edits` once with the full batch.
6. If the batch would empty the case (`CASE_WOULD_BE_EMPTY`), a modal offers “Add documents”, “Add your data” or “Archive case”. **Closing or leaving that modal archives the case** (web parity), using the same idempotent session id.

**Viewer (`DocumentViewer.tsx`):**
- PDF: download to cache with `File.downloadFileAsync(url, file, { idempotent: true })`, then render the **local file** with `react-native-pdf`. Passing the remote S3 URL directly left the viewer stuck at “0.00%” or “Could not render this PDF” because `react-native-blob-util`'s downloader failed on the signed URL.
- Image: remote `Image`.
- Text: `fetch(url).text()`.
- Other (doc/ppt): the caller downloads and opens the system share sheet (`expo-sharing`, fallback `Linking.openURL`).
- The modal is a `SafeAreaView` so the header clears the status bar, and shows the real error plus an “Open in browser” fallback.

**If it breaks:**
- Files not uploading → check `EXPO_PUBLIC_USE_RN_FETCH=1` first; then the presigned fields; then the RN `{uri}` FormData part.
- Upload works but list is empty → `/get-reports`, `request_id`, and the removed-document filter.
- PDF stuck / black → `DocumentViewer` download path; test the signed URL in a browser.
- Wrong document name → prefix/extension stripping helpers in `redaction.ts`.

### 8.5 Redactions (why mobile is read-only)

The web app has a full canvas redaction editor that commits `add`/`remove` regions through `commit_case_edits` with normalised bounding boxes in `[0,1]`.

On mobile, that editor is **not exposed**. “Edit redactions” shows:

> Editing redactions can be done on the website only. Open this case in a browser to edit its redactions.

`DocumentEditor.tsx` (a port of that editor) still exists in the repo, and `ReportsTab` still contains a `mode === 'edit'` branch that renders it, but **nothing sets `mode` to `'edit'`**, so it is currently dead code. Treat it as a starting point, not as a working feature. The supporting API surface is real and tested by the web app:

- `fetchRedactions(caseId, documentName)` — regions from `case_document_redactions`, `bbox` normalised, page is 0-indexed.
- `commitCaseEdits` — `action: 'add' | 'remove'`, `bbox`, `style`, `redaction_id`.
- `fetchOriginalsPageUrls` — signed page images for the original document (used only by `DocumentEditor`).

If mobile redaction editing is requested later, verify with the web team first: the server contract is settled, but the interaction design (pinch/pan boxes on a phone) is not.

### 8.6 Opinions

- **Questions** are case-level (`case_questions`) and visible to the board.
- **Opinions** are MTB-scoped (`case_opinions.mtb_id`). The tab picks the MTB from the navigation context, then the first board the case is shared with. If an MTB has no opinions, it falls back to legacy rows with `mtb_id IS NULL` (web parity).
- **Replies** are opinions with `parent_id`; they inherit the parent's `mtb_id`.
- **Answers** are opinions with `question_id` and no parent.
- Authors are anonymised in the UI: “You”, “Case Owner”, or “Anonymous XX” (last two characters of the user id). Real names are never shown.
- Only the author can edit their opinion; there is no delete.
- The like button is **local UI state only** — it is not persisted. Do not treat it as a feature.
- SDCs see an “Opinions unavailable” card (FEATURES.md rule).

**If it breaks:** `src/lib/api/opinions.ts` (scoping/fallback) and the recursive `OpinionCommentView` in `OpinionsTab.tsx`.

### 8.7 Treatment plan and follow-ups

Three sections, matching the web:

1. **vMTB discussion details** — discussion date (required), participants (free-text chips), consensus pathway, therapy recommendation.
2. **Evidence evaluation** — AMP level, ESCAT level, overall evidence strength.
3. **Treatment outcome** — implemented yes/no; if yes, initiation/discontinuation dates and treatment administered; if no, reason (one of six fixed codes), optional custom “other:...” text, alternative plan, and dates.

Validation strings are verbatim from the web. A plan that does not exist opens directly in edit mode for the owner. Follow-ups require an existing plan and support add/edit/delete with a confirmation.

**Data quirk:** custom “Other” reasons are stored as `other:<text>` in `non_implementation_reason` and parsed back on load. Do not change this format without migrating data.

**If it breaks:** `src/lib/api/treatment.ts` (upsert by existing plan id) and `TreatmentTab.load/save`.

### 8.8 MTBs and sharing

- Owner identity is the **effective owner** (SDC → linked clinician).
- `fetchMTBs` merges owned boards and membership boards, deduplicated by id; `member_count` adds 1 for the owner (the owner has no `mtb_members` row).
- Creating an MTB inserts directly into `mtbs` with a client-generated join code; joining uses the `join_mtb_by_code` RPC (server validates and inserts membership).
- Sharing a case requires `summary_status === 'verified'` and `archived_at == null`. Bulk sharing uses one insert into `mtb_cases`.
- Archive removes the case from all MTBs (server). Restore does **not** re-share.
- Meeting button gating:
  - clinician: “Start Meeting” or “Join Meeting”;
  - MTB expert: start disabled with “Waiting for someone else to start the meeting.”; “Join Meeting” when active;
  - SDC: no meeting UI.

**If it breaks:** `src/lib/api/mtbs.ts`; role gating in `MTBDetailScreen`; server RLS for membership writes.

### 8.9 Meetings (native Jitsi)

**Flow:**

```
MTBDetailScreen
  ├─ room = MTB name lowercased, non [a-z0-9-] removed, leading/trailing dashes trimmed
  ├─ RPC create_meeting_join_ticket(p_mtb_id, p_room_name) → 64-hex ticket
  ▼
MeetingWaitingScreen
  ├─ POST {JITSI_BACKEND_URL}/start-jitsi   header: X-Join-Ticket
  ├─ poll every 5 s, 30 s request timeout, 60 attempts (~5 min)
  ├─ two consecutive `already_running` responses required
  ├─ component statuses drive the UI (jvb / stt / proxy)
  ▼
MeetingLiveScreen
  ├─ redeem ticket → prefill display name (5 s timeout, fail-soft)
  ├─ JitsiMeeting(room, https://{JITSI_DOMAIN}, native prejoin)
  ├─ onConferenceJoined + local participant id → onLocalParticipantJoined
  ├─ bind ticket → meeting_participant_identity (attribution)
  ├─ participant join/leave → counts / leave columns
  ├─ leave / hardware back / readyToClose → mark left + end session
  ▼
MeetingDetailScreen
  └─ get_mtb_transcripts → match session_id → MoM, decisions, action items, discussion points
```

**Join ticket security:** the ticket is 64 hex characters, bound to `auth.uid()` when minted, and sent in the `X-Join-Ticket` header (never a query string). The activation endpoint rejects missing/expired tickets. `meetingIdentity` refuses malformed tickets client-side too.

**Analytics principles** (ported from the web, important):

1. The client only creates/updates **its own** records.
2. It never closes or modifies other meetings.
3. Stale meetings are **ignored** (2-minute heartbeat threshold), not closed.
4. A session is marked `ended` **only** when the local user explicitly leaves.
5. The client writes **no** `meeting_participants` rows on join — those come from the identity Edge Function. The only allowed participant write is the leave columns.

Heartbeat every 30 s; an extra heartbeat when the app is backgrounded. Cleanup ends the session on unmount so a ghost `active` row does not hold the VM.

**Meeting config:** native prejoin on with editable display name; welcome page off; start with mic/camera live; `analytics: { disabled: true }`; `disableThirdPartyRequests: true`; `'pip.enabled': false`.

**MoM status normalisation:** statuses arrive in mixed case (`Completed`, `COMPLETED`). The history list lowercases the status and treats any MoM content as completed for ended sessions, so badges are consistent.

**If it breaks:**
- Waiting screen times out → activation backend, join ticket expiry, `X-Join-Ticket` header, `JITSI_BACKEND_URL`.
- Jitsi opens but no events fire → the `isExternalAPIAvailable` patch (§11.3).
- Empty tile names or no attribution → `meeting_participant_identity` `redeem`/`bind`.
- Meeting stuck “active” after exit → `onLocalParticipantLeft` / unmount cleanup.
- MoM never appears → `get_mtb_transcripts`, session id vs Jitsi `meeting_id` mismatch (history uses `meeting_sessions.id`; transcripts carry the conference UUID).
- PiP crash on leaving → native PiP patch and `'pip.enabled': false`.

### 8.10 Profile, avatar and theme

- Profile columns are whitelisted in `PROFILE_COLUMNS`.
- Avatar upload: image picker (1:1, quality 0.8) → size check ≤ 2 MB → presigned upload → `profiles.avatar_key`.
- Avatar viewing: `GET /get-profile-photo-view-url?key=…` with a bearer token; URLs cached for 800 s per key, with in-flight de-duplication.
- Changing the WhatsApp number sends an OTP and routes to `verify-phone`. The number is **not** considered verified until the OTP succeeds.
- Theme: selectable and saved; not applied (see gaps).

### 8.11 Samples

`SampleCaseScreen` and `SampleBoardScreen` are entirely local: no network, no upload, no pipeline. They exist so new users can see the flow. Sample state resets when you leave. Screens are reachable from the drawer and from the create-case screen.

---

## 9. Backend contracts

Everything below is shared with the web app. **Do not invent new server behaviour in the client.**

### 9.1 Database tables read/written by the app

| Table | Used for |
| --- | --- |
| `profiles` | Role, name, profession, hospital, WhatsApp number/verification, avatar key, theme preference, linked clinician |
| `cases` | Owner-scoped case rows; direct writes for create/delete only |
| `cases_viewer_safe` | **Read path for case detail and shared cases** — the safe projection for viewers |
| `case_documents` | Document metadata, lifecycle (`added_generation`, `deleted_generation`, `deleted_s3_key`, `deleted_at`, `document_name`) |
| `case_document_versions` | Immutable per-version S3 keys used to reconstruct verified snapshots |
| `case_document_redactions` | Redaction regions (web editor; read by legacy mobile editor) |
| `case_questions` | Case-level questions |
| `case_opinions` | MTB-scoped opinions, replies (`parent_id`), answers (`question_id`) |
| `case_additional_documents` | Case explanation / “Your data” notes |
| `case_follow_ups` | Legacy follow-up rows loaded with the case (not edited by the current Treatment tab, which uses `case_treatment_followups`) |
| `case_treatment_plans` | One plan per case |
| `case_treatment_followups` | Longitudinal follow-ups |
| `mtbs` | Board name, join code, owner, notification toggle |
| `mtb_members` | Membership (owner is not a member row) |
| `mtb_cases` | Case sharing |
| `meeting_sessions` | Session lifecycle, heartbeat, duration, participant peak |
| `meeting_participants` | Join/leave rows (join written server-side; leave columns written by the client) |
| `meeting_transcripts` | MoM and transcript status |
| `meeting_transcript_segments` | Optional transcript segments |
| `feedback` | Feedback submissions |

### 9.2 RPCs

| RPC | Parameters | Used by |
| --- | --- | --- |
| `generate_case_name` | `p_abbreviation` | Create case |
| `archive_case` | `p_case_id` | Settings |
| `restore_case` | `p_case_id` | Settings / archived list |
| `save_case_summary_edit` | `p_case_id`, `p_generation`, `p_summary`, `p_patient_name`, `p_patient_age`, `p_patient_sex`, `p_cancer_type`, `p_verify` | Summary tab |
| `get_case_run_state` | `p_case_id` | Polling hook |
| `start_initial_run` | `p_case_id`, `p_session_id` | Create case |
| `start_regeneration` | `p_case_id`, `p_session_id` | Summary regenerate |
| `retry_case_run` | `p_case_id`, `p_session_id` | Failed run retry |
| `commit_case_edits` | `p_case_id`, `p_session_id`, `p_documents`, `p_delete_files`, `p_upload_files`, `p_additional_data`, `p_empty_action` | Reports save |
| `join_mtb_by_code` | `p_join_code` | Join MTB |
| `create_meeting_join_ticket` | `p_mtb_id`, `p_room_name` | Meeting start |
| `get_mtb_transcripts` | `p_mtb_id` | Meeting history, MoM |
| `find_clinician_by_phone` | `p_phone` | SDC signup |
| `phone_number_registered` | `p_phone`, `p_exclude_user_id` | Signup duplicate check |

### 9.3 Edge Functions

| Function | Actions / payload | Purpose |
| --- | --- | --- |
| `send_whatsapp_otp` | `{ phone, purpose?: 'login' \| 'signup' }` | Send a WhatsApp OTP |
| `verify_whatsapp_otp` | Signup payload; `{ action: 'login' }`; `{ action: 'get_email' }`; `{ action: 'reset_verify' }`; `{ action: 'reset_password' }` | Verify OTP, set password/profile, resolve email, reset password |
| `meeting_participant_identity` | `{ action: 'redeem', ticket }` / `{ action: 'bind', ticket, participant_id, meeting_session_id, display_name }` | Verified speaker identity and participant row |

`callFunction` in `src/lib/supabase.ts` unwraps `FunctionsHttpError` to surface the server's `error` string instead of the SDK's generic “non-2xx”.

### 9.4 AWS HTTP API (`API_BASE`)

`https://gzgrswe52e.execute-api.ap-south-1.amazonaws.com/dev`

| Method + path | Purpose |
| --- | --- |
| `POST /get-upload-urls` | Presigned upload config for a **new** case (returns `request_id`, upload URL, prefix, fields) |
| `POST /get-upload-urls_4_new_documents` | Presigned config for adding documents to an **existing** request |
| `POST /trigger-apply-redaction-changes` | Start processing for a saved run (`{ run_id }`) |
| `POST /trigger-converter-files-to-png` | Legacy/fallback processing trigger for a new case |
| `GET /get-reports?request_id=…` | List report files (signed URLs) |
| `GET /get-reports?request_id=…&filename=…` | Fresh URL for one file |
| `GET /get-reports?request_id=…&version_keys=a,b,c` | Signed URLs for specific version keys (snapshot mode) |
| `GET /get-originals?request_id=…&document_name=…` | Original page images (bearer token; web-only editor) |
| `GET /get-profile-photo-view-url?key=…` | Signed avatar URL (bearer token) |
| `POST /get-profile-photo-upload-url` | Presigned avatar upload (bearer token) |

### 9.5 Jitsi activation backend

`POST {JITSI_BACKEND_URL}/start-jitsi`

- Header: `X-Join-Ticket: <64 hex>`
- Response: `{ status: 'starting' | 'already_running', components: { jvb, stt, proxy… } }`
- 401 without a valid ticket.

### 9.6 Storage layout

- New-case documents: `uploads/{request_id}/data/…`
- Anonymised reports: `uploads/{request_id}/data/ANO_NNCMFAGSSS_22246_{document_name}.pdf`
- Versioned files: the keys stored in `case_document_versions.s3_key` (verified snapshots)
- Removed documents: may live under `deleted_s3_key` until the pipeline renames them
- Avatars: presigned keys returned by `get-profile-photo-upload-url`

The anonymisation prefix `ANO_NNCMFAGSSS_22246_` is duplicated in `redaction.ts` and `ReportsTab.tsx`. If the pipeline ever changes it, both must change.

### 9.7 Role rules (server-enforced, mirrored client-side)

- SDC writes are attributed to the linked clinician (`effectiveOwnerId`).
- SDC cannot delete cases (`trg_cases_delete_role`), post opinions, or use meetings.
- MTB Expert cannot create cases or start meetings; can post opinions.
- Phone verification, roles, linked clinician, OTP actions, meeting tickets, archive state and pipeline transitions are **server-authoritative**.
- Never bypass these with direct client writes.

---

## 10. Build and release pipeline

### 10.1 Local setup

```bash
source ~/.nvm/nvm.sh
nvm use 24
cd /home/harish/Code/DCP/vmtb-android-app
npm install                 # runs postinstall → patch-package
cp .env.example .env        # fill in the five values
```

### 10.2 Running against Metro (development)

```bash
npx expo start --dev-client --tunnel
# or
npm run android
```

Development builds load JS from Metro and read the **local** `.env`. A JS change only needs a reload; a native change needs a new dev APK.

### 10.3 Checks before every handoff

```bash
npx tsc --noEmit
npx expo-doctor
```

If `android/` exists from a local prebuild, `expo-doctor` fails the “non-CNG project” check. Remove it first:

```bash
rm -rf android
```

### 10.4 Preview APK (manager demos)

```bash
npx eas build --platform android --profile preview
```

- Produces an installable APK, internal distribution.
- `autoIncrement: true` bumps the version code.
- Uses the EAS **preview** environment values.
- Runs `npm install` (patch-package), `expo prebuild`, then Gradle `:app:assembleRelease`.

### 10.5 Production

```bash
npx eas build --platform android --profile production
```

Produces an AAB for the store. **Before shipping to a store, re-enable R8** and validate (see §13).

### 10.6 What prebuild does

1. Generates `android/`.
2. Copies `app.json` config (package, permissions, icon, splash).
3. Applies config plugins:
   - `@config-plugins/react-native-webrtc` — WebRTC native wiring;
   - `with-jitsi-gradle-plugin-version` — injects `rootProject.ext.gradlePluginVersion` from React Native's `libs.versions.toml` (Jitsi reads it while configuring its module);
   - `with-proguard-keep-rules` — appends keep/dontwarn rules and **disables R8 minification**.
4. Gradle builds the release APK.

### 10.7 Native patches

`package.json` has `"postinstall": "patch-package"`. `patches/@jitsi+react-native-sdk+13.3.0.patch` contains three changes:

1. `react/features/mobile/react-native-sdk/functions.js` — `isExternalAPIAvailable()` uses `ExternalAPI != null`.
2. `react/features/mobile/external-api/functions.ts` — `sendEvent()` uses optional chaining.
3. `android/.../PictureInPictureModule.java` — catches `Exception` instead of `RuntimeException`.

**Never hand-edit `node_modules`.** Change the patch (`npx patch-package @jitsi/react-native-sdk`) and commit it. If `npm install` is ever run without the postinstall hook, these fixes disappear and the meeting crashes return.

---

## 11. Troubleshooting playbook

### 11.1 First question: JS reload or new APK?

| Change | Action |
| --- | --- |
| `.ts`/`.tsx` only, dev client | Reload Metro |
| `.env` values, local dev | Restart Metro with `--clear` |
| `app.json`, native dependency, config plugin, patch | New APK |
| EAS environment values | **New build** (values are inlined) |
| Anything on a standalone preview/production APK | New build |

### 11.2 Diagnosing a crash on a standalone APK

```bash
adb logcat -c
adb logcat | grep -i "AndroidRuntime\|FATAL\|Exception\|BridgelessReact"
```

Open the app, then read the first fatal block. Common signatures:

| Log signature | Meaning | Fix location |
| --- | --- | --- |
| `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` + `SIGABRT` | An `EXPO_PUBLIC_*` value is missing or quote-wrapped | EAS env values; `src/lib/env.ts`; `src/lib/supabase.ts` |
| `Missing class org.webrtc.Dav1dDecoder$Natives` at `:app:minifyReleaseWithR8` | R8 stripped a JNI-reached class (build fails) | `plugins/with-proguard-keep-rules.js` |
| App builds but crashes immediately in release | R8/minification still on | Same plugin sets `android.enableMinifyInReleaseBuilds=false` |
| `Cannot read property 'sendEvent' of null` after unmuting | Jitsi external-API middleware registered on Android | Jitsi patch (`isExternalAPIAvailable`, optional chaining) |
| Crash on leaving a meeting / PiP | PiP module uncaught exception | Jitsi patch + `'pip.enabled': false` |
| `NoSuchFieldException: GOOGLE_SERVICES_ENABLED / LIBRE_BUILD / SDK_VERSION` | Benign Jitsi reflection warnings, **not** the crash | Ignore |
| `Unsupported FormDataPart implementation` | Expo fetch rejects RN file parts | `EXPO_PUBLIC_USE_RN_FETCH=1` |
| `Invalid URL` after Google login | Jitsi shim replaced `window.location` | `src/lib/locationPolyfill.ts` |
| `AbortError` when leaving the waiting screen | Expected cleanup abort | `meetingService.callStartJitsi` suppresses it |

### 11.3 Case study: the preview APK launch crash

**Symptom:** preview APK (version code 5, commit `fe13c1f`) aborted on launch. Logcat showed:

```
unknown:BridgelessReact: ReactHost{0}.handleHostException(
  message = "[runtime not ready]: Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.")
libc++abi: terminating due to uncaught exception … JavascriptException
Fatal signal 6 (SIGABRT)
```

**Diagnosis steps that mattered:**

1. Confirmed it was not R8 (the build succeeded and this was a JS exception).
2. Read `src/lib/supabase.ts`: a missing URL would have thrown our own “Add EXPO_PUBLIC_…” error, so the value existed but was invalid.
3. Compared environments:
   - `development`: `EXPO_PUBLIC_SUPABASE_URL=https://…`
   - `preview` and `production`: `EXPO_PUBLIC_SUPABASE_URL="https://…"` ← literal quotes
4. Confirmed inlining by exporting locally and grepping the Hermes bundle.

**Root cause:** EAS stored the values with surrounding double quotes; the inlined URL started with `"`, so `createClient()` rejected it during module init. Dev builds were unaffected because they read the local `.env` (dotenv strips quotes).

**Fix:**

- Re-set all five `EXPO_PUBLIC_*` values in `preview` and `production` with `--visibility plaintext` and no quotes.
- Added `src/lib/env.ts` to strip quotes/whitespace defensively, plus an explicit protocol check that throws a readable message.

**Verification:** `npx expo export --platform android`; bundle contained the bare URL. `npx tsc --noEmit` clean.

### 11.4 Case study: R8 release build failure

**Symptom:** `:app:minifyReleaseWithR8` failed:

```
ERROR: R8: Missing class org.webrtc.Dav1dDecoder$Natives
  (referenced from org.webrtc.Dav1dDecoderJni.get() and 2 other contexts)
```

**Cause:** R8 cannot see JNI/reflection-only classes and treats them as hard errors.

**Fix:** `plugins/with-proguard-keep-rules.js` appends:

```
-dontwarn org.webrtc.**
-keep class org.webrtc.** { *; }
-dontwarn org.jitsi.**
-keep class org.jitsi.** { *; }
```

Build then succeeded but the release APK still crashed at startup, so the same plugin also sets `android.enableMinifyInReleaseBuilds=false` in `gradle.properties`. This keeps preview/production stable for demos at the cost of a larger binary. **This is a deliberate temporary trade-off, not a production-hardening decision.**

### 11.5 Case study: Jitsi `sendEvent of null`

- **Symptom:** `TypeError: Cannot read property 'sendEvent' of null`, only after unmuting and speaking, from a `RTCDataChannel` message handler.
- **Cause:** Android ships **no** `ExternalAPI` native module. Jitsi checked `ExternalAPI !== null`, but an absent module is `undefined`, so it wrongly registered the external-API middleware. Its `sendEvent()` then dereferenced the missing module when a data-channel message arrived (dominant-speaker change).
- **Second effect:** the same mis-registration made the SDK skip its `!externalAPIEnabled` guard, so every `JitsiMeeting` event listener (`onConferenceJoined`, `onParticipantJoined`, `onParticipantLeft`, `onReadyToClose`) was **dead on Android**. That broke session creation and identity binding.
- **Fix:** `ExternalAPI != null` + optional chaining, captured in the patch. Confirmed working on device.

### 11.6 Case study: PDF viewer stuck at 0.00%

- **Symptom:** `react-native-pdf` with the remote signed S3 URL stayed at “0.00%” / “Could not render this PDF”.
- **Cause:** its internal `react-native-blob-util` downloader failed on the signed URL.
- **Fix:** download first with `expo-file-system` (`File.downloadFileAsync(..., { idempotent: true })`) to the cache, then give `react-native-pdf` the local file URI. The share flow already used this path successfully.

### 11.7 Useful commands

```bash
# attach a device
adb devices

# crash logs
adb logcat -c && adb logcat | grep -i "AndroidRuntime\|FATAL\|Exception\|BridgelessReact"

# EAS build history / details
npx eas build:list --platform android --limit 5
npx eas build:view <build-id>
npx eas build:view <build-id> --json      # includes signed log URLs

# env inspection
npx eas env:list --environment preview
npx eas env:list --environment production

# verify inlining without a cloud build
npx expo export --platform android
strings dist/_expo/static/js/android/*.hbc | grep -oE 'https?://[a-z0-9.-]+supabase\.co'
rm -rf dist

# prebuild smoke test (then remove android/)
npx expo prebuild --platform android --clean
grep -n "enableMinifyInReleaseBuilds\|org.webrtc" android/gradle.properties android/app/proguard-rules.pro
rm -rf android
```

---

## 12. Testing and QA

### 12.1 Automated checks

There are **no unit, integration or E2E tests**. The enforced baseline is:

- `npx tsc --noEmit` — must be clean;
- `npx expo-doctor` — must pass all checks (except known upstream patch drift; see §13).

Add tests where it matters most if the team grows: pipeline error mapping, `deriveRoomName`, `toDocumentName`/`stripReportPrefix`, snapshot reconstruction, and role gating.

### 12.2 Manual device smoke test (release/near-release)

**Auth**

1. Fresh install → Google sign-in → abandoned at signup → reopen app → returns to signup.
2. Complete signup with WhatsApp OTP (try all three roles; verify SDC requires a real clinician phone).
3. Log out → phone + password login.
4. Log out → OTP login.
5. Forgot password → OTP → new password → log in.
6. Profile → change WhatsApp number → OTP → verified.

**Cases**

7. Create a case with a PDF, an image and a text file; confirm the PDF > 50 pages is rejected and duplicate names are rejected.
8. Confirm the case appears as `processing`, then becomes `unverified` with a summary.
9. Edit the summary, save, verify (blocked without age/sex; then succeeds).
10. Regenerate once and confirm the counter decrements; confirm the 5-cap message.
11. Add a document and notes in Reports; confirm the summary regenerates and needs verification.
12. Open the PDF viewer (download → render), an image, and a text file; share a .doc file.
13. Ask a question, post an opinion, reply to it, edit your own opinion.

**MTBs**

14. Create an MTB; copy the join code; join from a second account.
15. Share a verified case; verify it appears for the member; confirm unverified cases cannot be shared.
16. Rename, toggle notifications, remove a case, leave the MTB.

**Meetings** (two devices)

17. Start a meeting; confirm the waiting screen progress and native prejoin name.
18. Join from device B; confirm two-way audio/video, participant counts.
19. Unmute and speak — no `sendEvent` errors.
20. Background and foreground; leave from A; confirm B stays until it leaves.
21. Open the meeting history; confirm MoM/decisions/action items appear when transcription completes.

**Archive/delete**

22. Archive a case shared with an MTB; confirm it disappears and is removed from the MTB; restore it.
23. Delete a case as clinician (type confirmation); confirm child rows are gone. Confirm SDC has no delete UI.

**Theme**

24. Change the preference; confirm it persists after restart. **The UI will still be light** — expected today.

---

## 13. Known gaps, limitations and technical debt

### Product gaps

| Gap | Detail |
| --- | --- |
| Dark/system theme not applied | Preference is stored, palette is light-only. `app.json` says `automatic` but the JS UI ignores it. |
| Onboarding walkthrough missing | Sample case/board exist, but no first-run walkthrough or “seen onboarding” flag. |
| Redaction editing unavailable | Explicitly website-only. `DocumentEditor.tsx` is dead code today. |
| No redaction history/originals UI | API exists; mobile only shows verified-generation document versions. |
| “Toasts” are Alerts | No toast component; ~30 modal alerts. |
| Tablet layouts not designed | Portrait-locked; flex layouts only. |
| Like button not persisted | Local state only in Opinions. |
| Sample state not persisted | Resets on leave, by design but worth knowing. |
| Camera switching / large meetings untested | Device matrix gap. |
| PDF viewer final confirmation pending | Implementation changed after last device test. |

### Technical debt and risks

1. **R8 minification is disabled for all release builds.** APKs are larger and not optimized. Re-enabling requires validating the keep rules with a real device pass, and possibly more rules (e.g. reflection-based serializers). Do not simply flip the flag before a store release.
2. **Client-side cascade delete is not transactional.** `deleteCaseCascade` deletes child tables with `Promise.all` and then the case. A failure midway leaves orphaned or partially deleted data. The web behaves the same; a server RPC would be safer.
3. **Theme colours are hard-coded** across `styles.ts` and inline styles. A theme feature requires converting to tokens first.
4. **No automated tests.**
5. **Patch fragility:** `@jitsi/react-native-sdk` is declared as `^13.3.0` but the patch filename is `13.3.0`. A minor bump would silently break `patch-package` and reintroduce the meeting crash. Pin it exactly or regenerate the patch on every bump.
6. **`expo-doctor` version drift:** Expo SDK patch releases can make doctor report mismatches (e.g. `expo 58.0.22` vs `~58.0.23`). This is not caused by app code; resolve deliberately with `npx expo install --fix` and a full device pass.
7. **`@react-native-google-signin/google-signin` is installed but unused.** Google auth is browser-based via Supabase. Remove only after confirming no native dependency relies on it.
8. **Anonymisation prefix is duplicated** in two files.
9. **App identity is tied to a personal account:** package `com.harishbabu2007.vmtb`, EAS owner `harishbabu2007`. Before team ownership, transfer the EAS project/org and decide whether to keep the package id (changing it breaks existing installs and redirects).
10. **No offline/retry queue.** Network failures surface as alerts; uploads must be retried manually.
11. **No structured logging/telemetry.** Console logs only; no crash reporting (Sentry/Crashlytics) is wired.
12. **Signed URL lifetime assumptions** (10-minute refresh, 15-minute expiry, 800 s avatar cache) are hard-coded. If the backend changes TTLs, update these constants.
13. **Polling instead of Realtime.** The app polls cases (4/30 s), lists (7 s), meetings (15 s), reports (10 min). This is simple and reliable but costs requests and adds latency.

### Security notes

- RLS and server RPCs are the security boundary; client role checks are UX.
- The anon key is public by design; **never** add a service-role key to the client.
- Always use `cases_viewer_safe` for shared/viewer case data.
- Meeting join tickets are bearer-like secrets: header-only, never logged, validated server-side.
- Do not log OTPs, tokens or patient data.

---

## 14. Recommended roadmap

Ordered by user impact and risk:

1. **Re-verify the current preview APK on device** (startup, PDF viewer, uploads) and record results.
2. **Finish theme support**: introduce semantic colour tokens, define light/dark palettes, honour `theme_preference` and `useColorScheme()`.
3. **Decide on mobile redactions**: either delete the dead `DocumentEditor` path and keep the explicit web-only message, or invest in a touch-friendly editor (product decision).
4. **Add automated tests** for pure logic (error mapping, name derivation, snapshot reconstruction) and a small component test harness.
5. **Add crash reporting** (Sentry or Crashlytics) before wider rollout.
6. **Re-enable R8** with a validated keep-rule set and a release device pass; measure APK size and startup time.
7. **Move cascade delete server-side** into an RPC for atomicity.
8. **Onboarding**: implement the first-run walkthrough already designed on the web, gated by a profile flag.
9. **Tablet layouts** and dark-mode screenshots as part of a UI pass.
10. **Pin Jitsi exactly** and document the patch regeneration procedure.
11. **Consolidate duplicated constants** (anonymisation prefix, polling intervals, signed-URL TTLs) into one config module.
12. **Meeting QA matrix**: camera switch, 4+ participants, poor network, app backgrounding during transcription.

---

## Appendix A — commit history

The repository history is intentionally small and readable:

| Commit | Summary |
| --- | --- |
| `8e2cb51` | Initial commit |
| `78d8964` | Add native in-app Jitsi meetings and upgrade to Expo SDK 58 |
| `78657ad` | Port full Case Management parity from the web app (Phases 0-10) |
| `1e78a73` | Add app icon, splash screen, and release APK build config |
| `62b3c36` | Fix device-reported case management & meeting UI bugs (verify banner, raw status leak, keyboard avoidance, PDF viewer rewrite, PiP disable, MoM casing) |
| `951005c` | Add `EXPO_PUBLIC_USE_RN_FETCH` to `.env.example` |
| `2d2d243` | Fix release build R8 minification failure (missing `org.webrtc.Dav1dDecoder`) |
| `fe13c1f` | Disable R8 minification in preview/production builds |
| `3514eba` | Normalize `EXPO_PUBLIC_*` values to fix startup crash |

The device-reported bug commit (`62b3c36`) contains the changes made after the first manager demo attempt. It is a useful reference for the kind of issues that only appear on a real phone.

---

## Appendix B — release checklist

Before handing an APK to anyone:

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npx expo-doctor` passes (or every warning is understood and documented).
- [ ] `android/` is not left on disk.
- [ ] Every `EXPO_PUBLIC_*` exists in the target EAS environment.
- [ ] Every value is **plaintext/public** and **not quote-wrapped** (`eas env:list`).
- [ ] `EXPO_PUBLIC_USE_RN_FETCH=1` is present.
- [ ] Supabase redirect URLs include `vmtb://auth/callback`.
- [ ] `patches/` is committed and `postinstall` still runs `patch-package`.
- [ ] Version code auto-increments (preview/production).
- [ ] Build succeeds through `:app:assembleRelease`.
- [ ] Install on a physical device; complete the smoke test in §12.2.
- [ ] Confirm the app reaches login (no startup `SIGABRT`).
- [ ] Confirm an upload works (proves RN fetch + presigned fields).
- [ ] Confirm a PDF opens (proves the download-then-render path).
- [ ] Confirm a two-device meeting works, including unmute-and-speak.
- [ ] Note whether a JS reload or a new APK is required for the next change.

---

## Appendix C — glossary

| Term | Meaning |
| --- | --- |
| **MTB** | Molecular Tumour Board — a board of experts discussing a case |
| **MoM** | Minutes of Meeting — AI-generated meeting summary, decisions and action items |
| **SDC** | Site Data Coordinator — a role that manages cases on behalf of a linked clinician |
| **Effective owner** | The user id that owns data for the current account; for an SDC this is the linked clinician |
| **Case** | A patient case: documents + AI summary + discussions + treatment |
| **Generation** | A monotonically increasing counter for content/summary/verification state |
| **Snapshot** | The frozen summary/documents at the owner's last verification, shown to members |
| **Run** | One pipeline execution: `initial`, `edit`, `regenerate`, `retry` |
| **Verification** | The owner's act of locking the current summary and making it shareable |
| **Join ticket** | A 64-hex, user-bound, expiring secret used to boot/join the Jitsi VM |
| **CNG** | Continuous Native Generation — Expo generating `android/` from config |
| **R8** | Android code shrinker/minifier used for release builds |
| **Dev client** | A custom Expo runtime that can load the app's native modules (unlike Expo Go) |

---

## Appendix D — How the app was built (chronological history)

This is the order in which the work actually happened. Read it to understand *why* the code looks the way it does; the commit table in Appendix A is the one-line version.

### Step 0 — Bootstrap (`8e2cb51`)

- Created the Expo/TypeScript project and the initial folder layout.
- Set up the Supabase client with **AsyncStorage persistence + PKCE** (`detectSessionInUrl: false`, because React Native has no browser URL to detect).
- Built the first auth screens and the `App.tsx` session/screen state machine that still drives navigation today.
- Established the convention that `docs/FEATURES.md` + the web app are the contract, and that the server (RLS/RPC/Edge Functions) is authoritative.

### Step 1 — Native in-app meetings and the Expo 58 upgrade (`78d8964`)

The largest and riskiest step (86 files). It introduced the native Jitsi SDK and forced an SDK upgrade.

- Added `@jitsi/react-native-sdk` + `react-native-webrtc` and the `@config-plugins/react-native-webrtc` config plugin.
- Upgraded **Expo 57.0.31 → 58.0.22**, **RN 0.86.3 → 0.88.1**, **React 19.2.3 → 19.3.0**, all `expo-*` to 58.x.
- **Pinned `react-native-webrtc` at 155.0.0** and excluded it from Expo dependency checks (`expo.install.exclude`) — the Jitsi SDK is sensitive to this version. Never bump it casually.
- Ported the web meeting flow: join-ticket RPC → waiting room that boots the self-hosted Jitsi VM → native `JitsiMeeting` → analytics/heartbeat → identity bind → MoM detail.
- Discovered and patched the Jitsi **`sendEvent of null`** bug (see §11.5 and AGENTS.md). The patch file (`patches/@jitsi+react-native-sdk+13.3.0.patch`) plus the `postinstall: patch-package` hook is the mechanism that keeps that fix alive across installs.
- Added `src/lib/locationPolyfill.ts`: the Jitsi SDK installs `window`/`document`/`location` shims, which flips Supabase auth-js into "browser" mode and breaks the Google OAuth PKCE exchange with `TypeError: Invalid URL`. Import order in `App.tsx` is load-bearing.
- Disabled PiP, analytics and third-party requests in the meeting config to match web behaviour and avoid Android-only crash paths.

### Step 2 — Case-management parity in phases 0–10 (`78657ad`)

The app was built feature-by-feature against the web app, in phases, porting **server contracts verbatim** and only then adapting the UI:

1. Types and shared helpers (`types.ts`, `src/lib/api/config.ts`, `base64.ts` because Hermes has no `atob`).
2. Case list: statuses, search, sort, archived mode, 7 s refresh while anything is processing.
3. Create-case wizard: document picking, PDF page-count check, duplicate-name check, cancer-type search (418 types), explanation text.
4. Presigned S3 upload (`/get-upload-urls`), case row insert, `start_initial_run`, fallback converter trigger.
5. Case detail shell with five tabs and generation-aware locking (tabs unlock after the first verify).
6. Summary tab: draft state, save/save-and-verify, regenerate cap, failed-run retry, owner-only editing, member snapshot.
7. Reports tab: listing, signed URL refresh, version/original helpers, snapshot reconstruction, staged add/remove/notes, `commit_case_edits`.
8. Opinions (questions, threaded opinions, MTB scoping, anonymised author labels) and Treatment (plan + follow-ups, verbatim option sets and validation strings).
9. Settings (MTB sharing, archive/restore, clinician-only cascade delete) and MTBs (list, create/join by code, detail, rename, leave, notifications, meeting launcher + history).
10. Profile, feedback, phone re-verification, samples, and the remaining shared UI primitives.

Result: one commit, but functionally the bulk of the product. The style is deliberately "port the web behaviour first, then make it native".

### Step 3 — Branding and release configuration (`1e78a73`)

- Added the app icon and splash screen, the Android package id `com.harishbabu2007.vmtb`, and the EAS `preview` profile that produces an installable APK with `autoIncrement`.
- Added the local config plugins (`with-jitsi-gradle-plugin-version`, `with-proguard-keep-rules`) needed for a release Gradle build.
- From this point on, delivery was **EAS preview APKs** for demos rather than dev-client builds.

### Step 4 — First device-demo bug pass (`62b3c36`)

The first APK build surfaced bugs that never appear in the dev client. Fixed in one commit:

- Restored the web's **"Done reviewing? / Verify Case"** banner.
- Removed raw backend values leaking into the UI (`Documents: not_ready`, `Reports: not_ready`).
- Fixed card spacing and made question cards stack vertically.
- Android keyboard avoidance (`behavior='height'`) so focused fields stay visible.
- "Edit redactions" now explains it is website-only instead of silently doing nothing.
- Rewrote the document viewer: download with `expo-file-system` and render the **local** file (the remote signed URL made `react-native-pdf` hang at 0.00%).
- Disabled PiP and broadened the native PiP exception catch.
- Normalised MoM status casing so history badges are consistent.

### Step 5 — Upload failure (`951005c`, plus env change)

Every upload failed with `Unsupported FormDataPart implementation`. Cause: Expo SDK 58's patched `fetch`/`FormData` rejects React Native's `{ uri, name, type }` file parts. Fix: `EXPO_PUBLIC_USE_RN_FETCH=1`, which keeps RN's native `fetch`. Documented in `.env.example` and set in every EAS environment.

### Step 6 — R8 release-build failure (`2d2d243` → `fe13c1f`)

- `:app:minifyReleaseWithR8` failed on `Missing class org.webrtc.Dav1dDecoder$Natives` (JNI-only class invisible to R8).
- Added keep/dontwarn rules for `org.webrtc.**` and `org.jitsi.**` via a config plugin.
- The build then succeeded but the release APK still crashed on launch, so R8 minification was disabled entirely (`android.enableMinifyInReleaseBuilds=false`) as a deliberate stabilisation trade-off.

### Step 7 — Startup crash on the standalone preview APK (`3514eba`)

- Symptom: instant `SIGABRT` with `[runtime not ready]: Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.`
- Root cause: EAS **preview/production** environments stored the `EXPO_PUBLIC_*` values wrapped in literal double quotes (development did not). Standalone builds inline those values, so the URL began with `"`.
- Fix: re-set all five variables unquoted with `--visibility plaintext`, and added `src/lib/env.ts` (`publicEnv()`) to strip quotes/whitespace defensively, plus a clearer protocol error in `src/lib/supabase.ts`.
- Verification trick that avoided burning a cloud build: `npx expo export --platform android` then `strings` on the generated `.hbc` to confirm the inlined values.

### Step 8 — Documentation (this file)

Written after the crash fix so that the next developer starts from a correct mental model instead of re-deriving the above from git history and logcat.

### Key design decisions and why

| Decision | Rationale | Trade-off |
| --- | --- | --- |
| No React Navigation; a `screen` string in `App.tsx` | ~20 screens, one linear flow, explicit back rules; fewer native dependencies and no deep-link stack to maintain | Manual back handling; adding a screen touches three places |
| Polling instead of Supabase Realtime | Matches web behaviour exactly; no channel lifecycle bugs on mobile | Extra requests, up to a few seconds of latency |
| Native Jitsi SDK (not a WebView) | Real WebRTC, native prejoin, background/audio behaviour, transcription parity | Version pinning, patch maintenance, Gradle/R8 pain |
| Redaction **editing** left on the web | Touch interaction for drawing/panning boxes is unsolved; the web canvas is the source of truth | Mobile users must switch to a browser for that task |
| Markdown textarea, not WYSIWYG | Reliable on Android keyboards; `react-native-markdown-display` renders the same content | Owners lose the web's toolbar editing experience |
| Client-side cascade delete | Web parity; the web does the same sequence | Not transactional — see §13 debt item 2 |
| R8 minification off for release | Demo stability while keep rules were unproven | Larger, unoptimised APK; must be revisited before store release |
| All config via `EXPO_PUBLIC_*` | Client config is public by design; one mechanism for dev and EAS | Values are inlined at build time, so changing them needs a new build |
| Server-authoritative permissions | RLS/triggers/RPCs are the security boundary; client checks are UX only | Client must mirror rules to avoid confusing dead buttons |

---

## Appendix E — Contributor recipes

Practical how-tos for the changes you will most likely need to make. Every recipe ends with the same rule: **match the web app's contract first, then adapt the UI.**

### E.1 Add a new screen

1. Add the id to `Screen` in `src/types.ts`.
2. Create `src/screens/<area>/<Name>Screen.tsx` and wrap content in `<Page title=… onBack=…>` so the header, safe area and Android keyboard behaviour come for free.
3. Add a `case` in `src/screens/FeatureRouter.tsx`.
4. Add an entry to `goBack()` in `App.tsx` if the default (`home`) is wrong.
5. If it needs data, add functions to `src/lib/api/*` (never inline Supabase calls in a screen — the existing screens follow the API-module pattern).
6. If it needs an entity id, add state next to `activeCaseId` / `activeMtbId` / `activeMeetingId` in `App.tsx` and pass it through `FeatureScreenProps`.

### E.2 Add or change a data call

- **Database read/write:** add a typed function in the relevant `src/lib/api/<area>.ts` using the shared `supabase` client. Throw an `Error` with user-facing copy; let the screen render it through `<ErrorBox>` / `Alert`.
- **Shared/viewer case data:** always use `cases_viewer_safe`, never `cases`.
- **Edge Function:** use `callFunction(name, body)` from `src/lib/supabase.ts` — it unwraps `FunctionsHttpError` so the server's `error` string reaches the UI.
- **AWS HTTP API:** use `API_BASE` from `src/lib/api/config.ts`; wrap non-2xx responses in a sentence a clinician can act on (see `uploads.ts` / `redaction.ts`).
- **Errors from the pipeline:** map codes through `describePipelineError` in `src/lib/api/pipeline.ts`; do not invent new strings without checking the web app.

### E.3 Add or change an RPC call

1. Read the web app's call site and copy the RPC name and `p_*` parameter names exactly.
2. Add the call in the relevant API module, typed with an interface for the response.
3. Test with **each role** (clinician, SDC, MTB expert) and with a non-owner account — RLS failures look like empty results, not always errors.
4. If the RPC changes pipeline state, make sure the client still calls the trigger endpoint afterwards (`triggerApplyRedactionChanges`) and that `useCaseRunState` will pick it up.

### E.4 Debug an upload

In this order:

1. Is `EXPO_PUBLIC_USE_RN_FETCH=1` set **in the environment that built the APK**? (`Unsupported FormDataPart implementation` means it is not.)
2. Did `/get-upload-urls` (or `…_4_new_documents`) return `request_id`, `uploadUrl`, `prefix` and `fields`?
3. Are the presigned fields all present (`x-amz-algorithm`, `x-amz-credential`, `x-amz-date`, `x-amz-security-token`, `policy`, `x-amz-signature`)?
4. Is the S3 `key` template using the correct `${filename}` substitution?
5. Is the file extension in `ALLOWED_EXTENSIONS` and under the size limit (avatars ≤ 2 MB)?
6. Is the FormData part still React Native style (`{ uri, name, type }`)?

### E.5 Debug a stuck case ("processing" forever)

1. Call `get_case_run_state` by opening the case — reading it also expires dead runs, so a stale state usually turns into `failed` on its own.
2. Check `src/lib/useCaseRunState.ts` is mounted and polling (4 s active / 30 s idle).
3. Check the console for `[pipeline] trigger failed` — the trigger endpoint (`/trigger-apply-redaction-changes`) has retries at 0/800/2400 ms; if all fail the run stays `pending` and the UI should offer Retry.
4. Confirm the server actually started the run (`start_initial_run` response contains a run id).
5. If the run is `failed`, show `describePipelineError(run.error_code)` and offer `retry_case_run`.

### E.6 Debug a PDF that will not render

1. Open the signed URL in a browser: if it 403s/expires, the problem is URL freshness, not the viewer.
2. Confirm the viewer took the **download-then-render** path (`File.downloadFileAsync(url, file, { idempotent: true })`), not the remote URL.
3. Check the local file exists and is non-zero bytes; `react-native-pdf` failing silently usually means a bad/empty local file.
4. Only then look at `react-native-pdf` itself.

### E.7 Add a role-gated action

1. Decide which role may use it and whether SDCs write as the **effective owner** (`effectiveOwnerId`) — if yes, pass that id, never `userId`.
2. Add the guard in the screen (hide or explain, never silently no-op).
3. Confirm the server enforces the same rule; if it does not, stop and fix the server contract instead of relying on the UI.
4. Add the case to the smoke test in §12.2 and, if it changes permissions, to §7.5.

### E.8 Add a native dependency or config change

1. `npx expo install <pkg>` (keeps SDK-compatible versions) and check whether it needs a config plugin in `app.json`.
2. A new **development** APK is required to run it.
3. A new **preview/production** build is required to ship it.
4. Run `npx tsc --noEmit`, `npx expo-doctor` (after `rm -rf android`) and a device smoke test.
5. If it interacts with Jitsi/WebRTC, re-check the pinned versions in §3 before merging.

### E.9 Change user-facing copy

- Find the same string in the web app first; copy it verbatim (including punctuation and capitalisation).
- Strings are inline in components — there is **no i18n layer**. If you add one, do it as a separate, mechanical change.
- Keep destructive confirmations explicit (the delete dialog requires typing "permanently delete").

### E.10 Keep the docs honest

When behaviour changes, update all three together:

1. `docs/FEATURES.md` — the requirement/feature baseline.
2. `docs/ENGINEERING_HANDOFF.md` (this file) — the §7 matrix row and the relevant §8 deep dive.
3. `README.md` — setup, commands, known gaps.

If a feature is intentionally not built on mobile, mark it as such in §7 and explain why in §13 rather than leaving a stale ✅.

---

*End of document. If you change behaviour described here, update `docs/FEATURES.md`, this handoff, and `README.md` together.*
