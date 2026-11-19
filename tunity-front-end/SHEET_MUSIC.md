> **trial-accounts update:** Guest access has been removed. Use [TRIAL_ACCOUNTS.md](TRIAL_ACCOUNTS.md) for current authentication, trial, subscription demo, and Firestore rules setup.

# Optional sheet music for practice uploads

Combined installer for your pasted profile/landing code. No earlier audio or sheet installer is required.
Uses your existing Firebase 9 dependency and authenticated app; no Firebase SDK upgrade is required.

1. In Firebase Console → Firestore Database → Rules, publish `firebase/practice.rules`.
   This is a complete ruleset for the known MVP collections. Preserve unrelated rules if your team added collections.
   It includes profile validation, audio/video recordings, and owner-only reusable PDFs.
   The previous recording rules reject the new `sheetMusic` field and video content types.
2. Run `npm install`, `npm run test:audio`, `npm run test:sheet`, `npm run dev`.
3. Open `/workspace`. Add recording → select audio/video → choose No sheet music,
   Upload a new PDF, or Choose from my sheet music. The same controls work on `/profile`.
4. Download `/demo-tone.wav` and `/demo-score.pdf` for small test files.
5. Signed in: save a take with a PDF, refresh, and upload a second take using the saved PDF.
   Confirm there is one PDF and two linked takes. Sign out to check that files are not exposed to guests.
6. Guests: both file types remain in memory. Navigation preserves them; refreshing clears them.

## Storage and links

No Cloud Storage or new billing setup. Existing `lib/firebase.ts` and credentials are untouched.
Limit: 5 recordings and 5 PDFs, each up to 500 KiB (under 5 MiB total binary per account).
Video support is deliberately limited to tiny MP4, MOV, and WebM demo clips. Codec support depends on browser.
Firestore documents are `userProfiles/{uid}/recordings/{0..4}` and `userProfiles/{uid}/sheetMusic/{0..4}`.
The original recording `audio` bytes field is retained for compatibility; video uses this same field.
An optional `sheetMusic: {slot, key, name}` points to a separate PDF; reusing it never duplicates its bytes.
Existing recordings without this field remain valid. New PDF + take save atomically or neither saves.
Five fixed slots and create-only rules enforce quotas across tabs. A UUID key prevents a reused
slot from silently attaching a different score. Referenced PDFs cannot be deleted; delete linked takes first.
Deleting a take deliberately keeps the PDF available for reuse. Libraries are private to their owner.

## Backend handoff

Upload-only scope: PDFs have `conversionStatus: "not_requested"`. No MXL file is fabricated,
no PDF is sent to `/api/analyze`, and analysis JSON remains an independent advanced audio-only option.
The backend currently exposes a native OMR importer/CLI, not an HTTP conversion service;
its relative imports also need your teammate's integration work before it can be called reliably.
The teammate implementing conversion can read the owner's PDF bytes and stable key, produce MXL,
and define separate conversion storage/rules. Client rules intentionally disallow altering PDF documents.
Do not run native conversion or embed admin credentials in browser code.

## Verification

Automated model and transaction checks cover validation, duplicate-free reuse, quota, rollback,
and deletion protection. Browser and live Firebase tests still need to run on your Mac: this
cloud session blocks Next.js worker sockets and Chromium startup. A successful guest test
alone does not verify cloud permissions.
