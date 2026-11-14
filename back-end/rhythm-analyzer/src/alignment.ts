import { rhythmLabel, assessTuplets } from "./notation.ts";
import { median } from "../../src/notes.ts";
import type {
  RhythmScore,
  RhythmEvent,
  RhythmNote,
  RhythmOptions,
  RhythmResult,
} from "./types.ts";

export function validateRhythmScore(score: RhythmScore): void {
  if (
    !score ||
    !Array.isArray(score.events) ||
    !score.events.length ||
    score.events.length > 4000 ||
    !score.events.some((e) => e.kind === "note") ||
    score.events.filter((e) => e.kind === "note").length > 2000
  )
    throw new Error(
      "Rhythm score must contain 1–2000 notes and at most 4000 total events.",
    );
  const ids = new Set<string>();
  let end = 0;
  for (const e of score.events) {
    if (
      !e ||
      !["note", "rest"].includes(e.kind) ||
      typeof e.id !== "string" ||
      !e.id ||
      ids.has(e.id) ||
      (e.notation !== undefined &&
        (!e.notation ||
          (e.notation.dots !== undefined &&
            (!Number.isInteger(e.notation.dots) ||
              e.notation.dots < 0 ||
              e.notation.dots > 2)) ||
          ((e.notation.actualNotes !== undefined ||
            e.notation.normalNotes !== undefined) &&
            (!Number.isInteger(e.notation.actualNotes) ||
              !Number.isInteger(e.notation.normalNotes) ||
              e.notation.actualNotes! < 1 ||
              e.notation.actualNotes! > 64 ||
              e.notation.normalNotes! < 1 ||
              e.notation.normalNotes! > 64)))) ||
      !Number.isFinite(e.startBeat) ||
      e.startBeat < end - 1e-7 ||
      !Number.isFinite(e.durationBeats) ||
      e.durationBeats <= 0 ||
      typeof e.measure !== "string" ||
      !Number.isFinite(e.beat) ||
      e.beat < 1 ||
      (e.midi !== undefined &&
        (!Number.isInteger(e.midi) || e.midi < 0 || e.midi > 127))
    )
      throw new Error(
        "Rhythm events need unique IDs, valid positions, and ordered non-overlapping beat durations.",
      );
    ids.add(e.id);
    end = e.startBeat + e.durationBeats;
  }
  for (const [key, map] of [
    ["tempoMap", score.tempoMap],
    ["meterMap", score.meterMap],
  ] as const) {
    if (
      !Array.isArray(map) ||
      !map.length ||
      map.length > 2000 ||
      map[0].beat !== 0 ||
      map.some(
        (p, i) =>
          !Number.isFinite(p.beat) ||
          p.beat < 0 ||
          (i > 0 && p.beat <= map[i - 1].beat),
      )
    )
      throw new Error(
        `Invalid ${key}: start at beat zero and use increasing positions.`,
      );
  }
  if (
    score.tempoMap.some(
      (t) => !Number.isFinite(t.bpm) || t.bpm < 15 || t.bpm > 400,
    ) ||
    score.meterMap.some(
      (t) =>
        !Number.isInteger(t.numerator) ||
        t.numerator < 1 ||
        t.numerator > 32 ||
        ![1, 2, 4, 8, 16, 32].includes(t.denominator),
    )
  )
    throw new Error("Invalid score tempo or meter.");
  if (beatToSeconds(score, end) > 600)
    throw new Error("Select a score passage of at most 600 nominal seconds.");
}

export function beatToSeconds(score: RhythmScore, beat: number): number {
  let sec = 0;
  for (
    let i = 0;
    i < score.tempoMap.length && score.tempoMap[i].beat < beat;
    i++
  ) {
    const t = score.tempoMap[i];
    sec +=
      ((Math.min(beat, score.tempoMap[i + 1]?.beat ?? beat) - t.beat) * 60) /
      t.bpm;
  }
  return sec;
}

