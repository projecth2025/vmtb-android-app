# vMTB Veritas — Android App

Feature list for the Android client. The app replicates the web app feature-for-feature against the same Supabase backend, storage and document-AI pipeline. It is a parallel client.

## Authentication

- Google OAuth sign-in (login and signup flows), with abandoned-signup recovery.
- Phone number + password login.
- WhatsApp OTP verification during signup (6-digit code, sets the account password, confirms the phone, writes the profile).
- WhatsApp OTP login.
- Forgot password via WhatsApp OTP (verify step + password reset step).
- Standalone phone-number re-verification page.
- Account roles selected at signup: Clinician, Site Data Coordinator, MTB Expert.
- Site Data Coordinator links to a clinician account by phone number at signup.
- Per-user theme preference (light / dark / system), defaulting to light.
- Profile: full name, profession, hospital, WhatsApp number, avatar upload.
- Logout.

## Case management

- My Cases list with status badges (processing / unverified / verified / failed), search and sort.
- Archived cases view.
- Create case wizard (2 steps):
  - Patient name (optional, defaults to Anonymous).
  - Cancer type selection (searchable list of 418 types, plus "Other" free text).
  - File upload (png, jpg, jpeg, doc, docx, ppt, pptx, pdf, txt; drag/drop on web, file picker on mobile), PDF page-count validation (max 50), duplicate-filename rejection.
  - Case explanation text.
  - Sample-case flow (local only, not uploaded or processed).
- Auto-generated case name (abbreviation + 5 random digits), collision-checked.
- Case detail page with five tabs: Summary, Reports, Opinions, Treatment, Settings.
- Summary tab:
  - Consolidated case-details + summary card (case, patient, age, sex, cancer type).
  - Read-only case name; editable patient name (owner only).
  - Rich-text summary editing (markdown to HTML).
  - Regenerate summary (capped at 5 per case, server-enforced).
  - Save changes, Save & Verify, Cancel.
  - Verification gated on age and sex being present (blocked / confirm dialogs).
  - Tabs lock until the case has been verified once.
  - Patient age and sex are AI-extracted and shown as "Not detected" until available.
  - MTB members see the last verified version while newer changes are unverified.
  - Polling while the AI pipeline is processing.
- Reports tab: document viewer, redaction tools (blur / whiteout / blackout), redaction versions, originals retention.
- Opinions tab: threaded opinions, questions and answers, replies, MTB-scoped filtering.
- Treatment tab: structured treatment plan and longitudinal follow-ups.
- Settings tab: MTB sharing (add/remove), archive/restore case, permanent delete (clinician only).
- Case archiving (removes the case from all MTBs) and restore.
- Delete case with cascading cleanup of child records.

## MTBs (Molecular Tumor Boards)

- MTB list (owned or member of), with case counts.
- Create MTB (generates a join code).
- Join MTB by code.
- MTB detail page:
  - List of shared cases (with status pills).
  - Add case to MTB (verified, non-archived cases only).
  - Remove case from MTB.
  - Rename MTB.
  - Leave MTB.
  - Notification toggle.
  - Meeting launcher.
  - Meeting history list with transcript / minutes-of-meeting status.
- View a case within an MTB context (MTB-scoped opinions).

## Meetings

- Start a meeting from an MTB (server-loader based launch).
- Join a meeting in-app via the Jitsi React Native SDK.
- Meeting analytics (session creation, participant join/leave, duration).
- Meeting detail page: transcript segments and minutes-of-meeting.
- Meeting history polling while a meeting is in progress.

## Roles and permissions

- Clinician: full access (create/edit/delete cases, opinions, meetings).
- Site Data Coordinator: full case parity, may archive but not delete, no opinions or meetings.
- MTB Expert: view-only cases/MTBs, may post opinions, no case creation or meeting start.
- Role-based routing and navigation prefixes (`/`, `/sdc`, `/mtb-exp`).
- Effective ownership for Site Data Coordinators (writes attribute to the linked clinician).
- Server-side enforcement of role restrictions (RLS / triggers).

## Document AI pipeline (client side)

- Presigned S3 upload flow for case documents.
- Pipeline run tracking (initial, edit, regenerate, retry) with status and error reporting.
- Case edit commits (redactions, removals, uploads, notes) in a single transaction.
- Polling for pipeline completion and summary availability.

## Notifications

- WhatsApp notifications (server-side triggers): case created/shared, meeting started, opinion added.
- Client surfaces notification toggle per MTB.

## Theme and UI

- Light / dark / system theme, per user, synced across devices.
- Semantic colour tokens (surfaces, text, borders, feedback families).
- Responsive layouts for phone and tablet.
- Toast notifications, modals, loading states.
- Avatar display with fallback.

## Onboarding (web reference; simplified on mobile)

- First-time walkthrough structure documented for parity reference (welcome, case section, MTB section, tips).
- Sample case and sample board (local only).

## Feedback

- Submit feedback (type + text) from the app.

## Settings and account

- Profile editing.
- Archived cases shortcut.
- Sign out.

## Integrations

- Supabase: Auth, Postgres, Storage, Realtime, Edge Functions.
- AWS S3: document upload and storage.
- Jitsi: in-app meetings via the React Native SDK.
- Google OAuth via Supabase.
- WhatsApp (Gupshup) via Supabase Edge Functions.