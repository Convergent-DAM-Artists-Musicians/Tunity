"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initAnalytics } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authError: string;
  authBusy: "signin" | "signout" | null;
  setAuthError: (message: string) => void;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
}
export function authMessage(error: unknown) {
  switch (errorCode(error)) {
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled for this Firebase project yet.";
    case "auth/unauthorized-domain":
      return "This site is not authorized for Google sign-in. Add it to Firebase Authentication’s authorized domains.";
    case "auth/account-exists-with-different-credential":
      return "This email uses a different sign-in method.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/internal-error":
      return "Google sign-in could not load. Check your connection or browser content blockers, or continue as a guest.";
    case "auth/network-request-failed":
      return "Could not reach Firebase. Check your connection and try again.";
    default:
      return "Could not complete the account action. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState<"signin" | "signout" | null>(null);
  useEffect(() => {
    initAnalytics();
    return onAuthStateChanged(
      getFirebaseAuth(),
      (next) => {
        setUser(next);
        setLoading(false);
      },
      (error) => {
        setAuthError(authMessage(error));
        setLoading(false);
      },
    );
  }, []);

  async function signInWithGoogle() {
    setAuthError("");
    setAuthBusy("signin");
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (error) {
      if (
        !["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(
          errorCode(error),
        )
      ) {
        setAuthError(authMessage(error));
      }
    } finally {
      setAuthBusy(null);
    }
  }
  async function logOut() {
    setAuthError("");
    setAuthBusy("signout");
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      setAuthError(authMessage(error));
    } finally {
      setAuthBusy(null);
    }
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        authBusy,
        setAuthError,
        signInWithGoogle,
        logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