type Pair = { expectedIndex: number; detectedIndex: number };
type Edit = {
  matches: Pair[];
  missing: number[];
  extra: number[];
  cost: number;
};
function edit(
  expected: RhythmEvent[],
  times: number[],
  detected: RhythmNote[],
  targets: number[],
  scale: number,
  broad: boolean | "sequence" = false,
): Edit {
  const cols = detected.length + 1;
  const steps = new Uint8Array((expected.length + 1) * cols);
  let previous = Float64Array.from({ length: cols }, (_, j) => j);
  for (let j = 1; j < cols; j++) steps[j] = 2;
  for (let i = 1; i <= expected.length; i++) {
    const row = new Float64Array(cols);
    row[0] = i;
    steps[i * cols] = 1;
    const localIoi =
      Math.min(
        times[i] === undefined ? Infinity : times[i] - times[i - 1],
        i > 1 ? times[i - 1] - times[i - 2] : Infinity,
      ) * scale;
    const window = broad ? 0.5 : Math.max(0.1, Math.min(0.4, localIoi * 0.6));
    for (let j = 1; j < cols; j++) {
      const err = Math.abs(detected[j - 1].startSec - targets[i - 1]);
      // Pitch is only a small correspondence cue; incorrect pitches may still match.
      const pitch =
        expected[i - 1].midi === undefined
          ? 0
          : Math.min(
              0.65,
              Math.abs(detected[j - 1].midi - expected[i - 1].midi!) * 0.13,
            );
      const sequenceCost =
        (expected[i - 1].midi === undefined
          ? 0.4
          : Math.min(
              1.8,
              Math.abs(detected[j - 1].midi - expected[i - 1].midi!) * 0.45,
            )) +
        0.15 * Math.abs(i / expected.length - j / detected.length);
      const match =
        previous[j - 1] +
        (broad === "sequence"
          ? sequenceCost
          : Math.min(3, err / window) + pitch);
      const missing = previous[j] + 1,
        extra = row[j - 1] + 1;
      row[j] = Math.min(match, missing, extra);
      steps[i * cols + j] = row[j] === match ? 0 : row[j] === missing ? 1 : 2;
    }
    previous = row;
  }
  const matches: Pair[] = [],
    missing: number[] = [],
    extra: number[] = [];
  let i = expected.length,
    j = detected.length;
  while (i || j) {
    const step = steps[i * cols + j];
    if (step === 0) matches.push({ expectedIndex: --i, detectedIndex: --j });
    else if (step === 1) missing.push(--i);
    else extra.push(--j);
  }
  return {
    matches: matches.reverse(),
    missing: missing.reverse(),
    extra: extra.reverse(),
    cost: previous.at(-1)!,
  };
}
function nearestIndex(sorted: number[], value: number): number {
  let lo = 0,
    hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  if (!lo) return 0;
  return lo === sorted.length || value - sorted[lo - 1] < sorted[lo] - value
    ? lo - 1
    : lo;
}
function fit(
  times: number[],
  detected: RhythmNote[],
  pairs: Pair[],
  scale: number,
  offset: number,
) {
  if (pairs.length < 3) return { scale, offset };
  // Median pair slopes tolerate local mistakes and missing/extra observations.
  const slopes: number[] = [];
  const stride = Math.max(1, Math.floor(pairs.length / 35));
  for (let a = 0; a < pairs.length; a += stride)
    for (let b = a + stride; b < pairs.length; b += stride) {
      const p = pairs[a],
        q = pairs[b],
        dx = times[q.expectedIndex] - times[p.expectedIndex];
      if (dx > 1)
        slopes.push(
          (detected[q.detectedIndex].startSec -
            detected[p.detectedIndex].startSec) /
            dx,
        );
    }
  if (slopes.length) scale = Math.max(0.5, Math.min(2, median(slopes)));
  offset = median(
    pairs.map(
      (p) =>
        detected[p.detectedIndex].startSec - scale * times[p.expectedIndex],
    ),
  );
  return { scale, offset };
}

