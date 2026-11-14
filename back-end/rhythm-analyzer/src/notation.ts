import type {
  RhythmEvent,
  RhythmScore,
  RhythmMatch,
  RhythmNote,
} from "./types.ts";

const values = [
  ["whole", "Whole note", 4],
  ["half", "Half note", 2],
  ["quarter", "Quarter note", 1],
  ["eighth", "Eighth note", 0.5],
  ["16th", "Sixteenth note", 0.25],
  ["32nd", "Thirty-second note", 0.125],
  ["64th", "Sixty-fourth note", 0.0625],
] as const;
const groupName = (n: number) =>
  ({
    3: "Triplet",
    4: "Quadruplet",
    5: "Quintuplet",
    6: "Sextuplet",
    7: "Septuplet",
  })[n] ?? `${n}-note tuplet`;

/** Labels come from score notation/beat durations, never measured audio seconds. */
export function rhythmLabel(event: RhythmEvent, score: RhythmScore) {
  if (score.notationSource === "timed_reference")
    return {
      label: "Written value unavailable",
      source: "unavailable" as const,
    };
  if ((event.tiedIds?.length ?? 0) > 1)
    return {
      label: `Tied notes (${Number(event.durationBeats.toFixed(3))} quarter-note beats)`,
      source: "notation" as const,
    };
  const n = event.notation;
  let base = values.find((v) => v[0] === n?.type);
  let dots = n?.dots ?? 0;
  const tuple =
    n?.actualNotes && n?.normalNotes && n.actualNotes !== n.normalNotes;
  if (!base) {
    const writtenDuration =
      event.durationBeats * (tuple ? n.actualNotes! / n.normalNotes! : 1);
    outer: for (const v of values)
      for (let d = 0; d <= 2; d++) {
        if (Math.abs(v[2] * (2 - 2 ** -d) - writtenDuration) < 1e-6) {
          base = v;
          dots = d;
          break outer;
        }
      }
  }
  let label = base
    ? `${dots === 1 ? "Dotted " : dots === 2 ? "Double-dotted " : ""}${base[1].toLowerCase()}`
    : `${Number(event.durationBeats.toFixed(3))} quarter-note beats`;
  if (event.kind === "rest") label = label.replace(/note$/, "rest");
  if (tuple)
    label += ` · ${groupName(n.actualNotes!).toLowerCase()} (${n.actualNotes}:${n.normalNotes})`;
  return {
    label: label[0].toUpperCase() + label.slice(1),
    source: n?.type ? ("notation" as const) : ("score_duration" as const),
  };
}

export type TupletAssessment = {
  id: string;
  label: string;
  eventIds: string[];
  measure: string;
  beat: number;
  actualNotes: number;
  normalNotes: number;
  status: "within_tolerance" | "uneven" | "shifted" | "incomplete";
  maxSpacingErrorMs: number | null;
  meanTimingErrorMs: number | null;
  confidence: number;
  message: string;
};

/** Conservative grouping: complete runs of equal-value, contiguous, same-measure tuplets.
 * Mixed-value, tied, nested or incomplete notated groups remain individual events.
 */
export function assessTuplets(
  score: RhythmScore,
  matches: RhythmMatch[],
  detected: RhythmNote[],
  toleranceMs: number,
): TupletAssessment[] {
  if (score.notationSource === "timed_reference") return [];
  const result: TupletAssessment[] = [];
  const byId = new Map(matches.map((m) => [m.expectedId, m]));
  for (let i = 0; i < score.events.length; i++) {
    const first = score.events[i],
      n = first.notation;
    const count = n?.actualNotes;
    if (
      !count ||
      !n?.normalNotes ||
      count === n.normalNotes ||
      count < 2 ||
      count > 16
    )
      continue;
    const events = score.events.slice(i, i + count);
    if (
      events.length !== count ||
      events.some(
        (e, j) =>
          e.kind !== "note" ||
          (e.tiedIds?.length ?? 0) > 1 ||
          e.measure !== first.measure ||
          e.notation?.actualNotes !== count ||
          e.notation?.normalNotes !== n.normalNotes ||
          e.notation?.type !== n.type ||
          Math.abs(e.durationBeats - first.durationBeats) > 1e-6 ||
          (j > 0 &&
            Math.abs(
              e.startBeat -
                events[j - 1].startBeat -
                events[j - 1].durationBeats,
            ) > 1e-6),
      )
    )
      continue;
    const mapped = events.map((e) => byId.get(e.id));
    const complete = mapped.every((m) => m !== undefined);
    let maxSpacingErrorMs: number | null = null,
      meanTimingErrorMs: number | null = null;
    let status: TupletAssessment["status"] = "incomplete";
    if (complete) {
      const ms = mapped as RhythmMatch[];
      const errors = ms.map((m) => m.timingErrorMs);
      maxSpacingErrorMs = Math.max(
        ...errors.slice(1).map((e, j) => Math.abs(e - errors[j])),
      );
      meanTimingErrorMs = errors.reduce((a, b) => a + b, 0) / errors.length;
      const uncertainty = Math.max(
        ...ms.map((m) => detected[m.detectedIndex].boundaryUncertaintyMs),
      );
      status =
        maxSpacingErrorMs > Math.max(toleranceMs, uncertainty * 2)
          ? "uneven"
          : Math.abs(meanTimingErrorMs) > Math.max(toleranceMs, uncertainty * 2)
            ? "shifted"
            : "within_tolerance";
    }
    const label = groupName(count);
    const where = `Measure ${first.measure}, beat ${Number(first.beat.toFixed(3))}`;
    const message =
      status === "uneven"
        ? `${where}: ${label.toLowerCase()} spacing is uneven; largest interval differs from the score by ${Math.round(maxSpacingErrorMs!)} ms.`
        : status === "shifted"
          ? `${where}: ${label.toLowerCase()} is ${Math.round(Math.abs(meanTimingErrorMs!))} ms ${meanTimingErrorMs! > 0 ? "late" : "early"} on average.`
          : status === "incomplete"
            ? `${where}: ${label.toLowerCase()} has an unmatched note; check for a missed or merged attack.`
            : `${where}: ${label.toLowerCase()} onset spacing is within tolerance.`;
    result.push({
      id: `tuplet-${first.id}`,
      label,
      eventIds: events.map((e) => e.id),
      measure: first.measure,
      beat: first.beat,
      actualNotes: count,
      normalNotes: n.normalNotes,
      status,
      maxSpacingErrorMs,
      meanTimingErrorMs,
      confidence: Math.min(...mapped.map((m) => m?.confidence ?? 0)),
      message,
    });
    i += count - 1;
  }
  return result;
}
