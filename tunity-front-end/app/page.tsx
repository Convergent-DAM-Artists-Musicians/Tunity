"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import "./landing.css";

const GUEST_SESSION_KEY = "tunity:guest-session";

function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
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

function Arrow() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { user, loading, authBusy, authError, signInWithGoogle } = useAuth();

  useEffect(() => {
    if (loading) return;

    // Returning Google users go directly to their workspace.
    if (user) {
      try {
        sessionStorage.removeItem(GUEST_SESSION_KEY);
      } catch {
        // Browser storage may be disabled.
      }

      router.replace("/workspace");
      return;
    }

    // Remember the guest choice for the current tab.
    try {
      if (sessionStorage.getItem(GUEST_SESSION_KEY) === "true") {
        router.replace("/workspace");
      }
    } catch {
      // The landing page still works without browser storage.
    }
  }, [user, loading, router]);

  function continueAsGuest() {
    try {
      sessionStorage.setItem(GUEST_SESSION_KEY, "true");
    } catch {
      // Navigation does not require storage.
    }

    router.push("/workspace");
  }

  return (
    <main className="entry-landing">
      <header className="entry-header">
        <span className="entry-logo">
          <span aria-hidden="true">♪</span> Tunity
        </span>

        <span className="entry-headerNote">
          <i /> A space for your sound
        </span>
      </header>

      <div className="entry-content">
        <section
          className="entry-introduction"
          aria-labelledby="welcome-title"
        >
          <span className="entry-eyebrow">YOUR PRACTICE, IN TUNE</span>

          <h1 id="welcome-title">
            Your next
            <br />
            great take
            <br />
            <em>starts here.</em>
          </h1>

          <p>
            Bring your music. Find your focus. Turn a little practice into a
            sound that feels like you.
          </p>

          <div className="entry-features">
            <div>
              <span>01</span>
              <strong>Record</strong>
              <small>Capture your performance.</small>
            </div>
            <div>
              <span>02</span>
              <strong>Reflect</strong>
              <small>Find your next focus.</small>
            </div>
            <div>
              <span>03</span>
              <strong>Grow</strong>
              <small>Make room for progress.</small>
            </div>
          </div>

          <div className="entry-music" aria-hidden="true">
            <i /><i /><i /><i /><i />
            <span>♩</span>
            <b>♪</b>
          </div>
        </section>

        <section className="entry-card" aria-labelledby="entry-title">
          <span className="entry-cardIcon" aria-hidden="true">♪</span>
          <span className="entry-eyebrow">WELCOME TO TUNITY</span>

          <h2 id="entry-title">
            Make yourself
            <br />
            at home.
          </h2>

          <p>
            Sign in to keep your musician profile connected, or step right in
            as a guest.
          </p>

          {authError && (
            <p className="entry-error" role="alert">
              {authError}
            </p>
          )}

          <button
            className="entry-googleButton"
            disabled={loading || !!authBusy || !!user}
            onClick={() => void signInWithGoogle()}
          >
            <GoogleMark />
            {authBusy === "signin"
              ? "Connecting to Google…"
              : "Continue with Google"}
          </button>

          <div className="entry-divider">
            <span />or<span />
          </div>

          <button
            className="entry-guestButton"
            disabled={loading || !!authBusy || !!user}
            onClick={continueAsGuest}
          >
            Continue as guest <Arrow />
          </button>

          <p className="entry-guestNote">
            No account needed. Guest projects reset on refresh.
          </p>

          <div className="entry-cardFooter" role="status" aria-live="polite">
            {loading
              ? "Checking your session…"
              : user
                ? "Opening your workspace…"
                : "A little every day. At your own pace."}
          </div>
        </section>
      </div>

      <footer className="entry-footer">
        <span>Made for the moments between the notes.</span>
        <span>Record. Reflect. Find your rhythm.</span>
      </footer>
    </main>
  );
}