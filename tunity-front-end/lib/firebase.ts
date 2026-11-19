import { getAnalytics, isSupported } from "firebase/analytics";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3j2mxnsDzxH0sVvrkQwhMJO2H7aniSLg",
  authDomain: "tunity-e6b39.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tunity-e6b39",
  storageBucket: "tunity-e6b39.firebasestorage.app",
  messagingSenderId: "690936597855",
  appId: "1:690936597855:web:51ba503ceacf3b2d92faea",
  measurementId: "G-4YYE4NYQC7",
};

function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(firebaseApp());
    if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL) {
      connectAuthEmulator(
        authInstance,
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
      );
    }
  }
  return authInstance;
}

export function initAnalytics() {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL) return;
  isSupported()
    .then((supported) => {
      if (supported) getAnalytics(firebaseApp());
    })
    .catch(() => {});
}

let dbInstance: Firestore | null = null;
export function getFirebaseDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(firebaseApp());
    if (process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) {
      const [host, port] =
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST.split(":");
      connectFirestoreEmulator(dbInstance, host, Number(port));
    }
  }
  return dbInstance;
}
