import { createHash } from "node:crypto";
import {
  analyzeRhythmClip,
  detectRhythm,
  rhythmFromTimedNotes,
  beatToSeconds,
} from "../../rhythm-analyzer/src/index.ts";
import { estimatePitch } from "../../src/pitch/crepe.ts";
import { median } from "../../src/notes.ts";
import type { AudioClip, PitchTrack } from "../../src/types.ts";
import type {
  RhythmResult,
  RhythmScore,
} from "../../rhythm-analyzer/src/types.ts";
import type {
  PerformanceReference,
  PerformanceResult,
  PerformanceInsights,
  PerformanceFinding,
  NoteMeasurement,
  Category,
} from "./types.ts";

const db = (energy: number) => 10 * Math.log10(Math.max(1e-12, energy));
const average = (xs: number[]) =>
  xs.reduce((s, n) => s + n, 0) / Math.max(1, xs.length);
function energy(clip: AudioClip, from: number, to: number) {
  const a = Math.max(0, Math.floor(from * clip.sampleRate)),
    b = Math.min(clip.samples.length, Math.ceil(to * clip.sampleRate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += clip.samples[i] ** 2;
  return db(sum / Math.max(1, b - a));
}
export function referenceScore(
  ref?: PerformanceReference,
): RhythmScore | undefined {
  if (!ref) return;
  const score =
    ref.rhythm ??
    (ref.events ? (ref as RhythmScore) : rhythmFromTimedNotes(ref.notes!));
  if (
    score.hairpins &&
    (!Array.isArray(score.hairpins) ||
      score.hairpins.length > 2000 ||
      score.hairpins.some(
        (h) =>
          !Number.isFinite(h.startBeat) ||
          !Number.isFinite(h.endBeat) ||
          h.startBeat < 0 ||
          h.endBeat <= h.startBeat ||
          !["crescendo", "diminuendo"].includes(h.kind),
      ))
  )
    throw new Error("Invalid hairpin spans.");
  for (const e of score.events) {
    if (e.dynamicsDb !== undefined && !Number.isFinite(e.dynamicsDb))
      throw new Error("Invalid dynamics target.");
    if (
      e.notation?.articulation &&
      (!Array.isArray(e.notation.articulation) ||
        e.notation.articulation.some((a) => typeof a !== "string"))
    )
      throw new Error("Invalid articulation markings.");
    if (
      e.notation?.slurToNext !== undefined &&
      typeof e.notation.slurToNext !== "boolean"
    )
      throw new Error("Invalid slur span.");
  }
  return score;
}

/** Pure measurements on the rhythm alignment; never run a second note alignment for pitch. */
export function measurePerformance(
  clip: AudioClip,
  base: RhythmResult,
  score?: RhythmScore,
  track?: PitchTrack,
  options: PerformanceReference["options"] = {},
) {
  const peak = clip.samples.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
  const clipped =
    clip.samples.reduce((n, x) => n + Number(Math.abs(x) >= 0.999), 0) /
    clip.samples.length;
  const rmsDb = energy(clip, 0, clip.samples.length / clip.sampleRate);
  const recording = {
    rmsDb,
    peakDb: 20 * Math.log10(Math.max(1e-6, peak)),
    clippedSampleFraction: clipped,
    usable: clipped <= 0.001 && peak >= 0.003,
  };
  const loudness: PerformanceInsights["loudness"] = [];
  for (let t = 0; t < base.durationSec; t += 0.05)
    loudness.push({ timeSec: +t.toFixed(3), db: energy(clip, t, t + 0.05) });
  const notes: NoteMeasurement[] = [];
  const findings: PerformanceFinding[] = [];
  const byId = new Map(score?.events.map((e) => [e.id, e]));
  const aligned = score
    ? base.matches
    : base.detectedNotes.map((_, i) => ({
        expectedId: `detected-${i}`,
        detectedIndex: i,
        measure: "Recording",
        beat: i + 1,
        confidence: 1,
        targetStartSec: 0,
        targetEndSec: 0,
      }));
  const trusted =
    recording.usable &&
    (!score || (!base.alignment.ambiguous && base.alignment.confidence >= 0.6));
  const add = (
    category: Category,
    kind: string,
    n: NoteMeasurement,
    message: string,
    confidence: number,
  ) => {
    if (trusted)
      findings.push({
        category,
        kind,
        expectedId: n.expectedId,
        measure: n.measure,
        beat: n.beat,
        startSec: n.startSec,
        endSec: n.endSec,
        message,
        confidence,
        status: "review",
      });
  };
  const tuning = options.tuningHz ?? 440,
    tolerance = options.pitchToleranceCents ?? 30;
  if (
    !Number.isFinite(tuning) ||
    tuning < 400 ||
    tuning > 480 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    tolerance >= 50
  )
    throw new Error("Invalid tuning or pitch tolerance.");
  for (const m of aligned) {
    const d = base.detectedNotes[m.detectedIndex],
      e = byId.get(m.expectedId);
    const duration = d.endSec - d.startSec,
      trim = Math.min(0.08, duration * 0.2);
    const frames =
      track?.frames.filter(
        (f) => f.timeSec >= d.startSec + trim && f.timeSec <= d.endSec - trim,
      ) ?? [];
    const voiced = frames.filter(
      (f) => f.frequencyHz !== null && f.periodicity >= 0.75,
    );
    const midiValues = voiced.map(
      (f) => 69 + 12 * Math.log2(f.frequencyHz! / tuning),
    );
    const midi = midiValues.length ? median(midiValues) : undefined;
    const center = e?.midi ?? midi;
    const curve =
      center === undefined
        ? []
        : voiced.map((f, i) => ({
            timeSec: f.timeSec,
            cents: 100 * (midiValues[i] - center),
          }));
    const third = Math.floor(curve.length / 3);
    const drift =
      duration >= 0.45 && third >= 5
        ? median(curve.slice(-third).map((f) => f.cents)) -
          median(curve.slice(0, third).map((f) => f.cents))
        : undefined;
    const next = base.detectedNotes[m.detectedIndex + 1];
    const n: NoteMeasurement = {
      expectedId: m.expectedId,
      measure: m.measure,
      beat: m.beat,
      startSec: d.startSec,
      endSec: d.endSec,
      expectedMidi: e?.midi,
      midi,
      cents:
        e?.midi !== undefined && midi !== undefined
          ? 100 * (midi - e.midi)
          : undefined,
      driftCents: drift,
      pitchCoverage: voiced.length / Math.max(1, frames.length),
      pitchCurve: curve.filter((_, i) => i % 3 === 0),
      articulationTargets: [
        ...(e?.notation?.articulation ?? []),
        ...(e?.notation?.slurToNext ? ["slur to next note"] : []),
      ],
      dynamicsTargetDb: e?.dynamicsDb,
      hairpinTargets: score?.hairpins
        ?.filter(
          (h) => e && e.startBeat >= h.startBeat && e.startBeat < h.endBeat,
        )
        .map((h) => h.kind),
      loudnessDb: energy(clip, d.startSec + trim, d.endSec - trim),
      durationRatio: score
        ? duration / (m.targetEndSec - m.targetStartSec)
        : undefined,
      gapAfterMs: next
        ? Math.max(0, next.startSec - d.endSec) * 1000
        : undefined,
    };
    if (midi !== undefined) {
      const attack =
        track?.frames.filter(
          (f) =>
            f.timeSec >= d.startSec &&
            f.timeSec <= Math.min(d.endSec, d.startSec + 0.3),
        ) ?? [];
      const settled = attack.findIndex(
        (_, i) =>
          attack.slice(i, i + 5).length === 5 &&
          attack
            .slice(i, i + 5)
            .every(
              (f) =>
                f.frequencyHz &&
                f.periodicity >= 0.75 &&
                Math.abs(
                  100 * (69 + 12 * Math.log2(f.frequencyHz / tuning) - midi),
                ) <= 30,
            ),
      );
      if (settled >= 0)
        n.attackSettlingMs = (attack[settled].timeSec - d.startSec) * 1000;
    }
    notes.push(n);
    const confidence = Math.min(d.confidence, m.confidence, n.pitchCoverage);
    if (confidence >= 0.65 && n.pitchCoverage >= 0.65 && voiced.length >= 5) {
      if (n.cents !== undefined && Math.abs(n.cents) > tolerance)
        add(
          "pitch",
          Math.abs(n.cents) >= 50
            ? "wrong_note"
            : n.cents > 0
              ? "sharp"
              : "flat",
          n,
          `${Math.round(Math.abs(n.cents))} cents ${n.cents > 0 ? "above" : "below"} the expected pitch.`,
          confidence,
        );
      if (drift !== undefined && Math.abs(drift) > 35 && Math.abs(drift) < 150)
        add(
          "pitch",
          "pitch_drift",
          n,
          `The sustained pitch moves ${Math.round(Math.abs(drift))} cents ${drift > 0 ? "up" : "down"} from the first to last third.`,
          confidence,
        );
    }
    if (
      !e ||
      d.offsetConfidence < 0.65 ||
      m.confidence < 0.65 ||
      e.notation?.articulation?.includes("fermata")
    )
      continue;
    const arts = e.notation?.articulation ?? [];
    if (arts.includes("staccato") && n.durationRatio! > 0.8)
      add(
        "articulation",
        "staccato_length",
        n,
        `This staccato note sounds for ${Math.round(n.durationRatio! * 100)}% of its written duration; try a clearer separation.`,
        Math.min(d.offsetConfidence, m.confidence),
      );
    if (arts.includes("tenuto") && n.durationRatio! < 0.7)
      add(
        "articulation",
        "tenuto_length",
        n,
        `This tenuto note sounds for ${Math.round(n.durationRatio! * 100)}% of its written duration.`,
        Math.min(d.offsetConfidence, m.confidence),
      );
    const nextEvent = score!.events[score!.events.indexOf(e) + 1];
    const nextMatch =
      nextEvent && base.matches.find((x) => x.expectedId === nextEvent.id);
    if (
      e.notation?.slurToNext &&
      nextEvent?.kind === "note" &&
      nextMatch?.detectedIndex === m.detectedIndex + 1 &&
      Math.abs(nextEvent.startBeat - e.startBeat - e.durationBeats) < 1e-6 &&
      n.gapAfterMs! > 70
    )
      add(
        "articulation",
        "slur_gap",
        n,
        `A ${Math.round(n.gapAfterMs!)} ms gap interrupts the marked slur.`,
        Math.min(d.offsetConfidence, m.confidence),
      );
  }
  const dynamics = notes.filter(
    (n) => byId.get(n.expectedId)?.dynamicsDb !== undefined,
  );
  if (dynamics.length >= 3) {
    const residuals = dynamics.map(
      (n) => n.loudnessDb - byId.get(n.expectedId)!.dynamicsDb!,
    );
    const baseline = median(residuals);
    dynamics.forEach((n, i) => {
      const delta = residuals[i] - baseline;
      if (Math.abs(delta) > 4)
        add(
          "dynamics",
          "relative_dynamics",
          n,
          `${Math.abs(delta).toFixed(1)} dB ${delta > 0 ? "louder" : "quieter"} than the relative target.`,
          0.7,
        );
    });
  }
  for (let i = 1; i < notes.length - 1; i++) {
    const n = notes[i];
    if (byId.get(n.expectedId)?.notation?.articulation?.includes("accent")) {
      const neighborIds = [notes[i - 1].expectedId, notes[i + 1].expectedId];
      if (
        neighborIds.some((id) =>
          byId.get(id)?.notation?.articulation?.includes("accent"),
        )
      )
        continue;
      const difference =
        n.loudnessDb -
        average([notes[i - 1].loudnessDb, notes[i + 1].loudnessDb]);
      if (difference < 1.5)
        add(
          "dynamics",
          "accent_contrast",
          n,
          `The accent is ${difference.toFixed(1)} dB relative to its neighbors; little loudness contrast was detected.`,
          0.6,
        );
    }
  }
  for (const h of score?.hairpins ?? []) {
    const span = notes.filter((n) => {
      const e = byId.get(n.expectedId)!;
      return e.startBeat >= h.startBeat && e.startBeat < h.endBeat;
    });
    // Measure the envelope within a held note as well as across multiple notes.
    if (!span.length) continue;
    const from = span[0].startSec + 0.08,
      to = span.at(-1)!.endSec - 0.08;
    const envelope = loudness.filter(
      (f) => f.timeSec >= from && f.timeSec <= to && f.db > -60,
    );
    if (envelope.length < 10) continue;
    const third = Math.max(1, Math.floor(envelope.length / 3));
    const change =
      median(envelope.slice(-third).map((f) => f.db)) -
      median(envelope.slice(0, third).map((f) => f.db));
    if ((h.kind === "crescendo" ? change : -change) < 2)
      add(
        "dynamics",
        "hairpin_contrast",
        span[0],
        `The marked ${h.kind} changes by ${change.toFixed(1)} dB; the expected direction is not clearly audible in the measured level.`,
        0.65,
      );
  }
  const tempo: PerformanceInsights["tempo"] = [];
  if (score)
    for (const measure of new Set(base.matches.map((m) => m.measure))) {
      const ms = base.matches.filter((m) => m.measure === measure);
      const intervals: { bpm: number; target: number }[] = [];
      for (let i = 1; i < ms.length; i++) {
        const a = ms[i - 1],
          b = ms[i];
        if (
          b.expectedIndex !== a.expectedIndex + 1 ||
          b.detectedIndex !== a.detectedIndex + 1
        )
          continue;
        const beats = b.startBeat - a.startBeat;
        const dt =
          base.detectedNotes[b.detectedIndex].startSec -
          base.detectedNotes[a.detectedIndex].startSec;
        const targetDt =
          beatToSeconds(score, b.startBeat) - beatToSeconds(score, a.startBeat);
        if (beats > 0 && dt > 0.05)
          intervals.push({
            bpm: (60 * beats) / dt,
            target: (60 * beats) / targetDt,
          });
      }
      if (intervals.length < 2) continue;
      const bpm = median(intervals.map((i) => i.bpm)),
        targetBpm = median(intervals.map((i) => i.target));
      tempo.push({
        measure,
        bpm,
        targetBpm,
        deviationPercent: (bpm / targetBpm - 1) * 100,
        intervals: intervals.length,
      });
    }
  // Tempo is descriptive: an intentional tempo choice or rubato is not automatically an error.
  const hasArt = score?.events.some(
    (e) =>
      e.notation?.slurToNext ||
      e.notation?.articulation?.some((a) => ["staccato", "tenuto"].includes(a)),
  );
  const hasDynamics =
    dynamics.length >= 3 ||
    !!score?.hairpins?.length ||
    score?.events.some((e) => e.notation?.articulation?.includes("accent"));
  const categories: PerformanceInsights["categories"] = [
    {
      id: "rhythm",
      label: "Rhythm",
      status: score ? "assessed" : "observed",
      detail: score
        ? "Timing, duration, rests and subdivisions against the score."
        : "Note boundaries only. Add a reviewed score to assess written rhythm.",
    },
    {
      id: "pitch",
      label: "Pitch",
      status: track
        ? score?.events.some((e) => e.midi !== undefined)
          ? "assessed"
          : "observed"
        : "unavailable",
      detail: track
        ? "Sustained pitch and drift; uncertain frames are excluded."
        : "Pitch worker unavailable. Other measurements remain available.",
    },
    {
      id: "articulation",
      label: "Articulation",
      status: hasArt ? "assessed" : "observed",
      detail: hasArt
        ? "Marked staccato, tenuto and slur gaps; thresholds are practice heuristics."
        : "Sounding lengths and gaps measured. Add articulation/slur markings for feedback.",
    },
    {
      id: "dynamics",
      label: "Dynamics",
      status: hasDynamics ? "assessed" : "observed",
      detail: hasDynamics
        ? "Relative targets, accents and hairpin direction. Microphone gain can affect results."
        : "Recorded loudness contour only. Add reviewed dynamics or accents for feedback.",
    },
    {
      id: "tempo",
      label: "Tempo",
      status: tempo.length ? "observed" : "unavailable",
      detail: tempo.length
        ? "Local tempo compared with the score; expressive changes are not automatically mistakes."
        : "Needs a score and at least three consecutive matched notes per measure.",
    },
  ];
  if (!trusted)
    for (const c of categories)
      if (c.status === "assessed") {
        c.status = "observed";
        c.detail =
          "Review recording quality or alignment before interpreting these measurements.";
      }
  return {
    findings,
    insights: {
      categories,
      notes,
      scoreNotes: base.rhythmEvents.flatMap((e) => {
        const midi = byId.get(e.expectedId)?.midi;
        return midi === undefined
          ? []
          : [
              {
                expectedId: e.expectedId,
                midi,
                startSec: e.targetStartSec,
                endSec: e.targetEndSec,
              },
            ];
      }),
      loudness,
      tempo,
      recording,
      scoreKey: score
        ? createHash("sha256").update(JSON.stringify(score)).digest("hex")
        : undefined,
    },
  };
}

export async function analyzePerformance(
  clip: AudioClip,
  reference?: PerformanceReference,
): Promise<PerformanceResult> {
  const score = referenceScore(reference);
  const [rhythm, pitch] = await Promise.allSettled([
    score
      ? analyzeRhythmClip(clip, score, reference?.rhythmOptions)
      : detectRhythm(clip),
    estimatePitch(clip, reference?.options, { batchSize: 32 }),
  ]);
  if (rhythm.status === "rejected") throw rhythm.reason;
  const d = rhythm.value;
  const base: RhythmResult =
    "rhythmEvents" in d
      ? d
      : {
          version: "1.0.0-rhythm",
          rhythmEngine: d.engine,
          durationSec: clip.samples.length / clip.sampleRate,
          detectedNotes: d.notes,
          matches: [],
          findings: [],
          rhythmEvents: [],
          rhythmGroups: [],
          rests: [],
          alignment: {
            mode: "automatic",
            offsetSec: 0,
            tempoScale: 1,
            confidence: 0,
            ambiguous: true,
            anchors: [],
            missingIds: [],
            extraIndices: [],
          },
          quality: {
            warnings: d.warnings,
            clippedSampleFraction: 0,
            voicedConfidenceFraction: d.notes.length
              ? average(d.notes.map((n) => n.confidence))
              : 0,
          },
        };
  const { insights, findings } = measurePerformance(
    clip,
    base,
    score,
    pitch.status === "fulfilled" ? pitch.value : undefined,
    reference?.options,
  );
  const warnings = [
    ...base.quality.warnings,
    ...(reference?.warnings ?? []).filter((w) => typeof w === "string"),
  ];
  if (!score)
    warnings.push(
      "No reviewed score: written values and musical mistakes cannot be determined.",
    );
  if (reference?.requiresReview)
    warnings.push(
      "Review extracted notation before treating findings as performance errors.",
    );
  if (pitch.status === "rejected")
    warnings.push(
      "Pitch analysis could not run. Check the local CREPE environment and retry.",
    );
  if (!insights.recording.usable)
    warnings.push(
      "Recording is clipped or too quiet. Expression and pitch findings are suppressed; record again at a steady microphone distance.",
    );
  const hasArt = new Set(
    score?.events
      .filter((e) =>
        e.notation?.articulation?.some((a) =>
          ["staccato", "tenuto"].includes(a),
        ),
      )
      .map((e) => e.id),
  );
  return {
    ...base,
    version: "2.0.0-performance",
    hasReference: !!score,
    pitchEngine: pitch.status === "fulfilled" ? pitch.value.engine : undefined,
    findings: [
      ...base.findings
        .filter(
          (f) =>
            !(f.kind === "incorrect_duration" && hasArt.has(f.expectedId!)),
        )
        .map((f) => ({ ...f, category: "rhythm" as const })),
      ...findings,
    ].sort((a, b) => a.startSec - b.startSec),
    insights,
    quality: {
      ...base.quality,
      clippedSampleFraction: insights.recording.clippedSampleFraction,
      warnings: [...new Set(warnings)],
    },
  };
}
