"use client";

import { useState } from "react";
import { aiPost } from "@/lib/studio/ai-client";
import { INSTRUMENTS, KEYS, TIME_SIGNATURES } from "@/lib/studio/etude";
import type { EtudeResult } from "@/lib/studio/types";
import { ScorePlayer } from "./score-player";
import { ScoreView } from "./score-view";
import "./studio.css";

/** Starting point for the writer; session fields come from one analyzed take. */
export type EtudeSeed = {
  prompt?: string;
  weaknesses?: string[];
  session?: string;
  context?: string;
  summary?: string;
  instrument?: string;
  keyName?: string;
  timeSignature?: string;
  tempoBpm?: number;
  collection?: string;
};

const EXAMPLES = [
  "8-measure trumpet exercise in C major focused on sixteenth-note rhythms",
  "Lip slur warm-up moving between partials, slow and legato",
  "Short articulation study mixing staccato eighths and accented quarters",
  "Triplet vs. eighth-note rhythm contrast study in 4/4",
];

/** Generates a playable MusicXML etude and lets the student save it to Practice Pieces. */
export function EtudeWriter({ seed, defaultInstrument, collections, onSave }: {
  seed?: EtudeSeed;
  defaultInstrument: string;
  collections: string[];
  onSave: (etude: EtudeResult, collection: string, prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(seed?.prompt ?? "");
  const [weaknesses, setWeaknesses] = useState(seed?.weaknesses ?? []);
  const [context, setContext] = useState(seed?.context ?? "");
  const [instrument, setInstrument] = useState(
    INSTRUMENTS.some((i) => i.name === seed?.instrument) ? seed!.instrument! : defaultInstrument);
  const [key, setKey] = useState(KEYS.some((k) => k.name === seed?.keyName) ? seed!.keyName! : "auto");
  const [measures, setMeasures] = useState(8);
  const [timeSignature, setTimeSignature] = useState(
    (TIME_SIGNATURES as readonly string[]).includes(seed?.timeSignature ?? "") ? seed!.timeSignature! : "auto");
  const [tempo, setTempo] = useState(seed?.tempoBpm ? String(seed.tempoBpm) : "");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [etude, setEtude] = useState<EtudeResult>();
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState(seed?.collection ?? collections[0] ?? "Etudes");
  const [saving, setSaving] = useState(false);

  async function generate(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await aiPost<EtudeResult>("/api/ai/etude", {
        prompt, weaknesses, context, instrument, key, measures, timeSignature, difficulty,
        tempoBpm: tempo ? Number(tempo) : null,
      });
      setEtude(result);
      setTitle(result.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The etude could not be written right now.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!etude) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...etude, title: title.trim() || etude.title }, collection.trim() || "Etudes", prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The piece could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="etude-writer">
      <header className="etude-header">
        <span className="eyebrow">AI ETUDE WRITER</span>
        <h2 id="dialog-title">{etude ? "Your new etude" : seed?.session ? `Practice for “${seed.session}”` : "Write a practice piece."}</h2>
        <p className="dialog-intro">
          {etude
            ? etude.description
            : "Describe the exercise and Tunity will write, validate, and prepare playable MusicXML."}
        </p>
      </header>
      {!etude ? (
        <form className="etude-form" onSubmit={generate}>
          {context && (
            <div className="etude-session">
              <span>New exercise with a similar structure</span>
              <p>{seed?.summary || "Uses the piece’s meter and phrasing, with new notes focused on the mistake."}</p>
              <button type="button" disabled={busy} onClick={() => setContext("")}>Use a different structure</button>
            </div>
          )}
          {!!weaknesses.length && (
            <div className="etude-weaknesses">
              <span>{seed?.session ? "Targeting from this take" : "Targeting from your coach"}</span>
              {weaknesses.map((w, i) => (
                <button type="button" key={i} title="Remove" onClick={() => setWeaknesses(weaknesses.filter((_, j) => j !== i))}>{w.length > 90 ? `${w.slice(0, 90)}…` : w} ×</button>
              ))}
            </div>
          )}
          <label className="field-label etude-prompt">What should it practice?
            <textarea className="studio-textarea" value={prompt} maxLength={600} rows={3} disabled={busy}
              placeholder={seed?.session ? "Optional: add a style or goal, e.g. ragtime feel, lyrical slurs, march-style articulation" : EXAMPLES[0]} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <div className="etude-examples">
            <span>Quick ideas</span>
            {EXAMPLES.map((x) => <button type="button" key={x} disabled={busy} onClick={() => setPrompt(x)}>{x}</button>)}
          </div>
          <div className="etude-options">
            <label className="field-label">Instrument
              <select value={instrument} disabled={busy} onChange={(e) => setInstrument(e.target.value)}>
                {INSTRUMENTS.map((i) => <option key={i.name}>{i.name}</option>)}
              </select>
            </label>
            <label className="field-label">Written key
              <select value={key} disabled={busy} onChange={(e) => setKey(e.target.value)}>
                <option value="auto">From my description</option>
                {KEYS.map((k) => <option key={k.name}>{k.name}</option>)}
              </select>
            </label>
            <label className="field-label">Measures
              <select value={measures} disabled={busy} onChange={(e) => setMeasures(Number(e.target.value))}>
                {[4, 8, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="field-label">Time signature
              <select value={timeSignature} disabled={busy} onChange={(e) => setTimeSignature(e.target.value)}>
                <option value="auto">From my description</option>
                {TIME_SIGNATURES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field-label">Tempo (♩ BPM)
              <input type="number" min={40} max={208} placeholder="Auto" value={tempo} disabled={busy} onChange={(e) => setTempo(e.target.value)} />
            </label>
            <label className="field-label">Level
              <select value={difficulty} disabled={busy} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <footer className="etude-generate-footer">
            <p>Usually ready in under a minute.</p>
            <button type="submit" className="primary-button" disabled={busy || (!prompt.trim() && !weaknesses.length)}>
              {busy ? <><span className="spinner" /> Composing and checking…</> : "Generate Etude ✦"}
            </button>
          </footer>
        </form>
      ) : (
        <>
          <div className="piece-facts">
            <span>{etude.instrument}</span><span>{etude.keyName}</span><span>{etude.meter}</span>
            <span>♩ = {etude.tempoBpm}</span><span>{etude.measures} measures</span>
          </div>
          <div className="etude-score-stage">
            <ScoreView key={etude.xml} xml={etude.xml} label={`${etude.title} notation`} />
          </div>
          <section className="etude-practice-panel" aria-label="Playback and practice tips">
            <ScorePlayer score={etude.reference} />
            {!!etude.tips.length && (
              <div className="etude-tips">
                <strong>Practice notes</strong>
                <ul className="piece-tips">{etude.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
          </section>
          <section className="etude-save-section">
            <h3>Save your etude</h3>
            <div className="etude-save">
              <label className="field-label">Title
                <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field-label">Collection
                <input list="piece-collections" value={collection} maxLength={40} onChange={(e) => setCollection(e.target.value)} />
                <datalist id="piece-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
          </section>
          {error && <p className="error-message" role="alert">{error}</p>}
          <footer className="etude-result-footer">
            <div>
              <button className="secondary-button" disabled={busy || saving} onClick={() => { setEtude(undefined); }}>← Edit request</button>
              <button className="secondary-button" disabled={busy || saving} onClick={() => void generate()}>
                {busy ? <><span className="spinner" /> Rewriting…</> : "Try another version"}
              </button>
            </div>
            <button className="primary-button" disabled={busy || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save to Practice Pieces"}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
