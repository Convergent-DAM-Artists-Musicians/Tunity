import { doc, runTransaction, serverTimestamp, onSnapshot, type Transaction } from "firebase/firestore";
import { getFirebaseDb } from "./practice-db";
import { readAccount, type BandAccount } from "./account-model";
export const accountRef = (uid: string) => doc(getFirebaseDb(), "accounts", uid);
export const legacyRef = (uid: string, id: number) => doc(getFirebaseDb(), "userProfiles", uid, "recordings", String(id));
export async function legacyRecordings(tx: Transaction, uid: string) {
  return Promise.all(Array.from({length: 5}, (_, i) => tx.get(legacyRef(uid, i))));
}
export async function sheetUseCount(tx: Transaction, uid: string, a: BandAccount, key: string) {
  if (Object.hasOwn(a.sheetUses, key)) return a.sheetUses[key];
  const old = await legacyRecordings(tx, uid);
  return old.filter(s => s.exists() && s.data().sheetMusic?.key === key).length;
}
export async function ensureAccount(uid: string) {
  return runTransaction(getFirebaseDb(), async tx => {
    const ref = accountRef(uid), current = await tx.get(ref);
    if (current.exists()) return;
    const old = (await legacyRecordings(tx, uid)).filter(s => s.exists());
    const first = old.map(s => s.data().createdAt).sort((a,b) => a.toMillis() - b.toMillis())[0] || null;
    tx.set(ref, { bandName: "Your band", plan: "trial", createdAt: serverTimestamp(),
      trialStartedAt: first, uploadCount: old.length, noticeAcceptedAt: null,
      demoUpgradedAt: null, lastUploadId: "", lastDeleteId: "", sheetUses: {} });
  });
}
export function watchAccount(uid: string, next: (a: BandAccount) => void, fail: () => void) {
  return onSnapshot(accountRef(uid), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    try { if (!snapshot.exists()) throw new Error(); next(readAccount(snapshot.data())); }
    catch { fail(); }
  }, fail);
}
export async function acceptNotice(uid: string, bandName: string) {
  const name = bandName.trim();
  if (!name || name.length > 80) throw new Error("Use a band name of 1–80 characters.");
  await runTransaction(getFirebaseDb(), async tx => {
    const ref = accountRef(uid), current = await tx.get(ref);
    if (!current.exists()) throw new Error("Band account is unavailable.");
    tx.update(ref, { bandName: name, noticeAcceptedAt: current.data().noticeAcceptedAt || serverTimestamp() });
  });
}
export async function demoUpgrade(uid: string) {
  await runTransaction(getFirebaseDb(), async tx => {
    const ref = accountRef(uid), current = await tx.get(ref);
    if (!current.exists()) throw new Error("Band account is unavailable.");
    if (current.data().plan === "demo") return;
    tx.update(ref, { plan: "demo", demoUpgradedAt: serverTimestamp() });
  });
}
