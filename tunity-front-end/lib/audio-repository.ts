import {
  Bytes,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "./practice-db";
import {
  MAX_AUDIO_BYTES,
  prepareAudio,
  type RecordingInfo,
} from "./audio-model";

import { prepareSheet, readSheetRef, type SheetChoice } from "./sheet-model";

import { accountRef, sheetUseCount } from "./account-repository";
import { readAccount, requireUpload } from "./account-model";

const recordingRef = (uid: string, id: string) =>
  doc(getFirebaseDb(), "userProfiles", uid, "recordings", id);
export function watchRecordings(
  uid: string,
  onData: (
    recordings: { info: RecordingInfo; bytes: Uint8Array; saved: boolean }[],
    fromCache: boolean,
  ) => void,
  onError: () => void,
) {
  return onSnapshot(
    query(collection(getFirebaseDb(), "userProfiles", uid, "recordings")),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        const recordings = snapshot.docs.map((entry) => {
          const data = entry.data();
          if (
            !(data.audio instanceof Bytes) ||
            typeof data.name !== "string" ||
            typeof data.title !== "string" ||
            typeof data.contentType !== "string" ||
            !Number.isInteger(data.size) ||
            data.size <= 0 ||
            data.size > MAX_AUDIO_BYTES ||
            data.audio.toUint8Array().byteLength !== data.size
          )
            throw new Error("Invalid recording document");
          return {
            info: {
              id: entry.id,
              sheetMusic: readSheetRef(data.sheetMusic),
              name: data.name,
              title: data.title,
              contentType: data.contentType,
              size: data.size,
              createdAt: data.createdAt?.toDate?.().toISOString() || "",
            },
            bytes: data.audio.toUint8Array(),
            saved: !entry.metadata.hasPendingWrites,
          };
        });
        onData(recordings, snapshot.metadata.fromCache);
      } catch {
        onError();
      }
    },
    onError,
  );
}

export async function saveRecording(uid: string, file: File, title: string,
  choice: SheetChoice = { kind: "none" }) {
  const { info, bytes } = await prepareAudio(file, title);
  const pdf = choice.kind === "new" ? await prepareSheet(choice.file) : null;
  const id = crypto.randomUUID(), key = crypto.randomUUID();
  return runTransaction(getFirebaseDb(), async tx => {
    const ref = accountRef(uid), snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error("Load your band account before uploading.");
    const account = readAccount(snapshot.data());
    requireUpload(account);
    let sheetMusic;
    if (pdf) sheetMusic = { slot: key, key, name: pdf.name };
    else if (choice.kind === "existing") {
      const selected = readSheetRef(choice)!;
      const sheet = await tx.get(doc(getFirebaseDb(), "userProfiles", uid, "sheetMusic", selected.slot));
      if (!sheet.exists() || sheet.data().key !== selected.key || sheet.data().name !== selected.name)
        throw new Error("That PDF is no longer available. Choose another sheet or no sheet music.");
      sheetMusic = selected;
    }
    const uses = sheetMusic ? await sheetUseCount(tx, uid, account, sheetMusic.key) : 0;
    // All reads finish before the first write. The counter, PDF, and recording commit atomically.
    if (pdf && sheetMusic) tx.set(doc(getFirebaseDb(), "userProfiles", uid, "sheetMusic", key), {
      key, name: pdf.name, size: pdf.size, contentType: "application/pdf", pdf: Bytes.fromUint8Array(pdf.bytes),
      createdAt: serverTimestamp(), conversionStatus: "not_requested" });
    tx.set(recordingRef(uid, id), { ...info, audio: Bytes.fromUint8Array(bytes), createdAt: serverTimestamp(),
      ...(sheetMusic ? { sheetMusic } : {}) });
    tx.update(ref, { uploadCount: account.uploadCount + 1, lastUploadId: id,
      trialStartedAt: snapshot.data().trialStartedAt || serverTimestamp(),
      ...(sheetMusic ? { sheetUses: { ...account.sheetUses, [sheetMusic.key]: uses + 1 } } : {}) });
    return { id, firstUpload: account.trialStartedAt === null && account.plan === "trial" };
  }, { maxAttempts: 3 });
}
export async function deleteRecording(uid: string, id: string) {
  if (!/^(?:[0-4]|[a-f0-9-]{36})$/.test(id)) throw new Error("Invalid recording.");
  return runTransaction(getFirebaseDb(), async tx => {
    const ref = recordingRef(uid, id), entry = await tx.get(ref);
    const account = await tx.get(accountRef(uid));
    if (!entry.exists()) return;
    const a = readAccount(account.data()!);
    const sheet = readSheetRef(entry.data().sheetMusic);
    const count = sheet ? await sheetUseCount(tx, uid, a, sheet.key) : 0;
    tx.delete(ref);
    if (sheet) tx.update(accountRef(uid), { lastDeleteId: id, sheetUses: { ...a.sheetUses, [sheet.key]: count - 1 } });
    // uploadCount and trialStartedAt never decrease or reset on deletion.
  });
}
