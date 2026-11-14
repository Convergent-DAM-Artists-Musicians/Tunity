import { Bytes, collection, doc, onSnapshot, query, runTransaction } from "firebase/firestore";
import { getFirebaseDb } from "./practice-db";
import { MAX_SHEET_BYTES, readSheetRef, type SheetRef } from "./sheet-model";
import { accountRef, sheetUseCount } from "./account-repository";
import { readAccount } from "./account-model";
export function watchSheets(uid: string, onData: (items: { info: SheetRef & { size: number }; bytes: Uint8Array }[]) => void,
  onError: () => void) {
  return onSnapshot(query(collection(getFirebaseDb(), "userProfiles", uid, "sheetMusic")),
    { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      try {
        onData(snapshot.docs.map(entry => {
          const d = entry.data(), info = readSheetRef({ slot: entry.id, key: d.key, name: d.name })!;
          if (!(d.pdf instanceof Bytes) || !Number.isInteger(d.size) || d.size < 1
            || d.size > MAX_SHEET_BYTES || d.pdf.toUint8Array().length !== d.size)
            throw new Error("Invalid PDF document.");
          return { info: { ...info, size: d.size }, bytes: d.pdf.toUint8Array() };
        }));
      } catch { onError(); }
    }, onError);
}
export async function deleteSheet(uid: string, sheet: SheetRef) {
  return runTransaction(getFirebaseDb(), async tx => {
    const ref = doc(getFirebaseDb(), "userProfiles", uid, "sheetMusic", sheet.slot);
    const current = await tx.get(ref);
    const account = await tx.get(accountRef(uid));
    const count = await sheetUseCount(tx, uid, readAccount(account.data()!), sheet.key);
    if (count > 0) throw new Error("This PDF is linked to a recording. Delete those recordings before deleting the PDF.");
    if (current.exists() && current.data().key === sheet.key) tx.delete(ref);
  }, { maxAttempts: 3 });
}
