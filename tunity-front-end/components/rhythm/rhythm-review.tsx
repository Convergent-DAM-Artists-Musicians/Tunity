"use client";

import { useEffect, useRef, useState } from "react";
import "./rhythm-review.css";
import { ExpressionReview } from "./expression-review";
import type { PerformanceInsights } from "../../../back-end/performance-analyzer/src/types";
import type { ReviewFocus } from "@/lib/studio/analysis";
const styles = {
  actions: "rr-actions",
  active: "rr-active",
  axis: "rr-axis",
  chart: "rr-chart",
  chartScroll: "rr-chartScroll",
  count: "rr-count",
  detail: "rr-detail",
  detailHeading: "rr-detailHeading",
  dim: "rr-dim",
  expected: "rr-expected",
  explanation: "rr-explanation",
  extra: "rr-extra",
  eyebrow: "rr-eyebrow",
  findingList: "rr-findingList",
  flagKey: "rr-flagKey",
  flagged: "rr-flagged",
  footnote: "rr-footnote",
  gridline: "rr-gridline",
  group: "rr-group",
  heading: "rr-heading",
  issueCount: "rr-issueCount",
  laneLabel: "rr-laneLabel",
  lanes: "rr-lanes",
  legend: "rr-legend",
  listen: "rr-listen",
  lowerLabel: "rr-lowerLabel",
  measures: "rr-measures",
  metrics: "rr-metrics",
  missing: "rr-missing",
  muted: "rr-muted",
  note: "rr-note",
  played: "rr-played",
  playedKey: "rr-playedKey",
  playhead: "rr-playhead",
  quiet: "rr-quiet",
  rest: "rr-rest",
  review: "rr-review",
  scoreKey: "rr-scoreKey",
  status: "rr-status",
  textButton: "rr-textButton",
  toolbar: "rr-toolbar",
  transport: "rr-transport",
  warning: "rr-warning",
};

export type RhythmEventView = {
  expectedId: string;
  kind: "note" | "rest";
  measure: string;
  beat: number;
  rhythmLabel: string;
  targetStartSec: number;
  targetEndSec: number;
  actualStartSec?: number;
  actualEndSec?: number;
  timingErrorMs?: number;
};
type Finding = {
  category?: string;
  expectedId?: string;
  kind: string;
  message: string;
  startSec: number;
  endSec?: number;
  measure?: string;
  beat?: number;
  confidence?: number;
  status?: string;
};
type Group = {
  id: string;
  label: string;
  status: string;
  message: string;
  confidence: number;
  eventIds?: string[];
};
type Props = {
  events: RhythmEventView[];
  findings: Finding[];
  groups?: Group[];
  audio?: File;
  alignment?: { confidence: number; ambiguous: boolean };
  hasReference?: boolean;
  insights?: PerformanceInsights;
  previous?: {
    name: string;
    findings: Finding[];
    insights: PerformanceInsights;
  };
  onRetry?: () => void;
  /** Jump to a measure or note and play it; a new nonce triggers the jump. */
  focus?: ReviewFocus;
};
const number = (n: number) => Number(n.toFixed(3));
const timing = (n?: number) =>
  n === undefined
    ? "Not matched"
    : Math.abs(n) < 0.5
      ? "On target"
      : `${Math.round(Math.abs(n))} ms ${n < 0 ? "early" : "late"}`;

