"use client";

import { useMemo, useRef, useState } from "react";
import { aiPost } from "@/lib/studio/ai-client";
import { compactResult, readResult, type AnalysisResult } from "@/lib/studio/analysis";
import { comparable, compareTakes, type ComparedFinding, type TakeMetric } from "@/lib/studio/compare";
import type { ComparisonNarrative, ComparisonRef } from "@/lib/studio/types";
import { CATEGORY_LABELS, type FocusRequest } from "./evidence";
import "./studio.css";

export type TakeOption = { id: string; name: string; date: string; createdAt?: string; result: AnalysisResult };

const format = (m: TakeMetric, v: number | null) => (v === null ? "—" : `${v}${m.unit === "%" ? "%" : ` ${m.unit}`}`);
function trend(m: TakeMetric) {
  if (m.before === null || m.after === null || m.before === m.after) return "same";
  return (m.after > m.before) === (m.better === "higher") ? "better" : "worse";
}

type Props = {
  current: TakeOption;
  others: TakeOption[];
  onFocus: (f: FocusRequest) => void;
  /** Two-column clip layout with analysis upload (practice-clip /dev page). */
  variant?: "default" | "clip";
  allowUpload?: boolean;
};

/** Compare the open take with another take of the same score. */
export function TakeComparison({ current, others, onFocus, variant = "default", allowUpload = false }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<TakeOption[]>([]);
  const [otherId, setOtherId] = useState("");
  const [narrative, setNarrative] = useState<{ key: string; value: ComparisonNarrative }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");

  const options = useMemo(() => {
    const seen = new Set<string>([current.id]);
    const merged: TakeOption[] = [];
    for (const o of [...imported, ...others]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      merged.push(o);
    }
    return merged
      .map((o) => ({ ...o, problem: comparable(o.result, current.result) }))
      .sort((a, b) => Number(!!a.problem) - Number(!!b.problem) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [others, imported, current]);

  const compatible = options.filter((o) => !o.problem);
  const selectedId = otherId && options.some((o) => o.id === otherId && !o.problem)
    ? otherId
    : (compatible[0]?.id ?? "");
  const other = options.find((o) => o.id === selectedId && !o.problem);
  const currentIsLater = !other || (current.createdAt ?? "") >= (other.createdAt ?? "");
  const before = other ? (currentIsLater ? other : current) : undefined;
  const after = other ? (currentIsLater ? current : other) : undefined;
  const comparison = before && after ? compareTakes(before.result, after.result) : undefined;
  const clip = variant === "clip";

  async function explain() {
    if (!before || !after) return;
    setBusy(true);
    setError("");
    try {
      const value = await aiPost<ComparisonNarrative>("/api/ai/compare", {
        before: { name: before.name, result: compactResult(before.result) },
        after: { name: after.name, result: compactResult(after.result) },
      });
      setNarrative({ key: `${before.id}:${after.id}`, value });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The comparison could not be explained right now.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImportError("");
    try {
      const result = readResult(JSON.parse(await file.text()));
      const problem = comparable(result, current.result);
      if (problem) throw new Error(problem);
      const take: TakeOption = {
        id: `upload-${file.name}-${file.size}-${file.lastModified}`,
        name: file.name.replace(/\.json$/i, ""),
        date: "Uploaded",
        createdAt: new Date(file.lastModified || Date.now()).toISOString(),
        result,
      };
      setImported((items) => [take, ...items.filter((t) => t.id !== take.id)]);
      setOtherId(take.id);
      setNarrative(undefined);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "That file is not a usable analysis.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const jump = (f: { measure?: string; expectedId?: string; startSec?: number; endSec?: number }, side: "before" | "after") => {
    const onCurrent = (side === "after") === currentIsLater;
    onFocus(onCurrent ? f : { measure: f.measure });
  };
  const story = narrative && before && after && narrative.key === `${before.id}:${after.id}` ? narrative.value : undefined;
  const maxCount = Math.max(1, ...(comparison?.measures.map((m) => Math.max(m.before, m.after)) ?? [1]));
  const facts = (t: TakeOption) => ({
    findings: t.result.findings.length,
    notes: t.result.detectedNotes?.length ?? t.result.rhythmEvents?.filter((e) => e.kind === "note").length ?? 0,
    duration: `${t.result.durationSec.toFixed(1)}s`,
  });

  return (
    <section className={`studio-panel compare-panel ${clip ? "clip-compare" : ""}`} aria-labelledby="compare-heading">
      {allowUpload && (
        <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only"
          aria-label="Upload another analysis JSON" onChange={(e) => void importFile(e.target.files?.[0])} />
      )}

      {clip ? (
        <>
          <div className="clip-compare-head">
            <h3 id="compare-heading">Compare takes</h3>
            <p className="studio-muted">See how your performance has changed.</p>
          </div>
          <div className="clip-bar">
            <div className="clip-bar-take">
              <span className="clip-select-label">Current take</span>
              <strong>{current.name}</strong>
              <span className="clip-select-meta">{facts(current).notes} notes · {facts(current).duration}</span>
            </div>
            <span className="clip-select-arrow" aria-hidden="true">→</span>
            <div className="clip-bar-take clip-bar-other">
              <span className="clip-select-label">Compare with</span>
              <label className="clip-bar-picker">
                <span className="sr-only">Choose another take</span>
                <select
                  value={other ? selectedId : ""}
                  onChange={(e) => { setOtherId(e.target.value); setError(""); setNarrative(undefined); }}
                >
                  <option value="">Choose another take</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id} disabled={!!o.problem}>
                      {o.name} · {o.date}{o.problem ? ` — ${o.problem}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <span className="clip-select-meta">
                {other
                  ? `${facts(other).notes} notes · ${facts(other).duration}`
                  : "Same score"}
              </span>
            </div>
            {allowUpload && (
              <button type="button" className="clip-upload" onClick={() => fileInput.current?.click()}>
                Upload
              </button>
            )}
          </div>
          {importError && <p className="studio-error" role="alert">{importError}</p>}
          {!!options.length && !compatible.length && !other && (
            <p className="studio-caution">Other clips are loaded, but none share this score yet. Upload an analysis that used the same reference.</p>
          )}
        </>
      ) : (
        <div className="studio-panel-heading">
          <div>
            <span className="studio-eyebrow">COMPARE TAKES · SAME SCORE</span>
            <h3 id="compare-heading">What changed between takes?</h3>
          </div>
          <div className="compare-heading-tools">
            {allowUpload && (
              <button type="button" className="studio-text-button" onClick={() => fileInput.current?.click()}>
                Upload analysis JSON
              </button>
            )}
            {!!options.length && (
              <label className="compare-picker">
                Compare with
                <select value={selectedId} onChange={(e) => { setOtherId(e.target.value); setError(""); setNarrative(undefined); }}>
                  {!other && <option value="">Choose a take</option>}
                  {options.map((o) => (
                    <option key={o.id} value={o.id} disabled={!!o.problem}>
                      {o.name} · {o.date}{o.problem ? ` — ${o.problem}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {!clip && importError && <p className="studio-error" role="alert">{importError}</p>}

      {!comparison || !before || !after ? (
        !clip && (
          <div className="compare-empty">
            <p className="studio-muted">
              {options.length
                ? "No other take uses this reviewed score yet. Takes recorded from the same Practice Piece or MusicXML file can be compared."
                : "Analyze a second recording with the same reference score, or upload its analysis JSON, and Tunity will show what improved measure by measure."}
            </p>
            {allowUpload && !options.length && (
              <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>
                Upload analysis JSON
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <p className="studio-muted">
            Earlier: <strong>{before.name}</strong> ({before.date}) → Later: <strong>{after.name}</strong> ({after.date}).
            Counts can shift with tempo and detection confidence; per-note rates are the steadier signal.
          </p>
          <table className="compare-table">
            <thead><tr><th>Metric</th><th>Earlier</th><th>Later</th><th /></tr></thead>
            <tbody>
              {comparison.metrics.map((m) => (
                <tr key={m.id} data-trend={trend(m)}>
                  <td>{m.label}</td>
                  <td>{format(m, m.before)}</td>
                  <td><strong>{format(m, m.after)}</strong></td>
                  <td>{trend(m) === "better" ? "▲ better" : trend(m) === "worse" ? "▼ worse" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="compare-categories">
            {comparison.categories.map((c) => (
              <span key={c.id}>{c.label}<strong>{c.before} → {c.after}</strong></span>
            ))}
          </div>
          <div className="compare-measures" aria-label="Flags per measure, earlier and later take">
            {comparison.measures.map((m) => (
              <button key={m.measure} onClick={() => onFocus({ measure: m.measure })} title={`Measure ${m.measure}: ${m.before} → ${m.after} flags`}>
                <span className="bar before" style={{ height: `${(m.before / maxCount) * 100}%` }} />
                <span className="bar after" style={{ height: `${(m.after / maxCount) * 100}%` }} />
                <small>{m.measure}</small>
              </button>
            ))}
          </div>
          <div className="compare-lists">
            <FindingList title="Fixed" tone="better" items={comparison.resolved} onPick={(f) => jump(f, "before")} />
            <FindingList title="Still there" tone="same" items={comparison.persisting.map((p) => p.after)} onPick={(f) => jump(f, "after")} />
            <FindingList title="New" tone="worse" items={comparison.added} onPick={(f) => jump(f, "after")} />
          </div>
          <div className="compare-story">
            <button className="secondary-button" disabled={busy} onClick={() => void explain()}>
              {busy ? <><span className="spinner" /> Comparing…</> : story ? "Explain again ✦" : "Explain the changes ✦"}
            </button>
            {error && <p className="studio-error" role="alert">{error}</p>}
            {story && (
              <div className="compare-narrative">
                <p className="coach-summary">{story.headline}</p>
                <NarrativeList title="Improved" items={story.improvements} onPick={jump} />
                <NarrativeList title="Still to work on" items={story.remaining} onPick={jump} />
                {story.nextFocus && <p className="coach-practice"><strong>Before the next take</strong>{story.nextFocus}</p>}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function FindingList({ title, tone, items, onPick }: { title: string; tone: string; items: ComparedFinding[]; onPick: (f: ComparedFinding) => void }) {
  return (
    <div className={`compare-list ${tone}`}>
      <h4>{title} <span>{items.length}</span></h4>
      {!items.length && <p className="studio-muted">None</p>}
      {items.slice(0, 8).map((f) => (
        <button key={f.ref} onClick={() => onPick(f)} title={f.message}>
          <strong>{f.measure ? `M${f.measure}` : `${f.startSec.toFixed(1)}s`}</strong>
          {CATEGORY_LABELS[f.category] ?? f.category} · {f.kind.replaceAll("_", " ")}
        </button>
      ))}
      {items.length > 8 && <p className="studio-muted">+{items.length - 8} more</p>}
    </div>
  );
}

function NarrativeList({ title, items, onPick }: { title: string; items: { text: string; evidence: ComparisonRef[] }[]; onPick: (f: ComparisonRef, side: "before" | "after") => void }) {
  if (!items.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((p, i) => (
          <li key={i}>
            {p.text}
            <span className="studio-evidence inline">
              {p.evidence.map((r) => (
                <button key={r.id} disabled={r.measure === undefined && r.startSec === undefined} title={r.message ?? r.label} onClick={() => onPick(r, r.side)}>
                  {r.label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
