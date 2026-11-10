import { getAnalytics, isSupported } from "firebase/analytics";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD3j2mxnsDzxH0sVvrkQwhMJO2H7aniSLg",
  authDomain: "tunity-e6b39.firebaseapp.com",
  projectId: "tunity-e6b39",
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
  if (!authInstance) authInstance = getAuth(firebaseApp());
  return authInstance;
}

export function initAnalytics() {
  if (typeof window === "undefined") return;
  isSupported()
    .then((supported) => {
      if (supported) getAnalytics(firebaseApp());
    })
    .catch(() => {});
}
