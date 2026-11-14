# Shared band accounts: setup and testing

Based on trial-accounts ed5b7a9 merged with main 820a194 (score-aware rhythm PR).
Resolve and finish that merge before installing these account changes.
Guests are removed. One Firebase UID is one shared band account; students use the same Tunity
account credentials as their director. Separate student identities, roles and invitations are not included.

## Required Firebase Console setup

1. Select the project configured in lib/firebase.ts.
2. Authentication → Sign-in method: enable Google, choose its support email, and save.
3. Enable Email/Password too. New accounts can then use either method.
4. Authentication → Settings → Authorized domains: add localhost and your deployed hostname.
5. Firestore Database → Rules: publish **firebase/trial.rules**, replacing the old MVP rules.
   Preserve unrelated collection rules; broad legacy owner/wildcard allows can bypass trial checks.
   The older practice.rules/profile.rules files are retained for reference and must not be deployed for this feature.
6. Run npm install, npm run test:accounts, npm run test:audio, npm run test:sheet,
   npm run test:profile, npm run build, then npm run dev. Use Node 24+.

The installer preserves Firebase configuration and adds firebase-admin for server-side ID-token verification.
No service-account JSON or payment credentials are needed. The server needs network access to Google's
public signing certificates and Firestore API. For another project, set NEXT_PUBLIC_FIREBASE_PROJECT_ID
consistently with lib/firebase.ts. Firebase Console providers/domains cannot be enabled by this installer.

## Behavior

- First-time visitors see Sign in/Create account. Returning signed-in users reach the workspace.
- Checked persistence uses Firebase local persistence; unchecked uses browser-session persistence.
  Application code never stores passwords. Browser password-manager saving is optional.
- Band account settings link Google and a Tunity-only password to the SAME UID and file library.
  Never share a personal Google password. An identity already owned by another UID cannot be auto-merged.
- The onboarding popup explains the trial. Its clock starts with the first successful practice audio/video upload.
- Five lifetime trial uploads are shared across the band. A PDF attached to a take is not an extra upload.
  Failed uploads consume nothing. Deleting takes does not restore quota or restart the clock.
- The counter, recording and optional PDF save atomically. Concurrent tabs cannot reserve a sixth trial upload.
- After exactly 30 × 24 hours, the paywall replaces account content and rules deny practice/profile access.
  Reaching five uploads earlier blocks new uploads but permits viewing until expiration.
- $65/month is displayed. Enable demo subscription restores access and removes the upload COUNT limit.
  **No money is collected or real subscription created.** Owner-accessible demo upgrades in the rules
  must be replaced with trusted billing before production payments. The 500 KiB PER-FILE limit remains;
  Firebase free-project quotas still apply. This is small-file MVP storage, not unlimited Firebase capacity.
- Legacy recordings 0–4 and PDF links are preserved. The count and earliest date of retained legacy recordings seed the trial; uploads deleted before this feature have no recoverable history.
  New files use UUIDs. Installing, signing out, deleting files or linking providers never resets the trial.
- PDFs remain upload/reference only. MXL conversion is unchanged. Analysis results remain session-only.

## Manual test

Create a disposable band account. Before uploading, refresh and confirm the trial is unstarted.
Upload /demo-tone.wav with /demo-score.pdf, analysis unchecked: expect the first-upload popup and 30 days, 1/5.
Refresh, reuse that PDF on another take, and confirm one PDF/two links. Delete a take: quota stays used.
Reach five lifetime uploads; the sixth is blocked. Enable demo subscription and store more than five takes.
To test expiry, use another disposable account with an upload. In Firestore Console, set its trialStartedAt
31 days into the past (admin test edit). Refresh: only paywall access; demo upgrade restores its files.
Sign out; /workspace and /profile must return to welcome, and anonymous /api/analyze requests return 401.
Test Google after the Console setup, then link the other method and confirm the same UID/library/trial.

Automated model/repository checks cover boundaries, failed uploads, migration, concurrent limits and PDF reuse.
Repository tests use an optimistic transaction double, not the rules engine. Email/password flows and persistence
were exercised against the real Auth emulator. Browser checks cover welcome/route guards and trial screens.
Google's script host and the Firestore emulator JAR download host are blocked in this cloud session;
Google OAuth and Firestore rules still need a live/disposable-account or local-emulator check.

The integrated workspace keeps Rhythm/Pitch selection, written-rhythm/tuplet feedback, and optional reviewed JSON references. The API sends the selected mode to the merged backend and verifies the signed-in account first. The small-file storage demo retains its 500 KiB limit rather than the standalone analyzer's 25 MB limit. PDF-to-MXL reference analysis remains separate from PDF upload storage. Follow back-end/rhythm-analyzer/README.md for the Python/FFmpeg runtime setup.
