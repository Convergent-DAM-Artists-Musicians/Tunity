"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { useBandAccount } from "./accounts/account-provider";
import { AudioLibrary } from "./audio/audio-library";
import { emptyProfile, loadProfile, saveProfile, instruments, levels, type Profile } from "@/lib/profile";
import { acceptNotice } from "@/lib/account-repository";
import "./accounts/accounts.css";
export function ProfilePage() {
  const { user, logOut, authError, authBusy, connectPassword, connectGoogle } = useAuth();
  const { account, status, showUpgrade } = useBandAccount();
  const [name,setName] = useState(account.bandName), [password,setPassword] = useState("");
  const [profile,setProfile] = useState<Profile>({...emptyProfile});
  const [loaded,setLoaded] = useState(false), [retry,setRetry] = useState(0);
  const [error,setError] = useState(""), [message,setMessage] = useState(""), [saving,setSaving] = useState(false);
  useEffect(() => {
    if (!user) return;
    let active = true;
    loadProfile(user.uid).then(value => { if (active) {setProfile(value || {...emptyProfile});setLoaded(true);setError("");} })
      .catch(()=>{if(active)setError("Could not load your band’s practice preferences. Retry before saving.");});
    return ()=>{active=false;};
  },[user,retry]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!user || !loaded || saving) return;
    setSaving(true);setError("");setMessage("");
    try { await acceptNotice(user.uid,name); await saveProfile(user.uid,profile);setMessage("Band preferences saved."); }
    catch(e){setError(e instanceof Error ? e.message : "Save was not confirmed. Please retry.");}
    finally{setSaving(false);}
  }
  const passwordLinked = user?.providerData.some(p=>p.providerId === "password");
  const googleLinked = user?.providerData.some(p=>p.providerId === "google.com");
  return <main className="band-profile"><header><Link className="account-brand" href="/workspace">♪ Tunity</Link><Link className="secondary-button" href="/workspace">Back to workspace</Link></header>
    <h1>{account.bandName}</h1><p>One shared band account. Students signed in to this account see the same recordings, scores, progress, and feedback.</p>
    <div className="band-settings"><section className="account-card"><h2>Band preferences</h2>
      <form onSubmit={save}><fieldset disabled={!loaded || saving}>
        <label className="field-label">Band name<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="field-label">Preferred name<input maxLength={60} value={profile.preferredName} onChange={e=>setProfile({...profile,preferredName:e.target.value})}/></label>
        <label className="field-label">Main instrument<select value={profile.instrument} onChange={e=>setProfile({...profile,instrument:e.target.value as Profile["instrument"]})}>{instruments.map(i=><option key={i}>{i}</option>)}</select></label>
        <label className="field-label">Experience<select value={profile.experience} onChange={e=>setProfile({...profile,experience:e.target.value as Profile["experience"]})}>{levels.map(i=><option key={i}>{i}</option>)}</select></label>
        <label className="field-label">Band practice goal<textarea maxLength={300} value={profile.goal} onChange={e=>setProfile({...profile,goal:e.target.value})}/></label>
        <label className="field-label">Daily practice minutes<input type="number" min={5} max={120} required value={profile.dailyMinutes} onChange={e=>setProfile({...profile,dailyMinutes:Number(e.target.value)})}/></label>
        <button className="primary-button" disabled={!loaded || saving}>{saving ? "Saving…" : "Save band preferences"}</button>
      </fieldset></form>{!loaded && !error && <p role="status">Loading preferences…</p>}{error && <><p role="alert">{error}</p>{!loaded && <button onClick={()=>setRetry(n=>n+1)}>Retry preferences</button>}</>}{message && <p role="status">{message}</p>}
    </section><section className="account-card"><h2>Sign-in and subscription</h2><p>{user?.email}</p><p>{account.plan === "demo" ? "Subscription active · unlimited uploads" : account.trialStartedAt === null ? "Your 30-day trial starts with your first successful recording upload." : `${status.daysLeft} days remaining · ${account.uploadCount}/5 trial uploads used`}</p>{account.plan === "trial" && <button className="primary-button" onClick={showUpgrade}>Upgrade · $65/month</button>}
      <h3>Connected sign-in methods</h3><p>Google: {googleLinked ? "Connected" : "Not connected"} · Email/password: {passwordLinked ? "Connected" : "Not connected"}</p>
      {!googleLinked && <button className="secondary-button" disabled={!!authBusy} onClick={()=>void connectGoogle()}>Connect Google to this band account</button>}
      {!passwordLinked && <form onSubmit={async e=>{e.preventDefault();if(await connectPassword(password)){setPassword("");setMessage("Tunity password connected to the same band account.");}}}><label className="field-label">Create a Tunity-only password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={!!authBusy} onChange={e=>setPassword(e.target.value)}/></label><p className="account-small">Students can use the account email above and this Tunity password. Never share your personal Google password.</p><button className="secondary-button" disabled={!!authBusy}>Add email/password sign-in</button></form>}
      {authError && <p role="alert">{authError}</p>}<button className="text-button" disabled={!!authBusy} onClick={()=>void logOut()}>Sign out of this device</button>
    </section></div><AudioLibrary/>
  </main>;
}
