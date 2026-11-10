# Tunity profiles draft

Based on `user-profiles` at `ed43ed9` (your teammate's Google sign-in integration).

## Open the draft

```sh
cd tunity-front-end
npm install
npm run dev
```

Open `http://localhost:3000/profile`, or select **My profile** in the workspace sidebar. The existing workspace is still accessible without signing in. Its account dialog now includes **Continue as guest**.

The profile page includes identity, preferred name, instrument, experience, a practice goal, and daily practice minutes. It uses the existing charcoal/red Tunity design. **Preview member design** shows clearly labeled sample data without signing in or writing to Firebase. Exit preview to return to the real session.

## Guest and member behavior

- Guests can use the workspace and edit preferences. **Save for this session** keeps preferences only while that profile view remains mounted; refresh, leaving the page, or changing modes resets them. No anonymous Firebase user or profile document is created.
- Google sign-in uses the same Firebase Auth instance and provider as the workspace. Auth initialization has an explicit loading state.
- Signed-in members read/save preferences at `userProfiles/{firebaseAuthUid}`. A missing profile uses defaults; saving creates it. Google identity/email come from Auth and are not copied into the preferences document or edited by this form.
- Profile loading must succeed before saving. Failures show a retry action; failed writes do not report success. Switching accounts, signing out, or entering/exiting preview remounts the editor so one identity's preferences do not appear in another's form.
- Sign-out keeps the workspace usable as a guest. Guest preferences are not silently migrated into an account on sign-in.
- This adds profile persistence only. It does not claim that projects, recordings, history, or analysis results are saved to Firebase.

## Firestore schema and access

This branch contains a Firebase app configuration but no existing Firestore schema or rules. The draft introduces a separate collection, `userProfiles`, to avoid changing unknown project/recording documents.

```text
userProfiles/{uid}
  preferredName: string, max 60 characters
  instrument: one of the form's options
  experience: one of the form's options
  goal: string, max 300 characters
  dailyMinutes: integer, 5–120
  updatedAt: Firestore server timestamp
```

The integration is prepared in code; rules have not been deployed to the live project. Before using live saves, your Firebase maintainer should merge the **`match /userProfiles/{uid}` block** from `firebase/profile.rules` into the project's current Firestore rules. Preserve rules for every other collection. Review existing broader `allow` rules too: Firestore combines matching rules with OR, so a broad public rule would override this collection's intended privacy.

The supplied rule permits an authenticated owner to get their own document and create/update valid preferences. Guests and other UIDs cannot read/write it; collection listing and deletion are not granted. The client uses the authenticated UID, but the rules provide the actual access control. No admin key or service-account credentials belong in the browser.

If the project uses Realtime Database rather than Cloud Firestore, do not deploy this fragment there; adapt `lib/profile.ts` to your team's chosen database. This draft uses Firestore explicitly.

## Changed files

- `components/auth-provider.tsx`: one shared Firebase auth observer and the existing Google popup/sign-out flow.
- `app/layout.tsx`: mounts the shared provider.
- `app/page.tsx`: uses the shared provider; adds profile navigation and explicit guest access.
- `app/profile/page.tsx`, `app/profile/profile.css`, `components/profile-page.tsx`: responsive guest/member profile UI and isolated sample preview.
- `lib/profile-model.ts`: editable fields and validation.
- `lib/profile.ts`: Firestore read/save adapter with bounded confirmation waits.
- `lib/firebase.ts`: Firestore accessor and optional local emulator hooks, preserving the existing Firebase app configuration.
- `firebase/profile.rules`: reference rules to merge, not an automatic production deployment.
- Run `npm install` once after applying the installer to refresh inconsistent transitive lockfile entries. Dependency declarations are unchanged; `test:profile` runs the new validation tests.

## Local emulator validation

The optional variables below select local emulators when explicitly set before `npm run dev` or a build. Leave them unset for the normal Firebase project. Do not commit them as production values.

```sh
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tunity-profiles
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

Use a demo project ID with the Firebase Emulator Suite. The profile rules should be loaded into its Firestore emulator. Local emulators allow testing Google emulator identities, profile save/reload, sign-out/guest, invalid data, and cross-user access without writing to production.

## Checks and limits

Run `npm run test:profile` for the five profile validation tests, plus `npm run lint` and `npm run build`.

The local Firestore emulator download was blocked by the cloud network policy (`storage.googleapis.com`), so successful Firestore persistence and rule enforcement were not validated against a running database. Google popup infrastructure (`apis.google.com`) was also blocked here. Auth-emulator session restoration/sign-out, guest/preview isolation, mobile layout, and the UI error paths passed browser checks independently; real Google sign-in still needs a manual check on an authorized, connected localhost domain. No production Firebase rules or data were changed.

Firestore operations wait up to 12 seconds for confirmation. A write that times out may still sync later; the UI asks the user to reload before retrying and does not claim the write was cancelled.
