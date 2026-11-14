import { getFirestore } from "firebase/firestore";
import { getFirebaseAuth } from "./firebase";
export function getFirebaseDb() {
  return getFirestore(getFirebaseAuth().app);
}
