import type { EvidenceRef } from "./analysis";
import type { BreathCandidate, CompactScore } from "./score";

export type CoachTarget = { title: string; category: string; observation: string; practice: string; evidence: EvidenceRef[] };
export type CoachResult = { summary: string; reliability: string; encouragement: string; targets: CoachTarget[]; createdAt: string };
export type TakeMessage = { role: "user" | "assistant"; content: string; evidence?: EvidenceRef[] };

export type ComparisonRef = EvidenceRef & { side: "before" | "after" };
export type ComparisonNarrative = {
  headline: string;
  improvements: { text: string; evidence: ComparisonRef[] }[];
  remaining: { text: string; evidence: ComparisonRef[] }[];
  nextFocus: string;
};

export type StudyGuide = {
  overview: string;
  passages: { startMeasure: string; endMeasure: string; title: string; why: string; practice: string }[];
  breaths: (BreathCandidate & { advice: string })[];
  startingTempo: { bpm: number; why: string };
  tempoSteps: number[];
  warmUps: { title: string; minutes: number; instructions: string }[];
  checklist: string[];
  facts: {
    title: string; partName: string; tempoBpm: number; meter: string; measureCount: number; durationSec: number;
    concertRange?: { low: string; high: string };
    longestStretch: { seconds: number; fromMeasure?: string; toMeasure?: string };
  };
  reference: CompactScore;
  createdAt: string;
};

export type EtudeResult = {
  title: string; description: string; focus: string; tips: string[]; instrument: string; keyName: string;
  meter: string; tempoBpm: number; measures: number; xml: string; reference: CompactScore;
};

export type PracticePiece = {
  id: string;
  uid: string;
  title: string;
  createdAt: string;
  source: "etude" | "score";
  collection: string;
  fileName: string;
  file: Blob;
  /** MusicXML text when available, for notation display. */
  xml?: string;
  reference: CompactScore;
  instrument?: string;
  keyName?: string;
  meter?: string;
  tempoBpm?: number;
  focus?: string;
  description?: string;
  tips?: string[];
  prompt?: string;
  study?: StudyGuide;
  trashed?: boolean;
};

/** A score the student is preparing to record. */
export type StudySource = { file: File; title: string; pieceId?: string };
