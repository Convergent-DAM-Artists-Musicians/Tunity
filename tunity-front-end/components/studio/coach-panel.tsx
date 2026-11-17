"use client";

import { useEffect, useId, useRef, useState } from "react";
import { aiPost } from "@/lib/studio/ai-client";
import { compactResult, type AnalysisResult, type EvidenceRef } from "@/lib/studio/analysis";
import type { CoachResult, TakeMessage } from "@/lib/studio/types";
import { CATEGORY_LABELS, EvidenceChips, type FocusRequest } from "./evidence";
import "./studio.css";

type Props = {
  title: string;
  result: AnalysisResult;
  coach?: CoachResult;
  chat?: TakeMessage[];
  onCoach: (coach: CoachResult) => void;
  onChat: (chat: TakeMessage[]) => void;
  onFocus: (focus: FocusRequest) => void;
  onEtude?: (weaknesses: string[]) => void;
  className?: string;
};

/** AI coach summary and Ask This Take chat, grounded in one analysis result. */
export function CoachPanel({ title, result, coach, chat = [], onCoach, onChat, onFocus, onEtude, className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const requested = useRef(false);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      onCoach(await aiPost<CoachResult>("/api/ai/coach", { title, result: compactResult(result) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coaching is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (coach || requested.current) return;
    requested.current = true;
    void generate();
    // Generate once per take; later runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weaknesses = (coach?.targets ?? []).map((t) =>
    `${CATEGORY_LABELS[t.category] ?? t.category}: ${t.observation}${t.evidence.length ? ` (${t.evidence.map((e) => e.message ?? e.label).slice(0, 2).join("; ")})` : ""}`);

  return (
    <section className={`studio-panel coach-panel ${expanded ? "" : "coach-collapsed"} ${className}`} aria-labelledby="coach-heading">
      <div className="studio-panel-heading">
        <div>
          <span className="studio-eyebrow">AI COACH · FROM THIS ANALYSIS</span>
          <h3 id="coach-heading">Practice focus</h3>
        </div>
        <div className="coach-heading-actions">
          {expanded && (
            <button className="studio-text-button" disabled={loading} onClick={() => void generate()}>
              {coach ? "Regenerate" : "Coach this take"}
            </button>
          )}
          <button
            className="coach-collapse"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide moves" : "Show moves"}
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        </div>
      </div>
      <div id={detailsId} hidden={!expanded}>
        {loading && <p className="studio-status" role="status"><span className="spinner" /> Reading your measurements…</p>}
        {error && <p className="studio-error" role="alert">{error}</p>}
        {coach && !loading && (
          <>
            <p className="coach-summary">{coach.summary}</p>
            {coach.reliability && <p className="studio-caution">{coach.reliability}</p>}
            <ol className="coach-targets">
              {coach.targets.slice(0, 2).map((t, i) => {
                const first = t.evidence.find((e) => e.measure !== undefined || e.startSec !== undefined);
                const targetMeasures = Array.from(new Set(
                  t.evidence.flatMap((e) => e.measure ? [e.measure] : []),
                ));
                const location = targetMeasures.length
                  ? `${targetMeasures.length === 1 ? "Measure" : "Measures"} ${targetMeasures.slice(0, 2).join(", ")}`
                  : "Whole take";
                return (
                  <li key={i}>
                    <details className="coach-target">
                      <summary>
                        <span className="coach-target-title">{t.title}</span>
                        <span className="coach-target-location">{location}</span>
                        <span className={`studio-pill cat-${t.category}`}>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                        <span className="coach-target-chevron" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="coach-target-body">
                        <p>{t.observation} {t.practice}</p>
                        {first && (
                          <div className="coach-target-actions">
                            <button onClick={() => onFocus({ ...first, loop: false })}>▶ Listen</button>
                            <button onClick={() => onFocus({ ...first, loop: true })}>↻ Practice</button>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
            {!coach.targets.length && coach.encouragement && <p className="coach-encouragement">{coach.encouragement}</p>}
            {onEtude && !!coach.targets.length && (
              <button className="studio-text-button coach-etude" onClick={() => onEtude(weaknesses)}>
                Create a practice etude ✦
              </button>
            )}
          </>
        )}
      </div>
      <AskTake title={title} result={result} chat={chat} onChat={onChat} onFocus={onFocus} />
    </section>
  );
}

const SUGGESTIONS = ["What should I fix first?", "Was my timing steady?", "Which notes were out of tune?", "Which measure improved the most?"];

export function AskTake({ title, result, chat, onChat, onFocus }: Pick<Props, "title" | "result" | "onChat" | "onFocus"> & { chat: TakeMessage[] }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [chat.length, busy]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: TakeMessage[] = [...chat, { role: "user", content }];
    onChat(next);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const reply = await aiPost<{ answer: string; evidence: EvidenceRef[] }>("/api/ai/ask", {
        title, result: compactResult(result), messages: next.map(({ role, content }) => ({ role, content })),
      });
      onChat([...next, { role: "assistant", content: reply.answer, evidence: reply.evidence }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No answer is available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-take">
      <div className="ask-heading">
        <h4>Ask this take</h4>
        {!!chat.length && <button className="studio-text-button" disabled={busy} onClick={() => onChat([])}>Clear</button>}
      </div>
      <div className="ask-log" ref={log} aria-live="polite">
        {!chat.length && <p className="studio-muted">Answers use only this recording’s analysis and link to the measures they mention.</p>}
        {chat.map((m, i) => (
          <div key={i} className={`ask-message ${m.role}`}>
            <p>{m.content}</p>
            {m.evidence && <EvidenceChips refs={m.evidence} onFocus={onFocus} />}
          </div>
        ))}
        {busy && <p className="studio-status" role="status"><span className="spinner" /> Checking the analysis…</p>}
      </div>
      {!chat.length && (
        <div className="ask-suggestions">
          {SUGGESTIONS.map((s) => <button key={s} disabled={busy} onClick={() => void ask(s)}>{s}</button>)}
        </div>
      )}
      {error && <p className="studio-error" role="alert">{error}</p>}
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <input aria-label="Ask a question about this take" placeholder="Ask about a measure, note or habit…"
          value={question} maxLength={500} disabled={busy} onChange={(e) => setQuestion(e.target.value)} />
        <button type="submit" className="primary-button" disabled={busy || !question.trim()}>Ask</button>
      </form>
    </div>
  );
}
