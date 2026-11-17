/** Score summaries computed from the backend MusicXML importer output. */

type ImportedEvent = {
  id: string;
  kind: "note" | "rest";
  midi?: number;
  startBeat: number;
  durationBeats: number;
  measure: string;
  beat: number;
  notation?: { type?: string; dots?: number; actualNotes?: number; slur?: boolean; slurToNext?: boolean; articulation?: string[] };
};
export type ImportedScore = {
  title: string;
  parts: { id: string; name: string }[];
  selectedPartId: string;
  notes: { id: string; midi: number; startSec: number; endSec: number }[];
  tempoMap: { beat: number; bpm: number }[];
  rhythm: { events: ImportedEvent[]; meterMap: { beat: number; numerator: number; denominator: number }[] };
  durationSec: number;
  warnings: string[];
};

/** Enough of a score to play it back and locate measures; stored with practice pieces. */
export type CompactScore = {
  title: string;
  partName: string;
  tempoBpm: number;
  meter: string;
  durationSec: number;
  measures: string[];
  notes: { id: string; midi: number; startSec: number; endSec: number; measure: string; beat: number }[];
  warnings: string[];
};

export const pitchName = (midi: number) =>
  `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

function secondsAt(score: ImportedScore) {
  const map = score.tempoMap.length ? score.tempoMap : [{ beat: 0, bpm: 100 }];
  return (beat: number) => {
    let elapsed = 0;
    for (let i = 0; i < map.length && map[i].beat < beat; i++)
      elapsed += ((Math.min(beat, map[i + 1]?.beat ?? beat) - map[i].beat) * 60) / map[i].bpm;
    return elapsed;
  };
}

export function compactScore(score: ImportedScore): CompactScore {
  const events = new Map(score.rhythm.events.map((e) => [e.id, e]));
  const meter = score.rhythm.meterMap[0];
  return {
    title: score.title,
    partName: score.parts.find((p) => p.id === score.selectedPartId)?.name ?? score.selectedPartId,
    tempoBpm: Math.round(score.tempoMap[0]?.bpm ?? 100),
    meter: meter ? `${meter.numerator}/${meter.denominator}` : "4/4",
    durationSec: score.durationSec,
    measures: [...new Set(score.rhythm.events.map((e) => e.measure))],
    notes: score.notes.map((n) => ({ ...n, measure: events.get(n.id)?.measure ?? "", beat: events.get(n.id)?.beat ?? 1 })),
    warnings: score.warnings.slice(0, 8),
  };
}

export type BreathCandidate = { id: string; measure: string; beat: number; reason: string; atSec: number };

/** Measure-level difficulty signals and possible breathing places, all derived from notation. */
export function scoreDigest(score: ImportedScore) {
  const at = secondsAt(score);
  const events = [...score.rhythm.events].sort((a, b) => a.startBeat - b.startBeat);
  const notes = events.filter((e) => e.kind === "note" && e.midi !== undefined);
  const order = [...new Set(events.map((e) => e.measure))];
  const midis = notes.map((n) => n.midi!);
  const sorted = [...midis].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 60;
  const measures = order.map((measure) => {
    const inMeasure = events.filter((e) => e.measure === measure);
    const pitched = inMeasure.filter((e) => e.kind === "note" && e.midi !== undefined);
    const start = Math.min(...inMeasure.map((e) => e.startBeat));
    const end = Math.max(...inMeasure.map((e) => e.startBeat + e.durationBeats));
    const seconds = Math.max(0.01, at(end) - at(start));
    let maxLeap = 0;
    pitched.forEach((n, i) => { if (i) maxLeap = Math.max(maxLeap, Math.abs(n.midi! - pitched[i - 1].midi!)); });
    const shortest = pitched.length ? Math.min(...pitched.map((n) => n.durationBeats)) : 0;
    const highest = pitched.length ? Math.max(...pitched.map((n) => n.midi!)) : undefined;
    const tuplets = pitched.filter((n) => n.notation?.actualNotes).length;
    const articulations = [...new Set(pitched.flatMap((n) => n.notation?.articulation ?? []))];
    const notesPerSecond = pitched.length / seconds;
    const difficulty = notesPerSecond * 0.8 + maxLeap / 4 + Math.max(0, ((highest ?? median) - median) / 4)
      + (tuplets ? 1 : 0) + (shortest && shortest <= 0.25 ? 1 : 0) + articulations.length * 0.3;
    return {
      measure, notes: pitched.length, notesPerSecond: Number(notesPerSecond.toFixed(1)),
      shortestBeats: shortest, maxLeapSemitones: maxLeap,
      highest: highest === undefined ? undefined : pitchName(highest),
      tuplets, articulations, difficulty: Number(difficulty.toFixed(2)),
    };
  });
  const breaths: BreathCandidate[] = [];
  const add = (e: ImportedEvent, reason: string) => {
    if (breaths.some((b) => b.measure === e.measure && Math.abs(b.beat - e.beat) < 1e-6)) return;
    breaths.push({ id: `B${breaths.length + 1}`, measure: e.measure, beat: Number(e.beat.toFixed(2)), reason, atSec: Number(at(e.startBeat).toFixed(2)) });
  };
  events.forEach((e, i) => {
    const next = events[i + 1];
    if (!next) return;
    if (e.kind === "rest" && e.durationBeats >= 0.5) add(e, "rest");
    else if (e.kind === "note" && next.kind === "note" && !e.notation?.slurToNext) {
      if (e.durationBeats >= 2) add(e, "end of a long note");
      else if (e.notation?.slur && events[i - 1]?.notation?.slurToNext) add(e, "end of a slurred phrase");
    }
  });
  const stops = [0, ...breaths.map((b) => b.atSec), at(events.at(-1) ? events.at(-1)!.startBeat + events.at(-1)!.durationBeats : 0)];
  let longest = { seconds: 0, from: order[0], to: order.at(-1) };
  for (let i = 1; i < stops.length; i++) {
    const seconds = stops[i] - stops[i - 1];
    if (seconds > longest.seconds) longest = { seconds, from: breaths[i - 2]?.measure ?? order[0], to: breaths[i - 1]?.measure ?? order.at(-1) };
  }
  const meter = score.rhythm.meterMap[0];
  return {
    title: score.title,
    partName: score.parts.find((p) => p.id === score.selectedPartId)?.name ?? score.selectedPartId,
    tempoBpm: Math.round(score.tempoMap[0]?.bpm ?? 100),
    tempoChanges: score.tempoMap.length - 1,
    meter: meter ? `${meter.numerator}/${meter.denominator}` : "4/4",
    measureCount: order.length,
    durationSec: Number(score.durationSec.toFixed(1)),
    concertRange: midis.length ? { low: pitchName(Math.min(...midis)), high: pitchName(Math.max(...midis)) } : undefined,
    measures,
    hardestMeasures: [...measures].sort((a, b) => b.difficulty - a.difficulty).slice(0, 8).map((m) => m.measure),
    breathCandidates: breaths.slice(0, 40),
    longestStretchWithoutBreath: { seconds: Number(longest.seconds.toFixed(1)), fromMeasure: longest.from, toMeasure: longest.to },
    importWarnings: score.warnings.slice(0, 6),
  };
}
