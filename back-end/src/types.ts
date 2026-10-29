export type ExpectedNote = {
  id: string;
  midi: number;
  /** Times relative to the selected clip's start, after referenceOffsetSec. */
  startSec: number;
  endSec: number;
  /** Relative target dB, e.g. all zero for a deliberately even exercise. */
  dynamicsDb?: number;
};

export type AudioClip = {
  samples: Float32Array;
  sampleRate: number;
  sourceStartSec: number;
};

export type DetectedNote = {
  startSec: number;
  endSec: number;
  midi: number;
  frequencyHz: number;
  confidence: number;
  rmsDb: number;
};

export type IssueKind = 'wrong_note' | 'sharp' | 'flat' | 'early' | 'late'
  | 'missed_entrance' | 'missing_note' | 'extra_note' | 'uneven_dynamics';

export type Finding = {
  kind: IssueKind;
  expectedId?: string;
  /** Clip-relative and original-upload timestamps. */
  startSec: number;
  sourceStartSec: number;
  endSec: number;
  confidence: number;
  message: string;
  cents?: number;
  timingErrorMs?: number;
  dynamicsErrorDb?: number;
  expectedMidi?: number;
  detectedMidi?: number;
};

export type AnalysisOptions = {
  tuningHz?: number;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  minConfidence?: number;
  silenceDb?: number;
  minNoteSec?: number;
  pitchToleranceCents?: number;
  timingToleranceMs?: number;
  missedEntranceMs?: number;
  dynamicsToleranceDb?: number;
  /** Explicit recording lead-in/cue offset; never inferred from the performance. */
  referenceOffsetSec?: number;
};

export type Match = { expectedIndex: number; detectedIndex: number };
export type AnalysisResult = {
  version: '0.2.0-crepe';
  pitchEngine: 'torchcrepe';
  durationSec: number;
  detectedNotes: DetectedNote[];
  matches: Match[];
  findings: Finding[];
  quality: {
    voicedConfidenceFraction: number;
    clippedSampleFraction: number;
    warnings: string[];
  };
};

export type PitchFrame = { timeSec: number; frequencyHz: number | null; periodicity: number };
export type PitchTrack = {
  engine: 'torchcrepe';
  model: 'full' | 'tiny';
  hopSec: number;
  frames: PitchFrame[];
};
export type CrepeRuntimeOptions = {
  pythonPath?: string;
  /** Server-owned override, useful for deployment and process-contract tests. */
  workerPath?: string;
  timeoutMs?: number;
  model?: 'full' | 'tiny';
  device?: 'cpu' | `cuda:${number}`;
  batchSize?: number;
  threads?: number;
};
