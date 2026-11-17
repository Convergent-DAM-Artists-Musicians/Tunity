"use client";

import { useEffect, useRef, useState } from "react";
import { aiPost } from "@/lib/studio/ai-client";
import type { StudyGuide as Guide, StudySource } from "@/lib/studio/types";
import { ScorePlayer } from "./score-player";
import { ScoreView } from "./score-view";
import "./studio.css";

/** Pre-recording study guide for an uploaded or saved score. */
export function StudyGuide({ source, cached, instrument, onResult, onRecord, onBack, onSave }: {
  source: StudySource;
  cached?: Guide;
  instrument?: string;
  onResult: (guide: Guide) => void;
  onRecord: () => void;
  onBack?: () => void;
  onSave?: (guide: Guide) => Promise<void>;
}) {
  const [guide, setGuide] = useState(cached);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partId, setPartId] = useState("");
  const [xml, setXml] = useState<string>();
  const [saved, setSaved] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (/\.(xml|musicxml)$/i.test(source.file.name)) void source.file.text().then(setXml);
  }, [source.file]);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("score", source.file);
      if (instrument) form.append("instrument", instrument);
      if (partId.trim()) form.append("partId", partId.trim());
      const result = await aiPost<Guide>("/api/ai/study", form);
      setGuide(result);
      onResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The study guide could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (cached || requested.current) return;
    requested.current = true;
    void run();
    // Prepare once on open; later runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsPart = /Choose partId/.test(error);
  return (
    <div className="study-guide">
      <span className="eyebrow">STUDY GUIDE · BEFORE YOU RECORD</span>
      <h2 id="dialog-title">{guide?.facts.title && guide.facts.title !== "Untitled score" ? guide.facts.title : source.title}</h2>
      <p className="dialog-intro file-caption">{source.file.name}</p>
      {busy && <p className="studio-status" role="status"><span className="spinner" /> Reading the score and planning your practice…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {needsPart && (
        <form className="study-part" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <label className="field-label">Part ID to study (from the list above)
            <input value={partId} maxLength={40} onChange={(e) => setPartId(e.target.value)} placeholder="e.g. P1" />
          </label>
          <button className="secondary-button" disabled={busy || !partId.trim()}>Use this part</button>
        </form>
      )}
      {!guide && !busy && !needsPart && error && <button className="secondary-button" onClick={() => void run()}>Try again</button>}
      {guide && (
        <>
          <div className="piece-facts">
            <span>{guide.facts.partName}</span><span>{guide.facts.meter}</span><span>♩ = {guide.facts.tempoBpm}</span>
            <span>{guide.facts.measureCount} measures</span><span>{guide.facts.durationSec}s</span>
            {guide.facts.concertRange && <span>Range {guide.facts.concertRange.low}–{guide.facts.concertRange.high} (concert)</span>}
          </div>
          <ScoreView key={xml} xml={xml} label="Score notation" />
          <ScorePlayer score={guide.reference} label="Hear the whole piece" />
          <p className="coach-summary">{guide.overview}</p>

          <section className="study-section">
            <h3>Tempo plan</h3>
            <div className="tempo-ladder">
              {guide.tempoSteps.map((t, i) => <span key={i} data-final={t === guide.facts.tempoBpm}>♩ {t}</span>)}
            </div>
            <p>{guide.startingTempo.why}</p>
          </section>

          <section className="study-section">
            <h3>Passages to learn first</h3>
            <ol className="study-passages">
              {guide.passages.map((p, i) => (
                <li key={i}>
                  <div className="coach-target-top">
                    <span className="coach-number">{i + 1}</span>
                    <span className="studio-pill">M{p.startMeasure}{p.endMeasure !== p.startMeasure ? `–${p.endMeasure}` : ""}</span>
                    <h4>{p.title}</h4>
                  </div>
                  <p>{p.why}</p>
                  <p className="coach-practice"><strong>Practice</strong>{p.practice}</p>
                  <ScorePlayer score={guide.reference} from={p.startMeasure} to={p.endMeasure} label="Hear passage" compact />
                </li>
              ))}
            </ol>
          </section>

          <section className="study-section">
            <h3>Suggested breathing points</h3>
            {guide.facts.longestStretch.seconds > 0 && (
              <p className="studio-muted">Longest stretch without a natural break: {guide.facts.longestStretch.seconds}s
                {guide.facts.longestStretch.fromMeasure ? ` (M${guide.facts.longestStretch.fromMeasure}–${guide.facts.longestStretch.toMeasure})` : ""} at the written tempo.</p>
            )}
            <ul className="study-breaths">
              {guide.breaths.map((b) => (
                <li key={b.id}><strong>M{b.measure} · beat {b.beat}</strong><span>{b.reason}</span><p>{b.advice}</p></li>
              ))}
            </ul>
          </section>

          <section className="study-section">
            <h3>Warm-ups for this piece</h3>
            <ul className="study-warmups">
              {guide.warmUps.map((w, i) => <li key={i}><strong>{w.title}</strong><span>{w.minutes} min</span><p>{w.instructions}</p></li>)}
            </ul>
          </section>

          {!!guide.checklist.length && (
            <section className="study-section">
              <h3>Before you press record</h3>
              <ul className="piece-tips">{guide.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </section>
          )}
          {!!guide.reference.warnings.length && (
            <details className="studio-details"><summary>Score import notes</summary>
              {guide.reference.warnings.map((w, i) => <p key={i} className="analysis-warning">{w}</p>)}
            </details>
          )}
          <p className="studio-footnote">Measures, breathing candidates and tempo come from the notation; the advice is written by AI.</p>
        </>
      )}
      <div className="studio-actions">
        {onBack && <button className="secondary-button" onClick={onBack}>← Back to upload</button>}
        {onSave && guide && (
          <button className="secondary-button" disabled={saved} onClick={() => void onSave(guide).then(() => setSaved(true), (e) => setError(e instanceof Error ? e.message : "Could not save."))}>
            {saved ? "Saved to Practice Pieces ✓" : "Save to Practice Pieces"}
          </button>
        )}
        {guide && <button className="secondary-button" disabled={busy} onClick={() => void run()}>Refresh guide</button>}
        <button className="primary-button" onClick={onRecord}>{onBack ? "Ready to record" : "Record this piece"} →</button>
      </div>
    </div>
  );
}
