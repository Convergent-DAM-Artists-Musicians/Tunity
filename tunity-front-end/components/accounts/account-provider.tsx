"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { AudioProvider } from "../audio/audio-provider";
import { ensureAccount, watchAccount, acceptNotice, demoUpgrade } from "@/lib/account-repository";
import { accountStatus, type BandAccount } from "@/lib/account-model";
import { Welcome } from "./welcome";
import "./accounts.css";
type Context = { account: BandAccount; status: ReturnType<typeof accountStatus>; showUpgrade: () => void; announceStart: () => void };
const AccountContext = createContext<Context | null>(null);
export function AccountGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const path = usePathname();
  // Read-only local evaluation fixture; upload/API access remains authenticated.
  if (process.env.NODE_ENV === "development" && path === "/dev/performance") return <>{children}</>;
  if (loading) return <main className="account-center" role="status">Checking your sign-in…</main>;
  if (!user) return <WelcomeRedirect/>;
  return <BandSession key={user.uid} uid={user.uid}>{children}</BandSession>;
}
function WelcomeRedirect() {
  const router = useRouter(), path = usePathname();
  useEffect(() => { if (path !== "/") router.replace("/"); }, [path,router]);
  return <Welcome/>;
}
function BandSession({ uid, children }: { uid: string; children: ReactNode }) {
  const { logOut } = useAuth();
  const [account, setAccount] = useState<BandAccount | null>(null), [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0), [now,setNow] = useState(() => Date.now());
  const [upgrade,setUpgrade] = useState(false), [started,setStarted] = useState(false);
  const [busy,setBusy] = useState(false), [actionError,setActionError] = useState("");
  const [name,setName] = useState("");
  useEffect(() => {
    let active = true, stop: (() => void) | undefined;
    const fail = () => { if (active) setError("Could not confirm your band account. Check your connection and publish firebase/trial.rules, then retry."); };
    const timer = setTimeout(fail,12000);
    ensureAccount(uid).then(() => {
      if (!active) return;
      stop = watchAccount(uid, value => { if (active) { clearTimeout(timer); setAccount(value); setName(value.bandName); setError(""); } }, fail);
    }).catch(fail);
    const clock = setInterval(() => setNow(Date.now()),1000);
    return () => { active = false; clearTimeout(timer); clearInterval(clock); stop?.(); };
  }, [uid,attempt]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await fn(); } catch(e) { setActionError(e instanceof Error ? e.message : "This change was not confirmed. Retry when connected."); }
    finally { setBusy(false); }
  }
  if (error || !account) return <main className="account-center"><h1>Tunity band account</h1><p role={error ? "alert" : "status"}>{error || "Loading your account…"}</p>{error && <button className="primary-button" onClick={() => { setError(""); setAttempt(n=>n+1); }}>Retry account</button>}<button className="text-button" onClick={() => void logOut()}>Sign out</button></main>;
  const status = accountStatus(account, now);
  const paywall = status.expired || upgrade;
  const context = { account, status, showUpgrade: () => setUpgrade(true), announceStart: () => setStarted(true) };
  return <AccountContext.Provider value={context}>
    {account.noticeAcceptedAt === null && !status.expired ? <main className="account-center"><section className="account-card" role="dialog" aria-modal="true" aria-labelledby="trial-intro"><h1 id="trial-intro">Welcome, band director.</h1><p>Your whole band shares this account, its uploads, progress, and feedback.</p><p><strong>Your 30-day trial starts with your first successful practice recording upload.</strong> Creating the account starts no countdown. The band gets five uploads total during the trial; deleting files does not restore them.</p>{account.trialStartedAt !== null && <p>Your existing uploads were carried over: {status.daysLeft} trial days remain.</p>}<p>After 30 days, access requires the $65/month subscription with unlimited uploads.</p><form onSubmit={e => {e.preventDefault();void act(() => acceptNotice(uid,name));}}><label className="field-label">Band name<input autoFocus required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><button className="primary-button full-width" disabled={busy}>{busy ? "Saving…" : "Got it — enter Tunity"}</button></form>{actionError && <p role="alert">{actionError}</p>}<button className="text-button" onClick={() => void logOut()}>Sign out</button></section></main>
    : paywall ? <main className="account-center"><section className="account-card" role="dialog" aria-modal="true" aria-labelledby="paywall-heading"><span className="eyebrow">YOUR BAND’S NEXT CHAPTER</span><h1 id="paywall-heading">{status.expired ? "Your 30-day trial has ended." : "More room for your band."}</h1><p>{status.expired ? "Your files are kept safely. Upgrade to restore account access." : "Keep your band practicing beyond its five trial uploads."}</p><h2>$65<span>/month</span></h2><p>Unlimited practice uploads for your shared band account. Files up to 500 KiB each.</p><button className="primary-button full-width" disabled={busy} onClick={() => void act(async () => { await demoUpgrade(uid); setUpgrade(false); })}>{busy ? "Confirming upgrade…" : "Upgrade account"}</button>{!status.expired && <button className="text-button" disabled={busy} onClick={()=>setUpgrade(false)}>Back to my band</button>}{actionError && <p role="alert">{actionError}</p>}<button className="text-button" disabled={busy} onClick={() => void logOut()}>Sign out</button></section></main>
    : <><aside className="trial-banner" aria-label="Band subscription status"><div><strong>{account.bandName}</strong><span>{account.plan === "demo" ? "Subscription active · unlimited uploads" : account.trialStartedAt === null ? "30-day trial ready · starts on your first recording upload" : `${status.daysLeft} of 30 days remaining · ${account.uploadCount}/5 trial uploads used`}</span>{account.plan === "trial" && !status.canUpload && <span>Trial upload allowance used. You can still view your files until the trial ends.</span>}</div>{account.plan === "trial" && <button className="secondary-button" onClick={()=>setUpgrade(true)}>Upgrade · $65/mo</button>}</aside><AudioProvider>{children}</AudioProvider>{started && <TrialStartedNotice onDismiss={() => setStarted(false)}/>}</>}
  </AccountContext.Provider>;
}
function TrialStartedNotice({ onDismiss }: { onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="trial-start-dialog" aria-labelledby="trial-started" onCancel={onDismiss} onClose={onDismiss}>
    <section className="account-card"><h2 id="trial-started">Your 30-day trial has started.</h2>
    <p>Your first recording was saved. Your band can use five practice uploads total during this trial. The tracker above shows the days remaining.</p>
    <button autoFocus className="primary-button" onClick={onDismiss}>Let’s practice</button></section>
  </dialog>;
}
export function useBandAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Band account context is missing.");
  return value;
}
