import {
  Bytes,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "./practice-db";
import {
  firstAvailableSlot,
  MAX_AUDIO_BYTES,
  MAX_RECORDINGS,
  prepareAudio,
  type RecordingInfo,
} from "./audio-model";

import { MAX_SHEETS, prepareSheet, readSheetRef, sheetSlot, type SheetChoice } from "./sheet-model";

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
    query(
      collection(getFirebaseDb(), "userProfiles", uid, "recordings"),
      limit(MAX_RECORDINGS),
    ),
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
  const key = crypto.randomUUID(); // Created once, stable across transaction retries.
  return runTransaction(getFirebaseDb(), async (tx) => {
    const refs = Array.from({ length: MAX_RECORDINGS }, (_, i) => recordingRef(uid, String(i)));
    const recordings = await Promise.all(refs.map(ref => tx.get(ref)));
    const slot = firstAvailableSlot(recordings.filter(s => s.exists()).map(s => s.id));
    let sheetMusic;
    if (choice.kind === "new" && pdf) {
      const sheets = Array.from({ length: MAX_SHEETS }, (_, i) =>
        doc(getFirebaseDb(), "userProfiles", uid, "sheetMusic", String(i)));
      const current = await Promise.all(sheets.map(ref => tx.get(ref)));
      const id = sheetSlot(current.filter(s => s.exists()).map(s => s.id));
      sheetMusic = { slot: id, key, name: pdf.name };
      tx.set(sheets[Number(id)], { key, name: pdf.name, size: pdf.size,
        contentType: "application/pdf", pdf: Bytes.fromUint8Array(pdf.bytes),
        createdAt: serverTimestamp(), conversionStatus: "not_requested" });
    } else if (choice.kind === "existing") {
      const selected = readSheetRef(choice)!;
      const sheet = await tx.get(doc(getFirebaseDb(), "userProfiles", uid, "sheetMusic", selected.slot));
      if (!sheet.exists() || sheet.data().key !== selected.key || sheet.data().name !== selected.name)
        throw new Error("That PDF is no longer available. Choose another sheet or no sheet music.");
      sheetMusic = selected;
    }
    tx.set(refs[Number(slot)], { ...info, audio: Bytes.fromUint8Array(bytes),
      createdAt: serverTimestamp(), ...(sheetMusic ? { sheetMusic } : {}) });
    return slot;
  }, { maxAttempts: 3 });
}
export async function deleteRecording(uid: string, id: string) {
  if (!/^[0-4]$/.test(id)) throw new Error("Invalid recording slot.");
  return runTransaction(
    getFirebaseDb(),
    async (transaction) => {
      const ref = recordingRef(uid, id);
      const existing = await transaction.get(ref);
      if (existing.exists()) transaction.delete(ref);
    },
    { maxAttempts: 3 },
  );
}
