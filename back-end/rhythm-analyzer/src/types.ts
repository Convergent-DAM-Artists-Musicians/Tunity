import type { DetectedNote, Finding } from "../../src/types.ts";

/** Quarter-note units, independent of meter's denominator. */
export type RhythmEvent = {
  id: string;
  kind: "note" | "rest";
  startBeat: number;
  durationBeats: number;
  measure: string;
  /** One-based beat in the notated meter (e.g. eighth-note beats in 6/8). */
  beat: number;
  midi?: number;
  /** Optional relative loudness target, not an absolute dynamic-mark mapping. */
  dynamicsDb?: number;
  notation?: {
    type?: string;
    dots?: number;
    actualNotes?: number;
    normalNotes?: number;
    slur?: boolean;
    /** This note connects to the following note under a slur. */
    slurToNext?: boolean;
    articulation?: string[];
  };
  /** All notated note IDs in a tie; one acoustic attack is expected. */
  tiedIds?: string[];
};
export type RhythmScore = {
  /** Reviewed hairpin spans in quarter-note beats. */
  hairpins?: { startBeat: number; endBeat: number; kind: "crescendo" | "diminuendo" }[];
  notationSource?: "score" | "timed_reference";
  events: RhythmEvent[];
  tempoMap: { beat: number; bpm: number }[];
  meterMap: { beat: number; numerator: number; denominator: number }[];
};
export type RhythmNote = DetectedNote & {
  boundary: "attack" | "pitch_transition";
  boundaryUncertaintyMs: number;
  offsetConfidence: number;
};
export type RhythmDetection = {
  engine: "spectral-yin-v1";
  hopSec: number;
  notes: RhythmNote[];
  silenceThresholdDb: number;
  warnings: string[];
};
export type RhythmOptions = {
  /** Automatic mode cannot judge absolute entrance lateness without a cue. */
  alignmentMode?: "automatic" | "fixed";
  referenceOffsetSec?: number;
  tempoScale?: number;
  timingToleranceMs?: number;
  durationToleranceMs?: number;
  /** Robust local tempo adaptation; one anchor uses several notes. */
  expressiveTiming?: boolean;
};
export type RhythmMatch = {
  rhythmLabel: string;
  labelSource: "notation" | "score_duration" | "unavailable";
  expectedIndex: number;
  detectedIndex: number;
  expectedId: string;
  measure: string;
  beat: number;
  startBeat: number;
  durationBeats: number;
  targetStartSec: number;
  targetEndSec: number;
  timingErrorMs: number;
  soundingDurationErrorMs: number;
  confidence: number;
  notation?: RhythmEvent["notation"];
  tiedIds?: string[];
};
export type RhythmResult = {
  version: "1.0.0-rhythm";
  rhythmEngine: "spectral-yin-v1";
  durationSec: number;
  detectedNotes: RhythmNote[];
  matches: RhythmMatch[];
  rhythmEvents: {
    expectedId: string;
    kind: "note" | "rest";
    measure: string;
    beat: number;
    rhythmLabel: string;
    labelSource: "notation" | "score_duration" | "unavailable";
    targetStartSec: number;
    targetEndSec: number;
    detectedIndex?: number;
    actualStartSec?: number;
    actualEndSec?: number;
    timingErrorMs?: number;
  }[];
  rhythmGroups: import("./notation.ts").TupletAssessment[];
  findings: (Finding & {
    measure?: string;
    beat?: number;
    durationErrorMs?: number;
    status: "review" | "likely";
  })[];
  alignment: {
    mode: "automatic" | "fixed";
    offsetSec: number;
    tempoScale: number;
    confidence: number;
    ambiguous: boolean;
    anchors: { scoreSec: number; performanceSec: number }[];
    missingIds: string[];
    extraIndices: number[];
  };
  /** Score rests mapped into recording time, useful to other analysis features. */
  rests: {
    expectedId: string;
    measure: string;
    beat: number;
    startSec: number;
    endSec: number;
    soundingOverlapSec: number;
  }[];
  quality: {
    warnings: string[];
    clippedSampleFraction: number;
    voicedConfidenceFraction: number;
  };
};
