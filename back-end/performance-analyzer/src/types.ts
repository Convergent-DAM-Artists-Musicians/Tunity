import type {
  RhythmScore,
  RhythmResult,
} from "../../rhythm-analyzer/src/types.ts";
import type { AnalysisOptions, ExpectedNote } from "../../src/types.ts";
export type Category =
  | "rhythm"
  | "pitch"
  | "articulation"
  | "dynamics"
  | "tempo";
export type PerformanceReference = Partial<RhythmScore> & {
  rhythm?: RhythmScore;
  notes?: ExpectedNote[];
  options?: AnalysisOptions;
  rhythmOptions?: import("../../rhythm-analyzer/src/types.ts").RhythmOptions;
  warnings?: string[];
  requiresReview?: boolean;
};
export type PerformanceFinding = {
  category: Category;
  kind: string;
  expectedId?: string;
  measure?: string;
  beat?: number;
  startSec: number;
  endSec: number;
  message: string;
  confidence: number;
  status: "review" | "likely";
};
export type NoteMeasurement = {
  expectedId: string;
  measure: string;
  beat: number;
  startSec: number;
  endSec: number;
  expectedMidi?: number;
  midi?: number;
  cents?: number;
  driftCents?: number;
  pitchCoverage: number;
  pitchCurve: { timeSec: number; cents: number }[];
  articulationTargets?: string[];
  dynamicsTargetDb?: number;
  hairpinTargets?: string[];
  attackSettlingMs?: number;
  loudnessDb: number;
  durationRatio?: number;
  gapAfterMs?: number;
};
export type PerformanceInsights = {
  categories: {
    id: Category;
    label: string;
    status: "assessed" | "observed" | "unavailable";
    detail: string;
  }[];
  notes: NoteMeasurement[];
  scoreNotes: {
    expectedId: string;
    midi: number;
    startSec: number;
    endSec: number;
  }[];
  loudness: { timeSec: number; db: number }[];
  tempo: {
    measure: string;
    bpm: number;
    targetBpm: number;
    deviationPercent: number;
    intervals: number;
  }[];
  recording: {
    rmsDb: number;
    peakDb: number;
    clippedSampleFraction: number;
    usable: boolean;
  };
  scoreKey?: string;
};
export type PerformanceResult = Omit<RhythmResult, "version" | "findings"> & {
  version: "2.0.0-performance";
  hasReference: boolean;
  pitchEngine?: string;
  findings: PerformanceFinding[];
  insights: PerformanceInsights;
};
