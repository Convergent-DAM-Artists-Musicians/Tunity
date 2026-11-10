"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  emptyProfile,
  instruments,
  levels,
  loadProfile,
  saveProfile,
  validateProfile,
  type Profile,
} from "@/lib/profile";

type Account = {
  uid: string;
  displayName: string | null;
  email: string | null;
};
const sampleAccount: Account = {
  uid: "design-preview",
  displayName: "Alex Morgan",
  email: "alex@example.com",
};
const sampleProfile: Profile = {
  preferredName: "Alex",
  instrument: "Trumpet",
  experience: "Building confidence",
  goal: "Find a warmer tone and feel confident at my next recital.",
  dailyMinutes: 25,
};

function MusicMark() {
  return (
    <svg
      width="28"
      height="32"
      viewBox="0 0 40 45"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5c12 0 8 18 13 25 3 4 8 3 8-2V15l6-2v19c0 13-20 12-22 1L9 13 4 9Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="m18 10 12 7M19 15l11 7M21 21l9 6" stroke="currentColor" />
    </svg>
  );
}
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3-4.4 3-7.6Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.3 2.6c.8-2.3 3-4 5.6-4Z"
      />
    </svg>
  );
}

export function ProfilePage() {
  const { user, loading, authError, authBusy, signInWithGoogle, logOut } =
    useAuth();
  const [preview, setPreview] = useState(false);
  const account = preview ? sampleAccount : user;
  return (
    <div className="app-shell profile-shell">
      <aside className="sidebar profile-sidebar">
        <Link
          href="/workspace"
          className="sidebar-brand profile-brand"
          aria-label="Tunity home"
        >
          <MusicMark />
          <span>Tunity</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/workspace" className="nav-item">
            <span aria-hidden="true">⌂</span> Workspace
          </Link>
          <Link href="/profile" className="nav-item active" aria-current="page">
            <span aria-hidden="true">◎</span> My profile
          </Link>
        </nav>
        <div className="profile-sidebar-note">
          <span className="eyebrow">A LITTLE EVERY DAY</span>
          <p>
            Your sound.
            <br />
            Your own pace.
          </p>
          <span />
        </div>
        <div className="profile-sidebar-account">
          <span className="profile-mini-avatar">
            {account ? account.displayName?.charAt(0) || "M" : "♪"}
          </span>
          <div>
            <strong>{account ? account.displayName : "Guest musician"}</strong>
            <small>
              {preview
                ? "Sample account"
                : loading
                  ? "Checking account…"
                  : user
                    ? "Connected with Google"
                    : "No account needed"}
            </small>
          </div>
        </div>
      </aside>
      <main className="main-content profile-main">
        <header className="profile-topbar">
          <span>
            Your workspace <span aria-hidden="true">/</span>{" "}
            <strong>My profile</strong>
          </span>
          <span className="profile-state-badge">
            <i />
            {preview
              ? "Design preview"
              : loading
                ? "Connecting"
                : user
                  ? "Google connected"
                  : "Guest session"}
          </span>
        </header>
        <div className="profile-title">
          <div>
            <span className="eyebrow">A SPACE THAT SOUNDS LIKE YOU</span>
            <h1>Make yourself at home.</h1>
            <p>A few little details. A practice space that feels like yours.</p>
          </div>
          <button
            className="profile-preview-button"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Exit member preview" : "Preview member design"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        {preview && (
          <p className="profile-preview-notice" role="status">
            Design preview · Alex is a sample musician. Changes here stay in
            this tab and never update a Firebase account.
          </p>
        )}
        {authError && (
          <p className="error-message" role="alert">
            {authError}
          </p>
        )}
        {loading && !preview ? (
          <section className="profile-card profile-loading" role="status">
            Getting your practice space ready…
          </section>
        ) : (
          <ProfileDetails
            key={preview ? "preview" : user?.uid || "guest"}
            account={account}
            preview={preview}
            authBusy={authBusy !== null}
            onSignIn={signInWithGoogle}
            onSignOut={logOut}
          />
        )}
        <footer className="profile-footer">
          <span>
            <MusicMark /> Tunity
          </span>
          <p>Made for the moments between the notes.</p>
          <Link href="/workspace">
            Back to practice <span aria-hidden="true">↗</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}

