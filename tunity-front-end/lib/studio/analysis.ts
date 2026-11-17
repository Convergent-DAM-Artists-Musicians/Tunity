import type { PerformanceInsights } from "../../../back-end/performance-analyzer/src/types";

export type AnalysisFinding = {
  category?: string;
  expectedId?: string;
  endSec?: number;
  kind: string;
  message: string;
  startSec: number;
  confidence?: number;
  status?: string;
  measure?: string;
  beat?: number;
};

export type AnalysisEvent = {
  expectedId: string;
  kind: "note" | "rest";
  measure: string;
  beat: number;
  rhythmLabel: string;
  labelSource?: string;
  targetStartSec: number;
  targetEndSec: number;
  actualStartSec?: number;
  actualEndSec?: number;
  timingErrorMs?: number;
};

export type AnalysisResult = {
  insights?: PerformanceInsights;
  rhythmEngine?: string;
  alignment?: { confidence: number; tempoScale: number; ambiguous: boolean };
  rhythmEvents?: AnalysisEvent[];
  rhythmGroups?: { id: string; label: string; status: string; message: string; confidence: number; eventIds?: string[] }[];
  hasReference: boolean;
  durationSec: number;
  detectedNotes: { midi: number; startSec: number; endSec: number; confidence: number }[];
  findings: AnalysisFinding[];
  quality: { voicedConfidenceFraction: number; warnings: string[] };
};

/** A place in the current take that the review can jump to and play. */
export type ReviewFocus = {
  measure?: string;
  expectedId?: string;
  startSec?: number;
  endSec?: number;
  loop?: boolean;
  nonce: number;
};

/** A citation resolved from analysis data, never from model output. */
export type EvidenceRef = {
  id: string;
  label: string;
  category?: string;
  measure?: string;
  beat?: number;
  startSec?: number;
  endSec?: number;
  expectedId?: string;
  message?: string;
};

export const findingId = (index: number) => `F${index + 1}`;
const round = (n: number | undefined, digits = 0) =>
  n === undefined || !Number.isFinite(n) ? undefined : Number(n.toFixed(digits));

/** Drop large signal arrays before sending a result to an AI route. */
export function compactResult(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    detectedNotes: [],
    insights: result.insights && {
      ...result.insights,
      loudness: [],
      notes: result.insights.notes.map((n) => ({ ...n, pitchCurve: [] })),
    },
  };
}

/** Light structural check for analysis JSON posted by the browser. */
export function readResult(value: unknown): AnalysisResult {
  const r = value as AnalysisResult;
  if (!r || typeof r !== "object" || !Array.isArray(r.findings) || r.findings.length > 5000
    || typeof r.durationSec !== "number" || !r.quality || !Array.isArray(r.quality.warnings))
    throw new Error("Analysis result is missing or malformed.");
  if (r.findings.some((f) => !f || typeof f.message !== "string" || typeof f.kind !== "string" || typeof f.startSec !== "number"))
    throw new Error("Analysis findings are malformed.");
  if (r.rhythmEvents && (!Array.isArray(r.rhythmEvents) || r.rhythmEvents.length > 20000))
    throw new Error("Analysis events are malformed.");
  return r;
}

export function measures(result: AnalysisResult) {
  return [...new Set((result.rhythmEvents ?? []).map((e) => e.measure))];
}

export function measureSpan(result: AnalysisResult, measure: string) {
  const events = (result.rhythmEvents ?? []).filter((e) => e.measure === measure);
  if (!events.length) return undefined;
  return {
    startSec: Math.min(...events.map((e) => Math.min(e.targetStartSec, e.actualStartSec ?? Infinity))),
    endSec: Math.max(...events.map((e) => Math.max(e.targetEndSec, e.actualEndSec ?? 0))),
  };
}

function measureOf(result: AnalysisResult, f: AnalysisFinding) {
  return f.measure ?? (f.expectedId ? result.rhythmEvents?.find((e) => e.expectedId === f.expectedId)?.measure : undefined);
}

