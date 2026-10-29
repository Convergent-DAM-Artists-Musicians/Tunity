import { analyzeClip } from './analyzer.ts';
import { extractAudioClip } from './extract.ts';
import type { ExtractOptions } from './extract.ts';
import type { AnalysisOptions, ExpectedNote, CrepeRuntimeOptions } from './types.ts';

export { analyzeClip, analyzePitchTrack, alignNotes } from './analyzer.ts';
export { estimatePitch } from './crepe.ts';
export { extractAudioClip } from './extract.ts';
export type * from './types.ts';
export type { ExtractOptions } from './extract.ts';
export { importSheetMusic } from './score-import.ts';
export { parseMusicXml, referenceForScorePassage } from './score-xml.ts';
export type { ImportedScore, ScoreImportOptions } from './score-xml.ts';
export type { SheetImportOptions, OmrCommand } from './score-import.ts';

export async function analyzeFile(inputPath: string, extraction: ExtractOptions,
  reference: ExpectedNote[], options: AnalysisOptions = {}, runtime: CrepeRuntimeOptions = {}) {
  const clip = await extractAudioClip(inputPath, extraction);
  return analyzeClip(clip, reference, options, runtime);
}