function ProfileDetails({
  account,
  preview,
  authBusy,
  onSignIn,
  onSignOut,
}: {
  account: Account | null;
  preview: boolean;
  authBusy: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<Profile>(
    preview
      ? sampleProfile
      : { ...emptyProfile, preferredName: account?.displayName || "" },
  );
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    account && !preview ? "loading" : "ready",
  );
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!account || preview) return;
    let cancelled = false;
    loadProfile(account.uid)
      .then((saved) => {
        if (!cancelled) {
          if (saved) setProfile(saved);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setError(
            "We couldn’t load your profile. Check your connection or Firebase profile permissions, then retry. Your saved details have not been changed.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account, preview, retry]);

  function update<K extends keyof Profile>(field: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || loadState !== "ready") return;
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const validated = validateProfile(profile);
      if (account && !preview) await saveProfile(account.uid, validated);
      setProfile(validated);
      setMessage(
        preview
          ? "Preview updated for this tab. No account was changed."
          : account
            ? "Your profile has been saved to your account."
            : "Preferences saved for this tab. No account was created; refreshing will reset them.",
      );
    } catch (err) {
      setError(
        err instanceof Error && !account
          ? err.message
          : "Save was not confirmed. Check your connection and Firebase permissions. A pending save may still sync; reload your profile before retrying.",
      );
    } finally {
      setSaving(false);
    }
  }
  const displayName =
    profile.preferredName || account?.displayName || "Guest musician";
  const initials = account
    ? displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n.charAt(0).toUpperCase())
        .join("")
    : "♪";
  const disabled = saving || loadState !== "ready";
  return (
    <>
      <section className="profile-hero" aria-labelledby="profile-name">
        <div className="profile-hero-staff" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <b>♪</b>
          <em>♩</em>
        </div>
        <div className="profile-identity">
          <div className="profile-avatar">
            {initials}
            <span aria-hidden="true">{account ? "✓" : "♪"}</span>
          </div>
          <div>
            <span className="profile-identity-label">
              {preview
                ? "SAMPLE MEMBER PROFILE"
                : account
                  ? "YOUR MUSICIAN PROFILE"
                  : "A WARM WELCOME"}
            </span>
            <h2 id="profile-name">
              {displayName}
              <span className="profile-member-label">
                {account ? "Member" : "Guest"}
              </span>
            </h2>
            <p>
              {account
                ? `${profile.instrument} · ${profile.experience}`
                : "No sign-up. No pressure. Just you and your next note."}
            </p>
          </div>
        </div>
        <div className="profile-hero-bottom">
          <span>
            {account
              ? "A little intention goes a long way."
              : "You’re free to explore and practice as a guest."}
          </span>
          <Link href="/workspace">
            Let’s practice <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <div className="profile-columns">
        <div className="profile-primary-column">
          <section className="profile-card">
            <div className="profile-section-heading">
              <div>
                <span className="eyebrow">THE MUSICIAN BEHIND THE MUSIC</span>
                <h2>Your practice, your way.</h2>
              </div>
              <span className="profile-section-number">01</span>
            </div>
            <p className="profile-section-description">
              Tell us a little about what you play and where you want to go.
            </p>
            {loadState === "loading" && (
              <p role="status" className="profile-inline-status">
                Loading your saved preferences…
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            {loadState === "error" && (
              <button
                className="secondary-button"
                onClick={() => {
                  setLoadState("loading");
                  setError("");
                  setRetry((n) => n + 1);
                }}
              >
                Retry loading profile
              </button>
            )}
            <form onSubmit={save} aria-label="Practice preferences">
              <fieldset disabled={disabled} className="profile-fieldset">
                <div className="profile-form-row">
                  <label className="field-label">
                    {account ? "Preferred name" : "Name for this session"}
                    <input
                      value={profile.preferredName}
                      onChange={(e) => update("preferredName", e.target.value)}
                      maxLength={60}
                      placeholder="What should we call you?"
                      autoComplete="nickname"
                    />
                  </label>
                  <label className="field-label">
                    Your instrument
                    <select
                      value={profile.instrument}
                      onChange={(e) => update("instrument", e.target.value)}
                    >
                      {instruments.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field-label">
                  Where are you in your musical journey?
                  <select
                    value={profile.experience}
                    onChange={(e) => update("experience", e.target.value)}
                  >
                    {levels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  What are you working toward?
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={profile.goal}
                    onChange={(e) => update("goal", e.target.value)}
                    placeholder="A steadier tone, that tricky passage, your next audition…"
                  />
                  <small className="profile-character-count">
                    {profile.goal.length}/300
                  </small>
                </label>
                <div className="profile-practice-goal">
                  <div>
                    <label htmlFor="daily-minutes">
                      Make a little time for music.
                    </label>
                    <p>A daily intention, at your own pace.</p>
                  </div>
                  <div className="profile-minutes">
                    <input
                      id="daily-minutes"
                      type="number"
                      min={5}
                      max={120}
                      step={1}
                      required
                      value={profile.dailyMinutes}
                      onChange={(e) =>
                        update("dailyMinutes", e.target.valueAsNumber)
                      }
                    />
                    <span>min / day</span>
                  </div>
                </div>
                <div className="profile-save-row">
                  <span>
                    {preview
                      ? "Preview only · saved in this tab"
                      : account
                        ? "Saved privately to your account"
                        : "Guest preferences stay in this tab"}
                  </span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={disabled}
                  >
                    {saving
                      ? "Saving…"
                      : preview
                        ? "Save preview"
                        : account
                          ? "Save my profile"
                          : "Save for this session"}
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </fieldset>
              <p
                className="profile-save-message"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            </form>
          </section>
          <section className="profile-card profile-journey">
            <div className="profile-section-heading">
              <div>
                <span className="eyebrow">EVERY NOTE IS A NEW START</span>
                <h2>Your next chapter.</h2>
              </div>
              <span className="profile-section-number">02</span>
            </div>
            <div className="profile-empty-activity">
              <span className="profile-notes" aria-hidden="true">
                ♩ ♫ ♪
              </span>
              <div>
                <h3>Progress starts with showing up.</h3>
                <p>
                  Your profile is a starting point. Head to your workspace to
                  upload a recording and find your next focus.
                </p>
                <Link href="/workspace">
                  Go to my workspace <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>
        </div>
        <aside
          className="profile-secondary-column"
          aria-label="Account and privacy"
        >
          <section className="profile-card profile-account-card">
            <span className="eyebrow">YOUR SPACE IN TUNITY</span>
            <h2>{account ? "A place to return to." : "Come as you are."}</h2>
            <p>
              {account
                ? "Your Google account keeps your musician profile connected."
                : "A guest session is all you need to start exploring. Sign in whenever you’re ready."}
            </p>
            <div className="profile-account-divider" />
            {account ? (
              <>
                <div className="profile-google-identity">
                  <GoogleMark />
                  <div>
                    <strong>Connected with Google</strong>
                    <span>{account.email}</span>
                  </div>
                </div>
                <dl className="profile-account-facts">
                  <div>
                    <dt>Profile visibility</dt>
                    <dd>Private</dd>
                  </div>
                  <div>
                    <dt>Profile storage</dt>
                    <dd>{preview ? "Sample only" : "Firebase"}</dd>
                  </div>
                </dl>
                {!preview && (
                  <button
                    className="secondary-button full-width"
                    disabled={authBusy || saving}
                    onClick={() => void onSignOut()}
                  >
                    Sign out &amp; use as guest
                  </button>
                )}
              </>
            ) : (
              <>
                <ul className="profile-benefits">
                  <li>
                    <span>✓</span> Save your musician profile
                  </li>
                  <li>
                    <span>✓</span> Keep your practice preferences
                  </li>
                  <li>
                    <span>✓</span> Return on another device
                  </li>
                </ul>
                <button
                  className="profile-google-button"
                  disabled={authBusy}
                  onClick={() => void onSignIn()}
                >
                  <GoogleMark />
                  {authBusy ? "Connecting…" : "Continue with Google"}
                </button>
                <Link className="profile-guest-choice" href="/workspace">
                  Keep practicing as a guest →
                </Link>
              </>
            )}
            <small className="profile-account-footnote">
              {preview
                ? "Sample identity. No real account is connected in this preview."
                : account
                  ? "Your Google email is shown here for you. It is not editable in Tunity."
                  : "No account is created when you continue as a guest."}
            </small>
          </section>
          <section className="profile-privacy">
            <span aria-hidden="true">♧</span>
            <div>
              <h3>A little space, just for you.</h3>
              <p>
                {account
                  ? "Profile preferences are separate from your recordings. Project and recording storage is unchanged."
                  : "Guest preferences live only in this tab. Save any analysis you want to keep before leaving."}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