export function findingRef(result: AnalysisResult, id: string): EvidenceRef | undefined {
  const match = /^F(\d+)$/.exec(id);
  const f = match ? result.findings[Number(match[1]) - 1] : undefined;
  if (!f) return undefined;
  const measure = measureOf(result, f);
  return {
    id,
    label: `${measure ? `M${measure}` : `${f.startSec.toFixed(2)}s`}${f.beat !== undefined ? ` · beat ${round(f.beat, 2)}` : ""} · ${f.kind.replaceAll("_", " ")}`,
    category: f.category ?? "rhythm",
    measure,
    beat: f.beat,
    startSec: f.startSec,
    endSec: f.endSec ?? f.startSec + 0.4,
    expectedId: f.expectedId,
    message: f.message,
  };
}

export function measureRef(result: AnalysisResult, measure: string): EvidenceRef | undefined {
  const span = measureSpan(result, measure);
  return span && { id: `M${measure}`, label: `Measure ${measure}`, measure, ...span };
}

const statusRank = (s?: string) => (s === "likely" ? 1 : 0);
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (midi: number) => `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

/** What a practice etude for this take should target, taken only from measured findings and the score. */
export function sessionPractice(result: AnalysisResult, title: string) {
  const groups = new Map<string, { label: string; count: number; measures: Set<string> }>();
  for (const f of result.findings) {
    const category = f.category ?? "rhythm";
    const key = `${category}|${f.kind}`;
    const group = groups.get(key) ?? { label: `${category[0].toUpperCase()}${category.slice(1)}: ${f.kind.replaceAll("_", " ")}`, count: 0, measures: new Set<string>() };
    group.count++;
    const measure = measureOf(result, f);
    if (measure) group.measures.add(measure);
    groups.set(key, group);
  }
  const weaknesses = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((g) => `${g.label} (${g.count}×${g.measures.size ? `, m. ${[...g.measures].slice(0, 4).join(", ")}` : ""})`);
  const scoreBpm = round(result.insights?.tempo?.find((t) => Number.isFinite(t.targetBpm))?.targetBpm);
  const structure = scoreStructure(result);
  const summary = [
    structure?.key && `${structure.key} (estimated)`,
    structure?.meter,
    structure && `${structure.measureCount} measures`,
    structure?.phrases.length && `${structure.phrases.length} ${structure.phrases.length === 1 ? "phrase" : "phrases"}`,
    structure?.motifs[0] && `recurring ${structure.motifs[0]}`,
    structure?.motion,
    structure?.range && `range ${structure.range}`,
    scoreBpm && `♩=${scoreBpm}`,
  ].filter(Boolean).join(" · ");
  const context = structure ? JSON.stringify({
    piece: title.slice(0, 100),
    pitchesAre: "concert (sounding) pitch",
    estimatedKey: structure.key,
    meter: structure.meter,
    measures: structure.measureCount,
    scoreTempoBpm: scoreBpm,
    range: structure.range,
    phrases: structure.phrases,
    recurringMotifs: structure.motifs,
    melodicMotion: structure.motion,
    rhythmValues: structure.rhythmValues,
    melodyByMeasure: structure.outline,
  }) : `Practice for "${title.slice(0, 100)}"`;
  return { weaknesses, summary, context, scoreBpm, meter: structure?.meter };
}

const INTERVALS = ["unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "4th", "tritone", "5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave"];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const shortValue = (label: string) => label.replace(/ note$/i, "").toLowerCase();

/** The written structure of the reference score behind a take: key, meter, phrases, motifs and a melody outline. */
export function scoreStructure(result: AnalysisResult) {
  const events = [...(result.rhythmEvents ?? [])].sort((a, b) => a.targetStartSec - b.targetStartSec);
  if (!events.length) return undefined;
  const midiById = new Map<string, number>();
  for (const n of result.insights?.notes ?? []) if (Number.isFinite(n.expectedMidi)) midiById.set(n.expectedId, n.expectedMidi!);
  for (const n of result.insights?.scoreNotes ?? []) if (Number.isFinite(n.midi)) midiById.set(n.expectedId, n.midi);

  const steps: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i];
    if (a.measure === b.measure && b.beat > a.beat) steps.push((b.targetStartSec - a.targetStartSec) / (b.beat - a.beat));
  }
  const secPerBeat = steps.length ? median(steps) : undefined;
  const beatsOf = (e: AnalysisEvent) => (secPerBeat ? Math.round(((e.targetEndSec - e.targetStartSec) / secPerBeat) * 12) / 12 : undefined);

  const order = [...new Set(events.map((e) => e.measure))];
  const firstOf = new Map(order.map((m) => [m, events.find((e) => e.measure === m)!]));
  const spans: number[] = [];
  for (let i = 1; i < order.length; i++) {
    const a = firstOf.get(order[i - 1])!, b = firstOf.get(order[i])!, gap = Number(order[i]) - Number(order[i - 1]);
    if (secPerBeat && gap > 0) spans.push(((b.targetStartSec - a.targetStartSec) / secPerBeat + a.beat - b.beat) / gap);
  }
  const beatsPerBar = spans.length ? Math.round(median(spans) * 2) / 2 : undefined;
  const meter = beatsPerBar === 4 ? "4/4" : beatsPerBar === 3 ? "3/4" : beatsPerBar === 2 ? "2/4" : beatsPerBar === 3 / 2 ? "3/8" : beatsPerBar ? `${beatsPerBar} beats per bar` : undefined;
  const measureCount = Math.max(...order.map(Number).filter(Number.isFinite), order.length);

  const notes = events.filter((e) => e.kind === "note" && midiById.has(e.expectedId));
  const midis = notes.map((e) => midiById.get(e.expectedId)!);
  let key: string | undefined;
  if (midis.length >= 4) {
    const weight = Array(12).fill(0);
    notes.forEach((e, i) => { weight[((Math.round(midis[i]) % 12) + 12) % 12] += beatsOf(e) ?? 1; });
    const candidates: { tonic: number; mode: string; score: number }[] = [];
    for (let tonic = 0; tonic < 12; tonic++) for (const [profile, mode] of [[MAJOR, "major"], [MINOR, "minor"]] as const)
      candidates.push({ tonic, mode, score: profile.reduce((s, p, i) => s + p * weight[(i + tonic) % 12], 0) });
    candidates.sort((a, b) => b.score - a.score);
    const finalClass = ((Math.round(midis[midis.length - 1]) % 12) + 12) % 12;
    const pick = candidates.find((c) => c.tonic === finalClass && c.score >= candidates[0].score * 0.9) ?? candidates[0];
    key = `${NOTE_NAMES[pick.tonic]} ${pick.mode}`;
  }

  const leaps = midis.slice(1).map((m, i) => Math.abs(Math.round(m - midis[i])));
  const stepwise = leaps.filter((l) => l <= 2).length;
  const largest = leaps.length ? Math.max(...leaps) : 0;
  const motion = leaps.length
    ? `${Math.round((stepwise / leaps.length) * 100)}% steps, largest leap ${INTERVALS[Math.min(largest, 12)]}${largest > 12 ? "+" : ""}`
    : undefined;

  const phrases: string[] = [];
  let start: AnalysisEvent | undefined;
  events.forEach((e, i) => {
    if (e.kind === "note") start ??= e;
    const breath = e.kind === "rest" ? (beatsOf(e) ?? 1) >= 1 : (beatsOf(e) ?? 0) >= 2;
    if (start && (breath || i === events.length - 1)) {
      const end = e.kind === "rest" ? events[i - 1] : e;
      phrases.push(start.measure === end.measure ? `m. ${start.measure}` : `m. ${start.measure}–${end.measure}`);
      start = undefined;
    }
  });

  const patterns = new Map<string, string[]>();
  for (const m of order) {
    const pattern = events.filter((e) => e.measure === m && e.kind === "note").map((e) => shortValue(e.rhythmLabel)).join("-");
    if (pattern.includes("-")) patterns.set(pattern, [...(patterns.get(pattern) ?? []), m]);
  }
  const openings = new Map<string, string[]>();
  for (const m of order) {
    const head = notes.filter((e) => e.measure === m).slice(0, 4);
    if (head.length === 4) {
      const motif = head.map((e) => `${noteName(midiById.get(e.expectedId)!)} ${shortValue(e.rhythmLabel)}`).join(", ");
      openings.set(motif, [...(openings.get(motif) ?? []), m]);
    }
  }
  const repeated = (map: Map<string, string[]>, label: string) => [...map.entries()].filter(([, ms]) => ms.length > 1)
    .sort((a, b) => b[1].length - a[1].length).map(([p, ms]) => `${label} ${p} (m. ${ms.join(", ")})`);
  const motifs = [...repeated(openings, "melody"), ...repeated(patterns, "rhythm")].slice(0, 4);

  const outline = order.slice(0, 24).map((m) => `m${m}: ${events.filter((e) => e.measure === m).map((e) =>
    e.kind === "rest" ? `rest${beatsOf(e) ? ` ${beatsOf(e)}b` : ""}` : `${midiById.has(e.expectedId) ? noteName(midiById.get(e.expectedId)!) : "?"} ${shortValue(e.rhythmLabel)}`).join(", ")}`);

  return {
    key, meter, measureCount, phrases: phrases.slice(0, 16), motifs, motion, outline,
    range: midis.length ? `${noteName(Math.min(...midis))}–${noteName(Math.max(...midis))}` : undefined,
    rhythmValues: [...new Set(notes.map((e) => shortValue(e.rhythmLabel)))].slice(0, 8),
  };
}

/** Compact, citation-ready description of one analyzed take for the model. */
export function analysisDigest(result: AnalysisResult, title = "") {
  const insights = result.insights;
  const events = result.rhythmEvents ?? [];
  const notes = events.filter((e) => e.kind === "note");
  const matched = notes.filter((e) => e.actualStartSec !== undefined);
  const timing = matched.map((e) => Math.abs(e.timingErrorMs ?? 0));
  const cents = (insights?.notes ?? []).flatMap((n) => (n.cents === undefined ? [] : [Math.abs(n.cents)]));
  const scoreMidi = new Map((insights?.scoreNotes ?? []).map((n) => [n.expectedId, n.midi]));
  const measurements = new Map((insights?.notes ?? []).map((n) => [n.expectedId, n]));
  const ranked = result.findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => statusRank(b.f.status) - statusRank(a.f.status) || (b.f.confidence ?? 0) - (a.f.confidence ?? 0))
    .slice(0, 60)
    .sort((a, b) => a.i - b.i);
  const scoreByMeasure = result.hasReference ? measures(result).map((measure) => {
    const measureEvents = events.filter((e) => e.measure === measure);
    const measureNotes = measureEvents.filter((e) => e.kind === "note");
    const midis = measureNotes.flatMap((e) => {
      const midi = scoreMidi.get(e.expectedId);
      return midi === undefined ? [] : [midi];
    });
    const starts = measureEvents.map((e) => e.targetStartSec).filter(Number.isFinite);
    const ends = measureEvents.map((e) => e.targetEndSec).filter(Number.isFinite);
    const span = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;
    const durations = measureNotes
      .map((e) => e.targetEndSec - e.targetStartSec)
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    const leaps = midis.slice(1).map((midi, i) => Math.abs(midi - midis[i]));
    const eventIds = new Set(measureEvents.map((e) => e.expectedId));
    const tuplets = (result.rhythmGroups ?? [])
      .filter((group) => group.eventIds?.some((id) => eventIds.has(id)))
      .map((group) => group.label);
    const tempo = insights?.tempo?.find((item) => item.measure === measure);
    return {
      measure,
      noteCount: measureNotes.length,
      restCount: measureEvents.length - measureNotes.length,
      scoreDurationSec: round(span, 2),
      notesPerSecond: span > 0 ? round(measureNotes.length / span, 2) : undefined,
      shortestNoteSec: durations.length ? round(Math.min(...durations), 3) : undefined,
      rangeSemitones: midis.length ? Math.max(...midis) - Math.min(...midis) : undefined,
      largestLeapSemitones: leaps.length ? Math.max(...leaps) : undefined,
      rhythms: [...new Set(measureNotes.map((e) => e.rhythmLabel))].slice(0, 8),
      tuplets: [...new Set(tuplets)].slice(0, 6),
      scoreBpm: round(tempo?.targetBpm),
    };
  }) : [];
  return {
    title: title.slice(0, 100),
    durationSec: round(result.durationSec, 1),
    hasReference: result.hasReference,
    measureCount: measures(result).length,
    recording: insights?.recording && {
      usable: insights.recording.usable,
      rmsDb: round(insights.recording.rmsDb, 1),
      peakDb: round(insights.recording.peakDb, 1),
      clippedPercent: round(insights.recording.clippedSampleFraction * 100, 2),
    },
    alignment: result.alignment && {
      confidencePercent: round(result.alignment.confidence * 100),
      ambiguous: result.alignment.ambiguous,
    },
    categories: insights?.categories.map((c) => ({
      id: c.id, status: c.status, detail: c.detail,
      findings: result.findings.filter((f) => (f.category ?? "rhythm") === c.id).length,
    })),
    notes: {
      scoreNotes: notes.length,
      matched: matched.length,
      meanAbsTimingMs: timing.length ? round(timing.reduce((a, b) => a + b, 0) / timing.length) : undefined,
      meanAbsCents: cents.length ? round(cents.reduce((a, b) => a + b, 0) / cents.length) : undefined,
    },
    findingTotal: result.findings.length,
    findings: ranked.map(({ f, i }) => ({
      id: findingId(i),
      category: f.category ?? "rhythm",
      kind: f.kind,
      measure: measureOf(result, f),
      beat: round(f.beat, 2),
      atSec: round(f.startSec, 2),
      confidencePercent: f.confidence === undefined ? undefined : round(f.confidence * 100),
      status: f.status,
      message: f.message,
    })),
    pitchByNote: (insights?.notes ?? [])
      .slice(0, 300)
      .map((n) => ({
        expectedId: n.expectedId,
        measure: n.measure,
        beat: round(n.beat, 2),
        atSec: round(n.startSec, 2),
        expectedPitch: (n.expectedMidi ?? scoreMidi.get(n.expectedId)) === undefined
          ? undefined
          : noteName((n.expectedMidi ?? scoreMidi.get(n.expectedId))!),
        playedPitch: n.midi === undefined ? undefined : noteName(n.midi),
        cents: round(n.cents),
        absCents: n.cents === undefined ? undefined : round(Math.abs(n.cents)),
        driftCents: round(n.driftCents),
        pitchCoveragePercent: round(n.pitchCoverage * 100),
      })),
    rhythmByEvent: events.slice(0, 400).map((event) => {
      const measurement = measurements.get(event.expectedId);
      const playedDuration = event.actualStartSec !== undefined && event.actualEndSec !== undefined
        ? event.actualEndSec - event.actualStartSec
        : undefined;
      return {
        expectedId: event.expectedId,
        kind: event.kind,
        measure: event.measure,
        beat: round(event.beat, 2),
        rhythm: event.rhythmLabel,
        atSec: round(event.targetStartSec, 2),
        expectedDurationMs: round((event.targetEndSec - event.targetStartSec) * 1000),
        playedDurationMs: playedDuration === undefined ? undefined : round(playedDuration * 1000),
        timingErrorMs: round(event.timingErrorMs),
        absTimingErrorMs: event.timingErrorMs === undefined ? undefined : round(Math.abs(event.timingErrorMs)),
        durationRatio: round(measurement?.durationRatio, 2),
      };
    }),
    scoreByMeasure,
    flaggedNoteMeasurements: (insights?.notes ?? [])
      .filter((n) => ranked.some(({ f }) => f.expectedId === n.expectedId))
      .slice(0, 30)
      .map((n) => ({
        measure: n.measure, beat: round(n.beat, 2), cents: round(n.cents), driftCents: round(n.driftCents),
        attackSettlingMs: round(n.attackSettlingMs), gapAfterMs: round(n.gapAfterMs),
        durationRatio: round(n.durationRatio, 2),
        timingErrorMs: round(events.find((e) => e.expectedId === n.expectedId)?.timingErrorMs),
      })),
    tempoByMeasure: (insights?.tempo ?? []).slice(0, 40).map((t) => ({
      measure: t.measure, bpm: round(t.bpm), scoreBpm: round(t.targetBpm), deviationPercent: round(t.deviationPercent, 1),
    })),
    warnings: result.quality.warnings.slice(0, 10),
  };
}
