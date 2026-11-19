"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GoogleAuthProvider, EmailAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  browserLocalPersistence, browserSessionPersistence, setPersistence, linkWithCredential, linkWithPopup,
  signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export function authMessage(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string,string> = {
    "auth/popup-blocked": "Google’s popup was blocked. Allow popups or use Continue with Google redirect below.",
    "auth/popup-closed-by-user": "Google sign-in was closed. You can try again.",
    "auth/cancelled-popup-request": "Another Google sign-in window is already open.",
    "auth/operation-not-allowed": "This sign-in provider is disabled. Enable Google and Email/Password in Firebase Authentication → Sign-in method.",
    "auth/unauthorized-domain": "This site’s domain is not authorized. Add it in Firebase Authentication → Settings → Authorized domains.",
    "auth/account-exists-with-different-credential": "Sign in using your existing email/password account, then connect Google from Band account to keep the same library.",
    "auth/email-already-in-use": "An account already uses this email. Sign in or reset its password. For Google accounts, sign in with Google and add a Tunity password from Band account.",
    "auth/credential-already-in-use": "That sign-in method belongs to another account. Sign in to that account; it cannot be linked automatically.",
    "auth/provider-already-linked": "This sign-in method is already connected.",
    "auth/requires-recent-login": "For security, sign out and sign in again before changing sign-in methods.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password that meets your Firebase project’s password policy.",
    "auth/invalid-credential": "The email or password is incorrect. Try again or reset your password.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait before trying again.",
    "auth/network-request-failed": "Could not reach Firebase. Check your connection and try again.",
    "auth/web-storage-unsupported": "This browser blocks sign-in storage. Allow site storage and try again.",
    "auth/internal-error": "Google sign-in could not load. Check browser content blockers and Firebase’s provider configuration.",
  };
  return messages[code] || "The account action could not complete. Please try again.";
}
type AuthContextValue = {
  user: User | null; loading: boolean; authError: string; authBusy: string | null;
  setAuthError: (text: string) => void;
  signInWithGoogle: (remember?: boolean, redirect?: boolean) => Promise<boolean>;
  signInEmail: (email: string, password: string, remember: boolean, create?: boolean) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  connectPassword: (password: string) => Promise<boolean>;
  connectGoogle: () => Promise<boolean>; logOut: () => Promise<boolean>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(""), [authBusy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  useEffect(() => {
    const auth = getFirebaseAuth();
    // Firebase owns credential persistence. Never store passwords in application storage.
    try { sessionStorage.removeItem("tunity:guest-session"); } catch {}
    getRedirectResult(auth).catch(error => setAuthError(authMessage(error)));
    return onAuthStateChanged(auth, next => { if (next?.isAnonymous) { void signOut(auth); setUser(null); } else setUser(next); setLoading(false); }, error => {
      setAuthError(authMessage(error)); setLoading(false);
    });
  }, []);
  async function action(name: string, fn: () => Promise<unknown>) {
    if (working.current) return false;
    working.current = true; setBusy(name); setAuthError("");
    try { await fn(); return true; }
    catch (error) { setAuthError(authMessage(error)); return false; }
    finally { working.current = false; setBusy(null); }
  }
  async function persist(remember: boolean) {
    await setPersistence(getFirebaseAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
  }
  const value: AuthContextValue = { user, loading, authError, authBusy, setAuthError,
    signInWithGoogle: (remember = false, redirect = false) => action("signin", async () => {
      await persist(remember);
      const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
      if (redirect) await signInWithRedirect(getFirebaseAuth(), provider);
      else await signInWithPopup(getFirebaseAuth(), provider);
    }),
    signInEmail: (email, password, remember, create = false) => action(create ? "signup" : "signin", async () => {
      await persist(remember);
      await (create ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(getFirebaseAuth(), email.trim(), password);
    }),
    resetPassword: email => action("reset", () => sendPasswordResetEmail(getFirebaseAuth(), email.trim())),
    connectPassword: password => action("link", async () => {
      const current = getFirebaseAuth().currentUser;
      if (!current?.email) throw new Error("Sign in again first.");
      await linkWithCredential(current, EmailAuthProvider.credential(current.email, password));
      setUser(current);
    }),
    connectGoogle: () => action("link", async () => {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Sign in again first.");
      await linkWithPopup(current, new GoogleAuthProvider());
      setUser(current);
    }),
    logOut: () => action("signout", () => signOut(getFirebaseAuth())),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
