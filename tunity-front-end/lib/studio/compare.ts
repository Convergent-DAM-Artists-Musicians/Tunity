import type { AnalysisFinding, AnalysisResult } from "./analysis";

export type ComparedFinding = {
  ref: string;
  category: string;
  kind: string;
  measure?: string;
  beat?: number;
  expectedId?: string;
  message: string;
  startSec: number;
  endSec: number;
};

export type TakeMetric = {
  id: string;
  label: string;
  unit: "%" | "ms" | "cents";
  better: "higher" | "lower";
  before: number | null;
  after: number | null;
};

export type TakeComparison = {
  categories: { id: string; label: string; before: number; after: number }[];
  metrics: TakeMetric[];
  measures: { measure: string; before: number; after: number }[];
  resolved: ComparedFinding[];
  persisting: { before: ComparedFinding; after: ComparedFinding }[];
  added: ComparedFinding[];
};

const LABELS: Record<string, string> = {
  rhythm: "Rhythm", pitch: "Pitch", articulation: "Articulation", dynamics: "Dynamics", tempo: "Tempo",
};

/** Takes can only be compared measure-by-measure when they share a reviewed score. */
export function comparable(a?: AnalysisResult, b?: AnalysisResult): string | null {
  if (!a?.hasReference || !b?.hasReference) return "Both takes need a reference score.";
  const ka = a.insights?.scoreKey, kb = b.insights?.scoreKey;
  if (!ka || !kb) return "Both takes need a reviewed score.";
  return ka === kb ? null : "These takes use different scores.";
}

function measureOf(result: AnalysisResult, f: AnalysisFinding) {
  return f.measure ?? (f.expectedId ? result.rhythmEvents?.find((e) => e.expectedId === f.expectedId)?.measure : undefined);
}

function describe(result: AnalysisResult, f: AnalysisFinding): Omit<ComparedFinding, "ref"> {
  return {
    category: f.category ?? "rhythm", kind: f.kind, measure: measureOf(result, f), beat: f.beat,
    expectedId: f.expectedId, message: f.message, startSec: f.startSec, endSec: f.endSec ?? f.startSec + 0.4,
  };
}

const keyOf = (f: Omit<ComparedFinding, "ref">) =>
  `${f.category}|${f.kind}|${f.expectedId ?? `${f.measure ?? "?"}@${f.beat ?? Math.round(f.startSec * 10)}`}`;

function percent(n: number, total: number) {
  return total ? Math.round((n / total) * 1000) / 10 : null;
}
function mean(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function metrics(result: AnalysisResult) {
  const notes = (result.rhythmEvents ?? []).filter((e) => e.kind === "note");
  const flagged = (category?: string) => new Set(result.findings
    .filter((f) => f.expectedId && (!category || (f.category ?? "rhythm") === category))
    .map((f) => f.expectedId));
  const any = flagged(), rhythm = flagged("rhythm"), pitch = flagged("pitch");
  const matched = notes.filter((e) => e.actualStartSec !== undefined);
  return {
    clean: percent(notes.filter((e) => !any.has(e.expectedId)).length, notes.length),
    matched: percent(matched.length, notes.length),
    onTime: percent(matched.filter((e) => !rhythm.has(e.expectedId)).length, notes.length),
    inTune: percent(notes.filter((e) => !pitch.has(e.expectedId)).length, notes.length),
    timing: mean(matched.map((e) => Math.abs(e.timingErrorMs ?? 0))),
    cents: mean((result.insights?.notes ?? []).flatMap((n) => (n.cents === undefined ? [] : [Math.abs(n.cents)]))),
  };
}

/** Percentage of score notes with no finding of any kind, or null without a score. */
export const cleanNotes = (result: AnalysisResult) => metrics(result).clean;

/** Deterministic before/after comparison of two takes of the same score. */
export function compareTakes(before: AnalysisResult, after: AnalysisResult): TakeComparison {
  const b = before.findings.map((f) => describe(before, f));
  const a = after.findings.map((f) => describe(after, f));
  const afterByKey = new Map<string, Omit<ComparedFinding, "ref">[]>();
  for (const f of a) afterByKey.set(keyOf(f), [...(afterByKey.get(keyOf(f)) ?? []), f]);
  const resolved: ComparedFinding[] = [], persisting: TakeComparison["persisting"] = [];
  for (const f of b) {
    const match = afterByKey.get(keyOf(f))?.shift();
    if (match) persisting.push({ before: { ...f, ref: `P${persisting.length + 1}` }, after: { ...match, ref: `P${persisting.length + 1}` } });
    else resolved.push({ ...f, ref: `R${resolved.length + 1}` });
  }
  const added = [...afterByKey.values()].flat()
    .sort((x, y) => x.startSec - y.startSec)
    .map((f, i) => ({ ...f, ref: `N${i + 1}` }));
  const categoryIds = [...new Set([
    ...(after.insights?.categories.map((c) => c.id) ?? []), ...a.map((f) => f.category), ...b.map((f) => f.category),
  ])];
  const mb = metrics(before), ma = metrics(after);
  const measureIds = [...new Set([...(before.rhythmEvents ?? []), ...(after.rhythmEvents ?? [])].map((e) => e.measure))];
  return {
    categories: categoryIds.map((id) => ({
      id, label: LABELS[id] ?? id,
      before: b.filter((f) => f.category === id).length,
      after: a.filter((f) => f.category === id).length,
    })),
    metrics: [
      { id: "clean", label: "Notes with no flags", unit: "%", better: "higher", before: mb.clean, after: ma.clean },
      { id: "matched", label: "Notes matched to the score", unit: "%", better: "higher", before: mb.matched, after: ma.matched },
      { id: "onTime", label: "Notes with no rhythm flag", unit: "%", better: "higher", before: mb.onTime, after: ma.onTime },
      { id: "inTune", label: "Notes with no pitch flag", unit: "%", better: "higher", before: mb.inTune, after: ma.inTune },
      { id: "timing", label: "Average onset difference", unit: "ms", better: "lower", before: mb.timing, after: ma.timing },
      { id: "cents", label: "Average pitch offset", unit: "cents", better: "lower", before: mb.cents, after: ma.cents },
    ],
    measures: measureIds.map((measure) => ({
      measure,
      before: b.filter((f) => f.measure === measure).length,
      after: a.filter((f) => f.measure === measure).length,
    })),
    resolved,
    persisting,
    added,
  };
}

/** Citation-ready summary of a comparison for the model. */
export function comparisonDigest(c: TakeComparison, beforeName: string, afterName: string) {
  const item = (f: ComparedFinding) => ({
    ref: f.ref, category: f.category, kind: f.kind, measure: f.measure, beat: f.beat, message: f.message,
  });
  return {
    beforeTake: beforeName.slice(0, 100),
    afterTake: afterName.slice(0, 100),
    metrics: c.metrics.map((m) => ({ ref: `M:${m.id}`, label: m.label, unit: m.unit, better: m.better, before: m.before, after: m.after })),
    findingCounts: c.categories,
    measuresWithFlags: c.measures.filter((m) => m.before || m.after),
    resolved: c.resolved.slice(0, 25).map(item),
    stillPresent: c.persisting.slice(0, 25).map((p) => ({ ...item(p.after), previousMessage: p.before.message })),
    newInAfterTake: c.added.slice(0, 25).map(item),
  };
}
