"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../auth-provider";
import "./accounts.css";
export function Welcome() {
  const { signInWithGoogle, signInEmail, resetPassword, authBusy, authError, setAuthError } = useAuth();
  const [mode, setMode] = useState<"signin"|"signup"|"reset">("signin");
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false), [message, setMessage] = useState("");
  const busy = !!authBusy;
  function change(next: typeof mode) { setMode(next); setPassword(""); setMessage(""); setAuthError(""); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMessage("");
    if (mode === "reset") {
      if (await resetPassword(email)) setMessage("If this email has a password account, a reset link has been sent. Check its inbox.");
    } else if (await signInEmail(email, password, remember, mode === "signup")) setPassword("");
  }
  return <main className="account-welcome"><div className="account-story">
    <Link className="account-brand" href="/">♪ Tunity</Link><span className="eyebrow">ONE BAND. A SHARED PRACTICE SPACE.</span>
    <h1>Great bands<br/>grow together.</h1><p>Bring every take, every score, and every moment of progress into one band account.</p>
    <div className="trial-promise"><strong>30 days to find your rhythm.</strong><p>Your free trial starts with your first successful recording upload—not account creation. Five practice uploads are included across the whole band.</p><p>After the trial: $65/month with unlimited uploads.</p></div>
  </div><section className="account-card" aria-labelledby="auth-heading">
    <h2 id="auth-heading">{mode === "signup" ? "Create your band account" : mode === "reset" ? "Reset your password" : "Welcome to Tunity"}</h2>
    <p>The band director creates the account. Students sign in to the same band account to view its shared progress and feedback.</p>
    {mode !== "reset" && <div className="account-tabs"><button disabled={busy} aria-pressed={mode === "signin"} onClick={() => change("signin")}>Sign in</button><button disabled={busy} aria-pressed={mode === "signup"} onClick={() => change("signup")}>Create account</button></div>}
    <form onSubmit={submit}>
      <label className="field-label">Band account email<input type="email" autoComplete="username" required value={email} disabled={busy} onChange={e => setEmail(e.target.value)}/></label>
      {mode !== "reset" && <label className="field-label">Password<input aria-label="Password" aria-describedby={mode === "signup" ? "password-help" : undefined} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : 1} maxLength={128} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)}/>{mode === "signup" && <small id="password-help">At least 12 characters. Use a password created specifically for Tunity.</small>}</label>}
      {mode !== "reset" && <label className="account-check"><input type="checkbox" checked={remember} disabled={busy} onChange={e => setRemember(e.target.checked)}/>Keep me signed in on this device</label>}
      <button className="primary-button full-width" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create band account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
    </form>
    {mode !== "reset" && <><div className="account-divider">or</div><button className="secondary-button full-width" disabled={busy} onClick={() => void signInWithGoogle(remember)}>Continue with Google</button><button className="text-button" disabled={busy} onClick={() => void signInWithGoogle(remember,true)}>Google popup blocked? Use redirect</button></>}
    <button className="text-button" disabled={busy} onClick={() => change(mode === "reset" ? "signin" : "reset")}>{mode === "reset" ? "Back to sign in" : "Forgot password?"}</button>
    {authError && <p className="error-message" role="alert">{authError}</p>}{message && <p role="status">{message}</p>}
    <p className="account-small">Leaving the checkbox unchecked keeps your sign-in for this browser session. Choose it only on a trusted device. Your browser may offer to save your password.</p>
  </section></main>;
}