export function alignRhythm(
  score: RhythmScore,
  detected: RhythmNote[],
  durationSec: number,
  sourceStartSec = 0,
  options: RhythmOptions = {},
): RhythmResult {
  validateRhythmScore(score);
  const mode = options.alignmentMode ?? "automatic";
  const tolerance = options.timingToleranceMs ?? 70,
    durationTolerance = options.durationToleranceMs ?? 120;
  if (
    !["automatic", "fixed"].includes(mode) ||
    !Number.isFinite(tolerance) ||
    tolerance < 10 ||
    tolerance > 500 ||
    !Number.isFinite(durationTolerance) ||
    durationTolerance < 20 ||
    durationTolerance > 2000 ||
    (options.referenceOffsetSec !== undefined &&
      !Number.isFinite(options.referenceOffsetSec)) ||
    (options.tempoScale !== undefined &&
      (!Number.isFinite(options.tempoScale) ||
        options.tempoScale < 0.5 ||
        options.tempoScale > 2))
  )
    throw new Error("Invalid rhythm alignment options.");
  if (
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    durationSec > 120 ||
    !Number.isFinite(sourceStartSec) ||
    sourceStartSec < 0 ||
    !Array.isArray(detected) ||
    detected.length > 2400 ||
    detected.some(
      (d, i) =>
        !d ||
        ![
          d.startSec,
          d.endSec,
          d.midi,
          d.confidence,
          d.offsetConfidence,
          d.boundaryUncertaintyMs,
        ].every(Number.isFinite) ||
        d.startSec < 0 ||
        d.endSec <= d.startSec ||
        d.endSec > durationSec + 0.01 ||
        (i > 0 && d.startSec < detected[i - 1].startSec) ||
        d.confidence < 0 ||
        d.confidence > 1 ||
        d.offsetConfidence < 0 ||
        d.offsetConfidence > 1 ||
        d.boundaryUncertaintyMs < 0,
    )
  )
    throw new Error("Invalid rhythm event timings or recording duration.");
  const notes = score.events.filter((e) => e.kind === "note");
  const times = notes.map((n) => beatToSeconds(score, n.startBeat));
  let scale = options.tempoScale ?? 1,
    offset = options.referenceOffsetSec ?? 0;
  let ambiguous = false;
  const warnings: string[] = [];
  if (mode === "automatic" && detected.length) {
    const observed = detected.map((d) => d.startSec);
    const candidates: { scale: number; offset: number; cost: number }[] = [];
    // Symmetric nearest-event cost: a fast/half-time solution cannot win by
    // matching only every other score event. DP resolves ordering afterwards.
    const coarseTimes = times.filter(
      (_, i) => i % Math.max(1, Math.floor(times.length / 200)) === 0,
    );
    for (let s = 0.5; s <= 2.001; s += 0.02) {
      const offsets = new Set<number>();
      for (let i = 0; i < Math.min(5, times.length); i++)
        for (let j = 0; j < Math.min(7, observed.length); j++)
          offsets.add(Math.round((observed[j] - s * times[i]) * 50) / 50);
      for (const o of offsets) {
        if (o + s * times[0] < -0.5) continue;
        const forward = coarseTimes.map((t) => {
          const j = nearestIndex(observed, o + s * t),
            i = nearestIndex(times, t);
          return (
            Math.min(0.3, Math.abs(observed[j] - o - s * t)) +
            (notes[i].midi === undefined
              ? 0
              : Math.min(
                  0.15,
                  Math.abs(notes[i].midi! - detected[j].midi) * 0.035,
                ))
          );
        });
        let cost = forward.reduce((a, b) => a + b, 0) / forward.length;
        cost +=
          observed.reduce(
            (sum, t) =>
              sum +
              Math.min(
                0.3,
                Math.abs(o + s * times[nearestIndex(times, (t - o) / s)] - t),
              ),
            0,
          ) / observed.length;
        candidates.push({ scale: s, offset: o, cost });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const fitted: { scale: number; offset: number; edit: Edit }[] = [];
    for (const c of candidates.slice(0, 8)) {
      let f = c,
        path: Edit;
      for (let iteration = 0; iteration < 4; iteration++) {
        path = edit(
          notes,
          times,
          detected,
          times.map((t) => f.offset + f.scale * t),
          f.scale,
          true,
        );
        f = { ...f, ...fit(times, detected, path.matches, f.scale, f.offset) };
      }
      path = edit(
        notes,
        times,
        detected,
        times.map((t) => f.offset + f.scale * t),
        f.scale,
        true,
      );
      fitted.push({ ...f, edit: path });
    }
    fitted.sort((a, b) => a.edit.cost - b.edit.cost);
    if (fitted[0]) {
      scale = fitted[0].scale;
      offset = fitted[0].offset;
      ambiguous = fitted.some(
        (f) =>
          Math.abs(f.offset - offset) > 0.15 &&
          f.edit.cost < fitted[0].edit.cost + 0.5,
      );
    }
    warnings.push(
      "Automatic synchronization estimates the lead-in and tempo; absolute entrance lateness requires a fixed synchronization cue.",
    );
  }
  let path = edit(
    notes,
    times,
    detected,
    times.map((t) => offset + scale * t),
    scale,
    mode === "automatic",
  );
  // A stable pitch contour supplies a second initialization when gradual tempo
  // changes make an affine-only timing fit select the wrong repeated phrase.
  // This is correspondence evidence only: substituted pitches are still legal.
  if (
    mode === "automatic" &&
    detected.length >= 4 &&
    notes.every((n) => n.midi !== undefined)
  ) {
    const sequence = edit(
      notes,
      times,
      detected,
      times.map((t) => offset + scale * t),
      scale,
      "sequence",
    );
    const seed = fit(times, detected, sequence.matches, scale, offset);
    const pitchAgreement =
      sequence.matches.filter(
        (p) =>
          Math.abs(
            notes[p.expectedIndex].midi! - detected[p.detectedIndex].midi,
          ) < 0.7,
      ).length / Math.max(notes.length, detected.length);
    const deviation = median(
      sequence.matches.map((p) =>
        Math.abs(
          detected[p.detectedIndex].startSec -
            seed.offset -
            seed.scale * times[p.expectedIndex],
        ),
      ),
    );
    if (pitchAgreement > 0.8 && deviation < 0.6) {
      path = sequence;
      scale = seed.scale;
      offset = seed.offset;
      ambiguous = false;
    }
  }
  const anchors = [{ scoreSec: 0, performanceSec: offset }];
  const scoreEnd = beatToSeconds(
    score,
    Math.max(...score.events.map((e) => e.startBeat + e.durationBeats)),
  );
  // Robust, slow local tempo curve; never anchor every note to itself.
  if (
    mode === "automatic" &&
    options.expressiveTiming !== false &&
    path.matches.length >= 12
  ) {
    const interval = Math.max(3, scoreEnd / 24);
    const anchorTimes: number[] = [];
    for (let t = 0; t < scoreEnd; t += interval) anchorTimes.push(t);
    anchorTimes.push(scoreEnd);
    anchors.length = 0;
    for (const t of anchorTimes) {
      const nearby = path.matches.filter(
        (p) => Math.abs(times[p.expectedIndex] - t) <= interval * 1.5,
      );
      let residual =
        nearby.length >= 5
          ? median(
              nearby.map(
                (p) =>
                  detected[p.detectedIndex].startSec -
                  offset -
                  scale * times[p.expectedIndex],
              ),
            )
          : 0;
      residual = Math.max(-0.6, Math.min(0.6, residual));
      let perf = offset + scale * t + residual;
      const prev = anchors.at(-1);
      if (prev)
        perf = Math.max(
          prev.performanceSec + scale * (t - prev.scoreSec) * 0.7,
          Math.min(
            prev.performanceSec + scale * (t - prev.scoreSec) * 1.3,
            perf,
          ),
        );
      anchors.push({ scoreSec: t, performanceSec: perf });
    }
  } else
    anchors.push({
      scoreSec: scoreEnd,
      performanceSec: offset + scale * scoreEnd,
    });
  const warp = (t: number): number => {
    let i = 1;
    while (i < anchors.length - 1 && anchors[i].scoreSec < t) i++;
    const a = anchors[i - 1],
      b = anchors[i];
    return (
      a.performanceSec +
      ((t - a.scoreSec) * (b.performanceSec - a.performanceSec)) /
        (b.scoreSec - a.scoreSec || 1)
    );
  };
  path = edit(notes, times, detected, times.map(warp), scale);
  const residuals = path.matches.map((p) =>
    Math.abs(detected[p.detectedIndex].startSec - warp(times[p.expectedIndex])),
  );
  const coverage =
    path.matches.length / Math.max(notes.length, detected.length, 1);
  if (notes.length < 4 && mode === "automatic") ambiguous = true;
  const confidence = Math.max(
    0,
    Math.min(
      0.98,
      coverage *
        (1 - Math.min(0.65, median(residuals) / 0.35)) *
        (ambiguous ? 0.6 : 1),
    ),
  );
  if (notes.length < 4 && mode === "automatic") {
    ambiguous = true;
    warnings.push(
      "Too few notes for reliable automatic synchronization; use a fixed cue.",
    );
  }
  if (confidence < 0.6 || ambiguous)
    warnings.push(
      "Ambiguous or weak score alignment. Findings are review suggestions, not confirmed mistakes.",
    );
  const findings: RhythmResult["findings"] = [];
  const add = (
    kind: RhythmResult["findings"][number]["kind"],
    e: RhythmEvent | undefined,
    d: RhythmNote | undefined,
    message: string,
    values: Record<string, number> = {},
  ) => {
    const startSec =
      d?.startSec ?? Math.max(0, warp(beatToSeconds(score, e!.startBeat)));
    const certainty =
      confidence *
      (d?.confidence ?? 0.5) *
      (kind === "incorrect_duration" ? (d?.offsetConfidence ?? 0.5) : 1);
    findings.push({
      kind,
      expectedId: e?.id,
      measure: e?.measure,
      beat: e?.beat,
      startSec,
      sourceStartSec: sourceStartSec + startSec,
      endSec:
        d?.endSec ??
        Math.max(
          startSec,
          warp(beatToSeconds(score, e!.startBeat + e!.durationBeats)),
        ),
      confidence: certainty,
      status: certainty >= 0.6 && !ambiguous ? "likely" : "review",
      message,
      ...values,
    });
  };
  const matches: RhythmResult["matches"] = path.matches.map((p) => {
    const e = notes[p.expectedIndex],
      d = detected[p.detectedIndex];
    const targetStartSec = warp(times[p.expectedIndex]),
      targetEndSec = warp(beatToSeconds(score, e.startBeat + e.durationBeats));
    const timingErrorMs = 1000 * (d.startSec - targetStartSec);
    const soundingDurationErrorMs =
      1000 * (d.endSec - d.startSec - (targetEndSec - targetStartSec));
    if (
      Math.abs(timingErrorMs) > Math.max(tolerance, d.boundaryUncertaintyMs * 2)
    )
      add(
        timingErrorMs > 0 ? "late" : "early",
        e,
        d,
        `${e.measure}, beat ${e.beat}: starts ${Math.round(Math.abs(timingErrorMs))} ms ${timingErrorMs > 0 ? "late" : "early"}.`,
        { timingErrorMs },
      );
    const nominal = targetEndSec - targetStartSec;
    // Small separation gaps are articulation, not a different written value.
    const allowed = Math.max(durationTolerance / 1000, nominal * 0.3);
    const short = nominal - (d.endSec - d.startSec);
    if (
      !e.notation?.articulation?.some((a) =>
        ["staccato", "staccatissimo", "fermata"].includes(a),
      ) &&
      Math.abs(short) > allowed
    )
      add(
        "incorrect_duration",
        e,
        d,
        `Sound lasts ${Math.round(Math.abs(short) * 1000)} ms ${short > 0 ? "less" : "longer"} than the target duration; review articulation.`,
        { durationErrorMs: -1000 * short },
      );
    return {
      ...p,
      rhythmLabel: rhythmLabel(e, score).label,
      labelSource: rhythmLabel(e, score).source,
      expectedId: e.id,
      measure: e.measure,
      beat: e.beat,
      startBeat: e.startBeat,
      durationBeats: e.durationBeats,
      targetStartSec,
      targetEndSec,
      timingErrorMs,
      soundingDurationErrorMs,
      confidence: confidence * d.confidence,
      notation: e.notation,
      tiedIds: e.tiedIds,
    };
  });
  for (const i of path.missing)
    add(
      "missing_note",
      notes[i],
      undefined,
      "No matching acoustic boundary was detected; a weak slur or merged repeated note is also possible.",
    );
  for (const i of path.extra) {
    const d = detected[i];
    const e = notes[nearestIndex(times, (d.startSec - offset) / scale)];
    add(
      "extra_note",
      undefined,
      d,
      `Additional acoustic boundary near measure ${e.measure}, beat ${e.beat}.`,
    );
    const f = findings.at(-1)!;
    f.measure = e.measure;
    f.beat = e.beat;
  }
  // Unexpected silence *inside* a sustained score event (sound on both sides).
  // Ordinary separation at the end of a note is handled by duration feedback.
  for (const m of matches) {
    const spans = detected.filter(
      (d) => d.endSec > m.targetStartSec && d.startSec < m.targetEndSec,
    );
    for (let i = 1; i < spans.length; i++) {
      const gap = spans[i].startSec - spans[i - 1].endSec;
      if (
        gap > Math.max(0.12, tolerance / 1000) &&
        spans[i - 1].endSec > m.targetStartSec + 0.08 &&
        spans[i].startSec < m.targetEndSec - 0.08
      )
        add(
          "misplaced_rest",
          notes[m.expectedIndex],
          undefined,
          `Unexpected ${Math.round(gap * 1000)} ms silence inside the note in measure ${m.measure}, beat ${m.beat}.`,
          { durationErrorMs: gap * 1000 },
        );
    }
  }
  const rests = score.events
    .filter((e) => e.kind === "rest")
    .map((e) => {
      const startSec = warp(beatToSeconds(score, e.startBeat)),
        endSec = warp(beatToSeconds(score, e.startBeat + e.durationBeats));
      const overlap = detected.reduce(
        (sum, d) =>
          sum +
          Math.max(
            0,
            Math.min(endSec, d.endSec) - Math.max(startSec, d.startSec),
          ),
        0,
      );
      if (overlap > Math.max(tolerance / 1000, 0.04))
        add(
          "misplaced_rest",
          e,
          undefined,
          `Expected silence in measure ${e.measure}, beat ${e.beat}; ${Math.round(overlap * 1000)} ms of sound overlaps the rest.`,
          { durationErrorMs: overlap * 1000 },
        );
      return {
        expectedId: e.id,
        measure: e.measure,
        beat: e.beat,
        startSec,
        endSec,
        soundingOverlapSec: overlap,
      };
    });
  const rhythmGroups = assessTuplets(score, matches, detected, tolerance);
  for (const group of rhythmGroups.filter((g) => g.status === "uneven")) {
    const e = notes.find((n) => n.id === group.eventIds[0])!;
    const m = matches.find((m) => m.expectedId === e.id);
    add(
      "uneven_tuplet",
      e,
      m ? detected[m.detectedIndex] : undefined,
      group.message,
      { timingErrorMs: group.maxSpacingErrorMs! },
    );
    findings.at(-1)!.confidence = group.confidence;
    findings.at(-1)!.status =
      group.confidence >= 0.6 && !ambiguous ? "likely" : "review";
  }
  const byId = new Map(matches.map((m) => [m.expectedId, m]));
  const rhythmEvents = score.events.map((e) => {
    const m = byId.get(e.id),
      d = m ? detected[m.detectedIndex] : undefined;
    const label = rhythmLabel(e, score);
    return {
      expectedId: e.id,
      kind: e.kind,
      measure: e.measure,
      beat: e.beat,
      rhythmLabel: label.label,
      labelSource: label.source,
      targetStartSec: warp(beatToSeconds(score, e.startBeat)),
      targetEndSec: warp(beatToSeconds(score, e.startBeat + e.durationBeats)),
      detectedIndex: m?.detectedIndex,
      actualStartSec: d?.startSec,
      actualEndSec: d?.endSec,
      timingErrorMs: m?.timingErrorMs,
    };
  });
  return {
    version: "1.0.0-rhythm",
    rhythmEngine: "spectral-yin-v1",
    durationSec,
    detectedNotes: detected,
    matches,
    rhythmEvents,
    rhythmGroups,
    findings: findings.sort((a, b) => a.startSec - b.startSec),
    rests,
    alignment: {
      mode,
      offsetSec: offset,
      tempoScale: scale,
      confidence,
      ambiguous,
      anchors,
      missingIds: path.missing.map((i) => notes[i].id),
      extraIndices: path.extra,
    },
    quality: {
      warnings,
      clippedSampleFraction: 0,
      voicedConfidenceFraction: detected.length
        ? median(detected.map((d) => d.confidence))
        : 0,
    },
  };
}
