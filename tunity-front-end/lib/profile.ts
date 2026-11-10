import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";

import { validateProfile, type Profile } from "./profile-model";
export {
  emptyProfile,
  instruments,
  levels,
  validateProfile,
  type Profile,
} from "./profile-model";

// Firestore can queue work while offline. Bound UI waits without claiming a
// pending write was cancelled; the caller asks users to reload before retrying.
function confirmed<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Firebase confirmation timed out.")),
      12000,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export async function loadProfile(uid: string): Promise<Profile | null> {
  const snapshot = await confirmed(
    getDoc(doc(getFirebaseDb(), "userProfiles", uid)),
  );
  return snapshot.exists() ? validateProfile(snapshot.data()) : null;
}
export async function saveProfile(uid: string, value: Profile) {
  const profile = validateProfile(value);
  await confirmed(
    setDoc(
      doc(getFirebaseDb(), "userProfiles", uid),
      { ...profile, updatedAt: serverTimestamp() },
      { merge: true },
    ),
  );
}