export function PerformanceReview({
  events,
  findings: allFindings,
  groups = [],
  audio,
  alignment,
  insights,
  previous,
  onRetry,
  focus,
  hasReference = true,
}: Props) {
  const measures = [...new Set(events.map((e) => e.measure))];
  const [category, setCategory] = useState("all");
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const referencePlayer = useRef<AudioContext | null>(null);
  useEffect(
    () => () => {
      void referencePlayer.current?.close();
    },
    [],
  );
  const findings =
    category === "all"
      ? allFindings
      : allFindings.filter((f) => (f.category ?? "rhythm") === category);
  const [measureIndex, setMeasureIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [playError, setPlayError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const startAt = useRef(0);
  const stopAt = useRef<number | null>(null);
  useEffect(() => {
    const player = audioRef.current;
    if (!audio || !player) return;
    const url = URL.createObjectURL(audio);
    player.src = url;
    return () => {
      player.pause();
      player.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [audio]);
  const focusEvent = focus?.expectedId ? events.find((e) => e.expectedId === focus.expectedId) : undefined;
  const focusMeasure = focusEvent?.measure ?? focus?.measure ??
    (focus?.startSec !== undefined
      ? events.find((e) => Math.max(e.targetEndSec, e.actualEndSec ?? 0) >= focus.startSec!)?.measure
      : undefined);
  const [appliedFocus, setAppliedFocus] = useState<number>();
  if (focus && focus.nonce !== appliedFocus) {
    setAppliedFocus(focus.nonce);
    setCategory("all");
    const index = focusMeasure === undefined ? -1 : measures.indexOf(focusMeasure);
    if (index >= 0) {
      setMeasureIndex(index);
      setSelectedId(focusEvent?.expectedId);
    }
    if (focus.loop !== undefined) setLoop(focus.loop);
  }
  useEffect(() => {
    if (!focus) return;
    audioRef.current?.pause();
    stopAt.current = null;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const inMeasure = events.filter((e) => e.measure === focusMeasure);
    const from = focus.startSec ?? (inMeasure.length ? Math.min(...inMeasure.map((e) => Math.min(e.targetStartSec, e.actualStartSec ?? Infinity))) : undefined);
    const to = focus.endSec ?? (inMeasure.length ? Math.max(...inMeasure.map((e) => Math.max(e.targetEndSec, e.actualEndSec ?? 0))) : undefined);
    if (audio && from !== undefined) void listen(Math.max(0, from - 0.25), (to ?? from + 0.8) + 0.25);
    // Each focus request is applied once, identified by its nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  const measure = measures[measureIndex] ?? measures[0];
  const current = events.filter((e) => e.measure === measure);
  const flagged = (e: RhythmEventView) =>
    findings.filter((f) => f.expectedId === e.expectedId);
  const selected =
    current.find((e) => e.expectedId === selectedId) ??
    current.find((e) => flagged(e).length > 0) ??
    current[0];
  if (!selected) return null;
  const measureFindings = findings.filter(
    (f) =>
      f.measure === measure ||
      current.some((e) => e.expectedId === f.expectedId),
  );
  const selectedFindings = flagged(selected);
  const currentGroups = groups.filter((g) =>
    g.eventIds?.some((id) => current.some((e) => e.expectedId === id)),
  );
  const start = Math.max(
    0,
    Math.min(
      ...current.map((e) =>
        Math.min(e.targetStartSec, e.actualStartSec ?? Infinity),
      ),
    ) - 0.12,
  );
  const end =
    Math.max(
      ...current.map((e) => Math.max(e.targetEndSec, e.actualEndSec ?? 0)),
      ...measureFindings.map((f) => f.endSec ?? f.startSec),
    ) + 0.12;
  const span = Math.max(0.2, end - start);
  const left = (time: number) =>
    `${Math.max(0, Math.min(100, ((time - start) / span) * 100))}%`;
  const width = (a: number, b: number) =>
    `${Math.max(0.5, Math.min(100, ((b - a) / span) * 100))}%`;
  const extras = measureFindings.filter((f) => f.kind === "extra_note");
  const move = (index: number) => {
    audioRef.current?.pause();
    stopAt.current = null;
    void referencePlayer.current?.close();
    referencePlayer.current = null;
    setMeasureIndex(index);
    setSelectedId(undefined);
  };
  async function listen(from: number, to: number) {
    const player = audioRef.current;
    if (!player || !audio) return;
    void referencePlayer.current?.close();
    referencePlayer.current = null;
    player.playbackRate = rate;
    player.preservesPitch = true;
    startAt.current = Math.max(0, from);
    player.currentTime = startAt.current;
    stopAt.current = to;
    setPlayError("");
    try {
      await player.play();
    } catch {
      setPlayError(
        "This browser cannot play the recording. Try a WAV or MP3 file.",
      );
    }
  }
  async function listenReference() {
    audioRef.current?.pause();
    await referencePlayer.current?.close();
    const context = new AudioContext();
    referencePlayer.current = context;
    await context.resume();
    for (const e of current) {
      const midi =
        insights?.scoreNotes?.find((n) => n.expectedId === e.expectedId)
          ?.midi ??
        insights?.notes.find((n) => n.expectedId === e.expectedId)
          ?.expectedMidi;
      if (e.kind === "rest" || midi === undefined) continue;
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      const from =
        context.currentTime + 0.05 + (e.targetStartSec - start) / rate;
      const to = from + (e.targetEndSec - e.targetStartSec) / rate;
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(0.12, Math.min(to, from + 0.015));
      gain.gain.setValueAtTime(0.12, Math.max(from + 0.015, to - 0.02));
      gain.gain.linearRampToValueAtTime(0, to);
      oscillator.start(from);
      oscillator.stop(to + 0.01);
    }
  }
  const selectedMeasurement = insights?.notes.find(
    (n) => n.expectedId === selected.expectedId,
  );
  const jumpIssue = () => {
    for (let step = 1; step <= measures.length; step++) {
      const index = (measureIndex + step) % measures.length;
      if (
        findings.some(
          (f) =>
            f.measure === measures[index] ||
            events.some(
              (e) =>
                e.measure === measures[index] && e.expectedId === f.expectedId,
            ),
        )
      ) {
        move(index);
        return;
      }
    }
  };
  return (
    <section
      ref={sectionRef}
      className={styles.review}
      aria-label="Interactive performance review"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>PERFORMANCE REVIEW</span>
          <h3>Your playing, in focus</h3>
          <p>
            Compare your recording with the score. Select a note to explore it.
          </p>
        </div>
        <span className={styles.count}>
          {findings.length} {findings.length === 1 ? "finding" : "findings"} to
          review
        </span>
      </div>
      {insights && (
        <div className="rr-categories" aria-label="Explore feedback">
          <button
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            <strong>Overview</strong>
            <span>{allFindings.length} findings</span>
          </button>
          {insights.categories.map((c) => (
            <button
              key={c.id}
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                const first = allFindings.find(
                  (f) =>
                    f.category === c.id &&
                    f.expectedId &&
                    events.some((e) => e.expectedId === f.expectedId),
                );
                if (first) {
                  const event = events.find(
                    (e) => e.expectedId === first.expectedId,
                  )!;
                  move(measures.indexOf(event.measure));
                  setSelectedId(event.expectedId);
                } else if (c.id !== "rhythm") {
                  setSelectedId(
                    current.find((e) => e.kind === "note")?.expectedId,
                  );
                }
              }}
              title={c.detail}
            >
              <strong>{c.label}</strong>
              <span>
                {c.status === "assessed"
                  ? `${allFindings.filter((f) => f.category === c.id).length} findings`
                  : c.status === "observed"
                    ? "Measurements"
                    : "Unavailable"}
              </span>
            </button>
          ))}
        </div>
      )}
      {category !== "all" && (
        <p className="rr-categoryHelp">
          {insights?.categories.find((c) => c.id === category)?.detail}
        </p>
      )}
      {hasReference &&
        alignment &&
        (alignment.ambiguous || alignment.confidence < 0.6) && (
          <p className={styles.warning}>
            Alignment needs review. These positions are estimates, not confirmed
            mistakes.
          </p>
        )}
      <nav className={styles.measures} aria-label="Choose a measure">
        {measures.map((m, i) => {
          const count = findings.filter(
            (f) =>
              f.measure === m ||
              events.some(
                (e) => e.measure === m && f.expectedId === e.expectedId,
              ),
          ).length;
          return (
            <button
              key={m}
              aria-pressed={measure === m}
              onClick={() => move(i)}
            >
              <span>Measure {m}</span>
              <span className={count ? styles.issueCount : styles.quiet}>
                {count ? `${count} to review` : "No flags"}
              </span>
            </button>
          );
        })}
      </nav>
      <div className={styles.toolbar}>
        <div>
          <strong>Measure {measure}</strong>
          <span>
            {number(start)}–{number(end)}s
          </span>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => move(Math.max(0, measureIndex - 1))}
            disabled={measureIndex === 0}
            aria-label="Previous measure"
          >
            ←
          </button>
          <button
            onClick={() =>
              move(Math.min(measures.length - 1, measureIndex + 1))
            }
            disabled={measureIndex >= measures.length - 1}
            aria-label="Next measure"
          >
            →
          </button>
          <button onClick={jumpIssue} disabled={!findings.length}>
            Next finding ↗
          </button>
        </div>
      </div>
      {(category === "all" || category === "pitch") && (
        <section className="rr-pitchPanel" aria-label="Pitch note comparison">
          <h4>Pitch · which notes need attention?</h4>
          <p>
            Expected and played notes are shown in concert pitch (sounding
            pitch), including octave. Select a row to inspect and listen.
          </p>
          <div className="rr-pitchTable">
            <table>
              <thead>
                <tr>
                  <th>Beat</th>
                  <th>Expected</th>
                  <th>You played</th>
                  <th>What to work on</th>
                </tr>
              </thead>
              <tbody>
                {current
                  .filter((e) => e.kind === "note")
                  .map((e) => {
                    const n = insights?.notes.find(
                      (n) => n.expectedId === e.expectedId,
                    );
                    const expected =
                      insights?.scoreNotes?.find(
                        (n) => n.expectedId === e.expectedId,
                      )?.midi ?? n?.expectedMidi;
                    const issues = allFindings.filter(
                      (f) =>
                        f.category === "pitch" && f.expectedId === e.expectedId,
                    );
                    const reliable =
                      n &&
                      n.pitchCoverage >= 0.65 &&
                      n.midi !== undefined &&
                      n.pitchCurve.length >= 2;
                    return (
                      <tr
                        key={e.expectedId}
                        data-selected={selected.expectedId === e.expectedId}
                        data-flagged={issues.length > 0}
                      >
                        <td>
                          <button
                            aria-label={`Inspect pitch at beat ${number(e.beat)}`}
                            aria-pressed={selected.expectedId === e.expectedId}
                            onClick={() => setSelectedId(e.expectedId)}
                          >
                            {number(e.beat)}
                          </button>
                        </td>
                        <td>
                          <strong>{pitchName(expected)}</strong>
                        </td>
                        <td>
                          <strong>
                            {reliable ? pitchName(n.midi) : "Uncertain"}
                          </strong>
                        </td>
                        <td>
                          {!n
                            ? "No matched sound. Listen to check for a missed note."
                            : !reliable
                              ? "Not enough reliable pitch evidence to judge this note."
                              : expected === undefined
                                ? "Add a reference pitch to compare this note."
                                : issues.length
                                  ? pitchAdvice(
                                      expected,
                                      n.midi!,
                                      n.cents,
                                      issues,
                                    )
                                  : "No pitch issue flagged."}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(category === "all" || category === "rhythm") && (
        <>
          <h4 className="rr-sectionTitle">Rhythm · timing and note lengths</h4>
          <div className={styles.legend}>
            <span>
              <i className={styles.scoreKey} />
              {hasReference ? "Score" : "Detected sound"}
            </span>
            <span>
              <i className={styles.playedKey} />
              Your playing
            </span>
            <span>
              <i className={styles.flagKey} />
              Flagged for review
            </span>
          </div>
          <div
            className={styles.chartScroll}
            tabIndex={0}
            aria-label="Score and performance timeline; scroll horizontally for dense passages"
          >
            <div
              className={styles.chart}
              style={{ minWidth: Math.max(520, current.length * 64) }}
            >
              <div className={styles.axis}>
                {current.map((e, i) => (
                  <span
                    key={e.expectedId}
                    style={{ left: left(e.targetStartSec) }}
                  >
                    {i === 0 ? "Beat " : ""}
                    {number(e.beat)}
                  </span>
                ))}
              </div>
              <div className={styles.lanes}>
                {current.map((e) => (
                  <span
                    key={e.expectedId}
                    className={styles.gridline}
                    style={{ left: left(e.targetStartSec) }}
                  />
                ))}
                <span className={styles.laneLabel}>
                  {hasReference ? "SCORE" : "DETECTED"}
                </span>
                <span className={`${styles.laneLabel} ${styles.lowerLabel}`}>
                  PLAYED
                </span>
                {current.map((e) => {
                  const hasIssue = flagged(e).length > 0;
                  const dim = issuesOnly && !hasIssue;
                  const active = e.expectedId === selected.expectedId;
                  return (
                    <div key={e.expectedId}>
                      <button
                        title={`${e.rhythmLabel} · Beat ${number(e.beat)}`}
                        className={`${styles.note} ${styles.expected} ${e.kind === "rest" ? styles.rest : ""} ${active ? styles.active : ""} ${dim ? styles.dim : ""}`}
                        style={{
                          left: left(e.targetStartSec),
                          width: width(e.targetStartSec, e.targetEndSec),
                        }}
                        onClick={() => setSelectedId(e.expectedId)}
                        aria-label={`Score: ${e.rhythmLabel}, measure ${e.measure}, beat ${number(e.beat)}${hasIssue ? ", flagged for review" : ""}`}
                        aria-pressed={active}
                      >
                        <span>
                          {e.kind === "rest"
                            ? "Rest"
                            : e.rhythmLabel
                                .split(" · ")[0]
                                .replace(" note", "")
                                .replace("sixteenth", "16th")
                                .replace("eighth", "8th")}
                        </span>
                      </button>
                      {e.actualStartSec !== undefined &&
                      e.actualEndSec !== undefined ? (
                        <button
                          className={`${styles.note} ${styles.played} ${hasIssue ? styles.flagged : ""} ${active ? styles.active : ""} ${dim ? styles.dim : ""}`}
                          style={{
                            left: left(e.actualStartSec),
                            width: width(e.actualStartSec, e.actualEndSec),
                          }}
                          onClick={() => setSelectedId(e.expectedId)}
                          aria-label={`Played: ${e.rhythmLabel}, ${timing(e.timingErrorMs)}`}
                        >
                          <span>
                            {e.timingErrorMs !== undefined &&
                            Math.abs(e.timingErrorMs) >= 0.5
                              ? `${e.timingErrorMs < 0 ? "←" : "→"} ${Math.round(Math.abs(e.timingErrorMs))} ms`
                              : "On target"}
                          </span>
                        </button>
                      ) : (
                        e.kind === "note" && (
                          <button
                            className={`${styles.note} ${styles.missing}`}
                            style={{
                              left: left(e.targetStartSec),
                              width: width(e.targetStartSec, e.targetEndSec),
                            }}
                            onClick={() => setSelectedId(e.expectedId)}
                            aria-label={`Unmatched note at beat ${number(e.beat)}`}
                          >
                            Not matched
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
                {extras.map((f, i) => (
                  <span
                    key={i}
                    title={f.message}
                    className={styles.extra}
                    style={{ left: left(f.startSec) }}
                  >
                    + Extra
                  </span>
                ))}
                {position >= start && position <= end && (
                  <span
                    className={styles.playhead}
                    style={{ left: left(position) }}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {insights && (category === "articulation" || category === "dynamics") && (
        <ExpressionReview
          category={category}
          insights={insights}
          events={current}
          findings={allFindings}
          selectedId={selected.expectedId}
          onSelect={setSelectedId}
          onListen={
            audio
              ? (from, to) => {
                  void listen(from, to);
                }
              : undefined
          }
        />
      )}
      <div className={styles.transport}>
        <button
          className={styles.listen}
          disabled={!audio}
          onClick={() =>
            playing ? audioRef.current?.pause() : listen(start, end)
          }
        >
          {playing ? "Ⅱ Pause" : "▶ Listen to measure"}
        </button>
        <div className="rr-playOptions">
          <button
            className={styles.textButton}
            disabled={
              !current.some(
                (e) =>
                  insights?.scoreNotes?.some(
                    (n) => n.expectedId === e.expectedId,
                  ) ||
                  insights?.notes.some(
                    (n) =>
                      n.expectedId === e.expectedId &&
                      n.expectedMidi !== undefined,
                  ),
              )
            }
            onClick={() => void listenReference()}
          >
            Hear score
          </button>
          <label>
            Speed{" "}
            <select
              aria-label="Playback speed"
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRate(r);
                if (audioRef.current) audioRef.current.playbackRate = r;
              }}
            >
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />{" "}
            Loop
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={(e) => setIssuesOnly(e.target.checked)}
          />{" "}
          Emphasize findings
        </label>
      </div>
      {!audio && (
        <p className={styles.muted}>
          Re-upload this recording to listen alongside the analysis.
        </p>
      )}
      {playError && (
        <p role="alert" className={styles.warning}>
          {playError}
        </p>
      )}
      {(category === "all" ||
        category === "pitch" ||
        category === "rhythm") && (
        <div className={styles.detail} aria-live="polite">
          <div className={styles.detailHeading}>
            <div>
              <span className={styles.eyebrow}>
                MEASURE {selected.measure} / BEAT {number(selected.beat)}
              </span>
              <h4>
                {category === "pitch" ? (
                  `Pitch · ${pitchName(selectedMeasurement?.expectedMidi ?? insights?.scoreNotes?.find((n) => n.expectedId === selected.expectedId)?.midi)}`
                ) : (
                  <>
                    {selected.kind === "rest" ? "Rest · " : ""}
                    {selected.rhythmLabel}
                  </>
                )}
              </h4>
            </div>
            <span className={styles.status}>
              {selectedFindings.length
                ? "Review suggested"
                : selected.kind === "rest"
                  ? "Expected silence"
                  : selected.actualStartSec === undefined
                    ? "Not matched"
                    : "No finding flagged"}
            </span>
          </div>
          {(category === "all" || category === "rhythm") && (
            <div className={styles.metrics}>
              <div>
                <span>Onset difference</span>
                <strong>
                  {selected.kind === "rest"
                    ? "—"
                    : timing(selected.timingErrorMs)}
                </strong>
              </div>
              <div>
                <span>
                  {hasReference ? "Target length" : "Detected length"}
                </span>
                <strong>
                  {(selected.targetEndSec - selected.targetStartSec).toFixed(3)}
                  s
                </strong>
              </div>
              <div>
                <span>Played length</span>
                <strong>
                  {selected.actualStartSec !== undefined &&
                  selected.actualEndSec !== undefined
                    ? `${(selected.actualEndSec - selected.actualStartSec).toFixed(3)}s`
                    : "—"}
                </strong>
              </div>
            </div>
          )}
          {(category === "all" || category === "pitch") &&
            selectedMeasurement && (
              <div className="rr-pitchSummary">
                <span>
                  Expected{" "}
                  <strong>{pitchName(selectedMeasurement.expectedMidi)}</strong>
                </span>
                <span>
                  You played{" "}
                  <strong>
                    {selectedMeasurement.pitchCoverage >= 0.65
                      ? pitchName(selectedMeasurement.midi)
                      : "Uncertain"}
                  </strong>
                </span>
                <p>
                  {pitchAdvice(
                    selectedMeasurement.expectedMidi,
                    selectedMeasurement.pitchCoverage >= 0.65
                      ? selectedMeasurement.midi
                      : undefined,
                    selectedMeasurement.cents,
                    allFindings.filter(
                      (f) =>
                        f.category === "pitch" &&
                        f.expectedId === selected.expectedId,
                    ),
                  )}
                </p>
              </div>
            )}
          {category !== "pitch" &&
            category !== "rhythm" &&
            selectedMeasurement && (
              <div className="rr-measurements">
                <div>
                  <span>Pitch offset</span>
                  <strong>
                    {selectedMeasurement.cents === undefined
                      ? "Not assessed"
                      : `${Math.round(selectedMeasurement.cents)} cents`}
                  </strong>
                </div>
                <div>
                  <span>Sustained drift</span>
                  <strong>
                    {selectedMeasurement.driftCents === undefined
                      ? "Note too short / uncertain"
                      : `${Math.round(selectedMeasurement.driftCents)} cents`}
                  </strong>
                </div>
                <div>
                  <span>Attack settling</span>
                  <strong>
                    {selectedMeasurement.attackSettlingMs === undefined
                      ? "Uncertain"
                      : `${Math.round(selectedMeasurement.attackSettlingMs)} ms`}
                  </strong>
                </div>
                <div>
                  <span>Recorded level</span>
                  <strong>
                    {selectedMeasurement.loudnessDb.toFixed(1)} dBFS
                  </strong>
                </div>
                <div>
                  <span>Gap to next note</span>
                  <strong>
                    {selectedMeasurement.gapAfterMs === undefined
                      ? "—"
                      : `${Math.round(selectedMeasurement.gapAfterMs)} ms`}
                  </strong>
                </div>
              </div>
            )}
          {(category === "all" || category === "pitch") &&
            selectedMeasurement &&
            selectedMeasurement.pitchCurve.length > 1 && (
              <SignalChart
                label={
                  selectedMeasurement.expectedMidi === undefined
                    ? "Pitch stability · cents from note median"
                    : "Pitch trace · cents from score"
                }
                points={selectedMeasurement.pitchCurve.map((p) => ({
                  x: p.timeSec,
                  y: p.cents,
                }))}
                zero
              />
            )}
          {selectedFindings.map((f, i) => (
            <p className={styles.explanation} key={i}>
              <strong>{f.kind.replaceAll("_", " ")}</strong>
              {f.message}
              {f.confidence !== undefined && (
                <span>
                  {Math.round(f.confidence * 100)}% evidence ·{" "}
                  {f.status === "likely" ? "Likely finding" : "Needs review"}
                </span>
              )}
            </p>
          ))}
          <button
            className={styles.textButton}
            disabled={!audio}
            onClick={() =>
              listen(
                Math.max(
                  0,
                  (selected.actualStartSec ?? selected.targetStartSec) - 0.2,
                ),
                Math.max(selected.targetEndSec, selected.actualEndSec ?? 0) +
                  0.2,
              )
            }
          >
            Listen to this {selected.kind === "rest" ? "rest" : "note"} ↗
          </button>
        </div>
      )}
      {insights && (category === "all" || category === "dynamics") && (
        <SignalChart
          label="Recorded loudness · dBFS"
          points={insights.loudness
            .filter((p) => p.timeSec >= start && p.timeSec <= end)
            .map((p) => ({ x: p.timeSec, y: p.db }))}
        />
      )}
      {insights && (category === "all" || category === "tempo") && (
        <div className="rr-tempo">
          {insights.tempo
            .filter((t) => t.measure === measure)
            .map((t) => (
              <p key={t.measure}>
                <strong>{Math.round(t.bpm)} BPM</strong>
                <span>
                  Score: {Math.round(t.targetBpm)} BPM ·{" "}
                  {Math.abs(t.deviationPercent).toFixed(1)}%{" "}
                  {t.deviationPercent >= 0 ? "faster" : "slower"}. Tempo is
                  descriptive, not an automatic mistake.
                </span>
              </p>
            ))}
        </div>
      )}
      {(category === "all" || category === "rhythm") &&
        currentGroups.map((g) => (
          <div key={g.id} className={styles.group}>
            <span>{g.label}</span>
            <p>{g.message}</p>
            <small>{Math.round(g.confidence * 100)}% evidence</small>
          </div>
        ))}
      {!!measureFindings.length && (
        <details className={styles.findingList}>
          <summary>
            All findings in this measure ({measureFindings.length})
          </summary>
          {measureFindings.map((f, i) => (
            <button
              key={i}
              onClick={() => {
                if (f.expectedId) setSelectedId(f.expectedId);
                else
                  void listen(
                    Math.max(0, f.startSec - 0.2),
                    (f.endSec ?? f.startSec + 0.3) + 0.2,
                  );
              }}
            >
              <span>
                {f.startSec.toFixed(2)}s · {f.kind.replaceAll("_", " ")}
              </span>
              <p>{f.message}</p>
            </button>
          ))}
        </details>
      )}
      {previous && (
        <div className="rr-comparison">
          <span className={styles.eyebrow}>
            PREVIOUS TAKE · {previous.name}
          </span>
          <p>
            Same reviewed score. Finding counts can vary with tempo and
            detection confidence.
          </p>
          <div>
            {insights?.categories.map((c) => (
              <span key={c.id}>
                {c.label}
                <strong>
                  {previous.findings.filter((f) => f.category === c.id).length}{" "}
                  → {allFindings.filter((f) => f.category === c.id).length}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
      {onRetry && (
        <button className="rr-retry" onClick={onRetry}>
          Record another take ↗
        </button>
      )}
      <p className={styles.footnote}>
        {(category === "all" || category === "rhythm") &&
          "Widths show duration; horizontal shifts show early or late starts. "}
        {hasReference
          ? "Written values come from the score."
          : "No score supplied; note values and correctness are not inferred."}{" "}
        A flag is a suggestion to review, not a certainty.
      </p>
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (loop && audioRef.current && stopAt.current !== null) {
            audioRef.current.currentTime = startAt.current;
            void audioRef.current
              .play()
              .catch(() => setPlayError("Playback could not restart."));
          } else setPlaying(false);
        }}
        onError={() =>
          setPlayError(
            "Playback is unavailable for this recording in your browser.",
          )
        }
        onTimeUpdate={() => {
          const p = audioRef.current;
          if (!p) return;
          setPosition(p.currentTime);
          if (stopAt.current !== null && p.currentTime >= stopAt.current) {
            if (loop) {
              p.currentTime = startAt.current;
            } else p.pause();
            if (!loop) stopAt.current = null;
          }
        }}
      />
    </section>
  );
}

function SignalChart({
  label,
  points,
  zero = false,
}: {
  label: string;
  points: { x: number; y: number }[];
  zero?: boolean;
}) {
  if (points.length < 2) return null;
  const minX = points[0].x,
    maxX = points.at(-1)!.x;
  const minY = Math.min(zero ? -50 : -60, ...points.map((p) => p.y)),
    maxY = Math.max(zero ? 50 : -10, ...points.map((p) => p.y));
  const px = (x: number) =>
    44 + ((x - minX) / Math.max(0.01, maxX - minX)) * 708;
  const py = (y: number) => 16 + ((maxY - y) / Math.max(1, maxY - minY)) * 68;
  return (
    <figure className="rr-signal">
      <figcaption>
        {label}
        <span>
          {minX.toFixed(2)}–{maxX.toFixed(2)}s
        </span>
      </figcaption>
      <svg
        viewBox="0 0 768 102"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <text x="0" y="20">
          {Math.round(maxY)}
        </text>
        <text x="0" y="86">
          {Math.round(minY)}
        </text>
        {zero && (
          <line x1="44" x2="752" y1={py(0)} y2={py(0)} className="rr-zero" />
        )}
        <polyline
          points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}

function pitchName(midi?: number) {
  if (midi === undefined || !Number.isFinite(midi)) return "Not provided";
  const rounded = Math.round(midi);
  return `${["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"][((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}
function pitchAdvice(
  expected: number | undefined,
  played: number | undefined,
  cents: number | undefined,
  issues: Finding[],
) {
  if (expected === undefined || played === undefined || cents === undefined)
    return "A reliable pitch and reference are needed for correction advice.";
  const wrong = issues.some((f) => f.kind === "wrong_note");
  const tuning = issues.some((f) => f.kind === "sharp" || f.kind === "flat");
  const drift = issues.find((f) => f.kind === "pitch_drift");
  const correction = wrong
    ? `Expected ${pitchName(expected)}, heard ${pitchName(played)}. Aim ${Math.abs(Math.round(played) - expected)} semitone${Math.abs(Math.round(played) - expected) === 1 ? "" : "s"} ${played > expected ? "lower" : "higher"}.`
    : tuning
      ? `Right note, but ${Math.round(Math.abs(cents))} cents ${cents > 0 ? "sharp. Lower" : "flat. Raise"} the pitch slightly.`
      : drift
        ? "Right note, but the pitch changes while you hold it. Keep the sustained pitch steady."
        : issues.length
          ? "Review this note's pitch."
          : "No pitch issue flagged for this note.";
  return `${correction}${drift ? ` ${drift.message}` : ""}`;
}
