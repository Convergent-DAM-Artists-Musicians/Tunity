"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AUDIO_ACCEPT,
  AUDIO_LIMIT_LABEL,
  MAX_RECORDINGS,
} from "@/lib/audio-model";
import { useAudio } from "./audio-provider";
import "./audio.css";
import { SheetPicker, SheetReference, SheetLibrary } from "./sheet-music";
import { type SheetChoice } from "@/lib/sheet-model";

export function AudioLibrary({ onUpload }: { onUpload?: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const { recordings, loading, saving, error, upload, remove, retry } =
    useAudio();
  const [sheet, setSheet] = useState<SheetChoice>({ kind: "none" });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const instanceId = useId();
  const busy = saving || deleting !== null;
  const unavailable = authLoading || loading || busy || (!!user && !!error);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setActionError("");
    setMessage("");
    try {
      await upload(file, title, sheet);
      setMessage(
        user
          ? "Recording saved to your profile."
          : "Recording added to this guest session. It was not saved to Firebase.",
      );
      setFile(null);
      setSheet({ kind: "none" });
      const input =
        dialog.current?.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.value = "";
      setTitle("");
      setOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Upload was not confirmed. Please reload your library before retrying.",
      );
    }
  }
  async function erase(id: string) {
    if (
      !window.confirm(
        user
          ? "Permanently delete this recording from your profile?"
          : "Remove this recording from this guest session?",
      )
    )
      return;
    setDeleting(id);
    setActionError("");
    setMessage("");
    try {
      await remove(id);
      setMessage("Recording removed.");
    } catch {
      setActionError(
        "Deletion was not confirmed. Check your connection and reload your library before retrying.",
      );
    } finally {
      setDeleting(null);
    }
  }
  return (
    <section
      className="audio-library"
      aria-labelledby={`${instanceId}-heading`}
    >
      <div className="audio-library-heading">
        <div>
          <span className="eyebrow">YOUR SOUND, IN ONE PLACE</span>
          <h2 id={`${instanceId}-heading`}>
            My recordings{" "}
            <span>
              {recordings.length}/{MAX_RECORDINGS}
            </span>
          </h2>
          <p>
            {user
              ? "Saved privately to your musician profile."
              : "Guest session · files stay in this tab and reset on refresh."}
          </p>
        </div>
        <button
          className="primary-button"
          disabled={unavailable || recordings.length >= MAX_RECORDINGS}
          onClick={() => {
            setActionError("");
            if (onUpload) onUpload();
            else setOpen(true);
          }}
        >
          + Add recording
        </button>
      </div>
      <div className="audio-library-quota">
        <span>
          Demo allowance · {AUDIO_LIMIT_LABEL} per file · {MAX_RECORDINGS}{" "}
          recordings
        </span>
        <progress
          aria-label="Recording slots used"
          max={MAX_RECORDINGS}
          value={recordings.length}
        />
      </div>
      <p className="audio-library-demo-link">
        <a href="/demo-tone.wav" download>
          Download a 2-second demo tone
        </a>{" "}
        to try an upload.
      </p>
      {loading && (
        <p className="audio-library-status" role="status">
          Loading your saved recordings…
        </p>
      )}
      {error && (
        <div className="audio-library-error">
          <p role="alert">{error}</p>
          <button className="secondary-button" onClick={retry}>
            Retry library
          </button>
        </div>
      )}
      {actionError && !open && (
        <p className="error-message" role="alert">
          {actionError}
        </p>
      )}
      <p className="audio-library-status" role="status" aria-live="polite">
        {message}
      </p>
      {!loading && !error && !recordings.length && (
        <div className="audio-library-empty">
          <span aria-hidden="true">♪</span>
          <div>
            <h3>Your next take belongs here.</h3>
            <p>
              Add a short recording to listen back
              {user
                ? " and keep it on your profile."
                : ". You can try it without an account."}
            </p>
          </div>
        </div>
      )}
      <div className="audio-library-list">
        {recordings.map((recording) => (
          <article className="audio-recording" key={recording.id}>
            <div className="audio-recording-info">
              <span className="audio-recording-icon" aria-hidden="true">
                ♫
              </span>
              <div>
                <h3>{recording.title}</h3>
                <p>
                  {recording.name} · {(recording.size / 1024).toFixed(0)} KiB
                </p>
                <span className="audio-recording-badge">
                  {recording.saved
                    ? "Saved to profile"
                    : user
                      ? "Confirming save…"
                      : "This tab only"}
                </span>
              </div>
              <button
                className="text-button"
                aria-label={`Delete ${recording.title}`}
                disabled={busy}
                onClick={() => void erase(recording.id)}
              >
                {deleting === recording.id ? "Deleting…" : "Delete"}
              </button>
            </div>
            {recording.contentType.startsWith("video/") ? <video controls preload="metadata" src={recording.url} aria-label={`Play ${recording.title}`} /> : <audio
              controls
              preload="none"
              src={recording.url}
              aria-label={`Play ${recording.title}`}
            />}
            <SheetReference reference={recording.sheetMusic} />
          </article>
        ))}
      </div>
      {recordings.length >= MAX_RECORDINGS && (
        <p className="audio-library-status">
          All five slots are in use. Delete a recording to make room.
        </p>
      )}
      <SheetLibrary />
      {!onUpload && (
        <dialog
          ref={dialog}
          className="project-dialog"
          aria-labelledby={`${instanceId}-upload`}
          onCancel={(event) => {
            if (saving) event.preventDefault();
            else setOpen(false);
          }}
        >
          <div className="dialog-content">
            <button
              className="dialog-close"
              aria-label="Close recording upload"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">MAKE ROOM FOR PROGRESS</span>
            <h2 id={`${instanceId}-upload`}>Add a recording.</h2>
            <p className="dialog-intro">
              {user
                ? "A short take, saved to your profile."
                : "Try a short take. No account needed."}
            </p>
            <form onSubmit={submit}>
              <label className="field-label">
                Recording title
                <input
                  value={title}
                  maxLength={100}
                  disabled={saving}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Trumpet warm-up"
                />
              </label>
              <label className="field-label">
                Audio or video file
                <input
                  type="file"
                  accept={AUDIO_ACCEPT}
                  required
                  disabled={saving}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <p className="upload-help">
                Up to {AUDIO_LIMIT_LABEL}. A short compressed MP3 is ideal for
                this demo. Short MP4, MOV, and WebM videos are also supported.
              </p>
              <SheetPicker value={sheet} onChange={setSheet} disabled={saving} />
              {actionError && (
                <p className="error-message" role="alert">
                  {actionError}
                </p>
              )}
              <button
                className="primary-button full-width"
                type="submit"
                disabled={!file || unavailable}
              >
                {saving
                  ? "Saving recording…"
                  : user
                    ? "Save to my profile"
                    : "Add to this session"}
              </button>
              <p className="privacy-note">
                {user
                  ? "Saved only after Firebase confirms the upload."
                  : "Your recording will not be uploaded to Firebase."}
              </p>
            </form>
          </div>
        </dialog>
      )}
    </section>
  );
}
