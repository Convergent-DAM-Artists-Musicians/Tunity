import type { AnalysisOptions, AnalysisResult, AudioClip, DetectedNote, ExpectedNote, Finding, Match, PitchTrack, CrepeRuntimeOptions } from './types.ts';
import { defaults, median, segmentNotes } from './notes.ts';
import { estimatePitch, validatePitchTrack } from './pitch/crepe.ts';
export { median } from './notes.ts';

/** Global sequence edit alignment: skips and extras cannot shift all subsequent notes. */
export function alignNotes(expected: ExpectedNote[], detected: DetectedNote[], offsetSec = 0): {
  matches: Match[]; missing: number[]; extra: number[];
} {
  const rows = expected.length + 1, cols = detected.length + 1;
  const costs = new Float64Array(rows * cols);
  const steps = new Uint8Array(rows * cols); // 0 match, 1 missing, 2 extra
  for (let i = 1; i < rows; i++) { costs[i * cols] = i; steps[i * cols] = 1; }
  for (let j = 1; j < cols; j++) { costs[j] = j; steps[j] = 2; }
  for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) {
    const e = expected[i - 1], d = detected[j - 1];
    const timeError = Math.abs(d.startSec - (e.startSec + offsetSec));
    const pitchError = Math.abs(d.midi - e.midi);
    // Time prevents pairing a distant repeated note with a missing entrance.
    const matchCost = timeError > 0.8 ? 3 : Math.min(pitchError / 2, 1) + timeError;
    const choices = [costs[(i - 1) * cols + j - 1] + matchCost,
      costs[(i - 1) * cols + j] + 1, costs[i * cols + j - 1] + 1];
    const step = choices.indexOf(Math.min(...choices));
    costs[i * cols + j] = choices[step]; steps[i * cols + j] = step;
  }
  const matches: Match[] = [], missing: number[] = [], extra: number[] = [];
  let i = expected.length, j = detected.length;
  while (i || j) {
    const step = steps[i * cols + j];
    if (step === 0) { matches.push({ expectedIndex: --i, detectedIndex: --j }); }
    else if (step === 1) missing.push(--i);
    else extra.push(--j);
  }
  return { matches: matches.reverse(), missing: missing.reverse(), extra: extra.reverse() };
}

function validate(clip: AudioClip, expected: ExpectedNote[], o: typeof defaults): void {
  if (clip.sampleRate !== 16000
      || !clip.samples.length || clip.samples.length / clip.sampleRate > 120
      || !Number.isFinite(clip.sourceStartSec) || clip.sourceStartSec < 0) throw new Error('Invalid audio clip.');
  if (clip.samples.some(x => !Number.isFinite(x))) throw new Error('Audio contains non-finite samples.');
  for (const [key, value] of Object.entries(o)) {
    if (!Number.isFinite(value)) throw new Error(`Invalid option: ${key}`);
  }
  if (o.minFrequencyHz < 50 || o.maxFrequencyHz > 2006 || o.maxFrequencyHz <= o.minFrequencyHz
      || o.maxFrequencyHz >= clip.sampleRate / 2 || o.tuningHz <= 0
      || o.minConfidence < 0 || o.minConfidence > 1 || o.minNoteSec <= 0
      || o.pitchToleranceCents < 0 || o.pitchToleranceCents >= 50
      || o.timingToleranceMs < 0 || o.missedEntranceMs < o.timingToleranceMs
      || o.dynamicsToleranceDb <= 0) throw new Error('Analysis options are out of range.');
  if (!expected.length || expected.length > 2000) throw new Error('Provide 1–2000 expected notes.');
  const ids = new Set<string>();
  expected.forEach((e, i) => {
    if (!e.id || ids.has(e.id) || !Number.isInteger(e.midi) || e.midi < 0 || e.midi > 127
        || !Number.isFinite(e.startSec) || !Number.isFinite(e.endSec) || e.startSec < 0
        || e.endSec <= e.startSec || (i > 0 && e.startSec < expected[i - 1].endSec)
        || e.startSec + o.referenceOffsetSec < 0
        || e.endSec + o.referenceOffsetSec > clip.samples.length / clip.sampleRate + 0.02
        || (e.dynamicsDb !== undefined && !Number.isFinite(e.dynamicsDb))) {
      throw new Error('Reference must have unique IDs, valid pitches, non-overlapping ordered notes, and fit within the clip.');
    }
    ids.add(e.id);
  });
}

export function analyzePitchTrack(clip: AudioClip, expected: ExpectedNote[], track: PitchTrack, options: AnalysisOptions = {}): AnalysisResult {
  const o = { ...defaults, ...options };
  validate(clip, expected, o);
  validatePitchTrack(track, clip);
  const detection = segmentNotes(clip, track, o);
  const detected = detection.notes;
  const aligned = alignNotes(expected, detected, o.referenceOffsetSec);
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const add = (kind: Finding['kind'], e: ExpectedNote | undefined, d: DetectedNote | undefined,
    message: string, values: Partial<Finding> = {}) => {
    const startSec = d?.startSec ?? e!.startSec + o.referenceOffsetSec;
    findings.push({ kind, expectedId: e?.id, startSec, sourceStartSec: clip.sourceStartSec + startSec,
      endSec: d?.endSec ?? e!.endSec + o.referenceOffsetSec,
      confidence: d?.confidence ?? 0, message, ...values });
  };
  for (const m of aligned.matches) {
    const e = expected[m.expectedIndex], d = detected[m.detectedIndex];
    const cents = 100 * (d.midi - e.midi);
    if (Math.round(d.midi) !== e.midi) {
      add('wrong_note', e, d, `Expected MIDI ${e.midi}; detected MIDI ${Math.round(d.midi)}.`,
        { expectedMidi: e.midi, detectedMidi: d.midi, cents });
    } else if (Math.abs(cents) > o.pitchToleranceCents) {
      const kind = cents > 0 ? 'sharp' : 'flat';
      add(kind, e, d, `Note is ${Math.round(Math.abs(cents))} cents ${kind}.`, { cents });
    }
    const timingErrorMs = 1000 * (d.startSec - e.startSec - o.referenceOffsetSec);
    if (m.expectedIndex === 0 && timingErrorMs > o.missedEntranceMs) {
      add('missed_entrance', e, d, `Entrance is ${Math.round(timingErrorMs)} ms late.`, { timingErrorMs });
    } else if (Math.abs(timingErrorMs) > o.timingToleranceMs) {
      const kind = timingErrorMs > 0 ? 'late' : 'early';
      add(kind, e, d, `Note starts ${Math.round(Math.abs(timingErrorMs))} ms ${kind}.`, { timingErrorMs });
    }
  }
  for (const i of aligned.missing) {
    const e = expected[i];
    const start = Math.floor((e.startSec + o.referenceOffsetSec) * clip.sampleRate);
    const end = Math.min(clip.samples.length, Math.ceil((e.endSec + o.referenceOffsetSec) * clip.sampleRate));
    let energy = 0;
    for (let j = start; j < end; j++) energy += clip.samples[j] ** 2;
    const db = 10 * Math.log10(Math.max(energy / Math.max(1, end - start), 1e-12));
    const overlaps = detected.some(d => d.startSec < end / clip.sampleRate && d.endSec > start / clip.sampleRate);
    // Sound without a reliable note is not evidence of an omitted note.
    if (db > o.silenceDb && !overlaps) {
      warnings.push(`Could not reliably assess ${e.id}: audible audio without a confident note.`);
      continue;
    }
    add(i === 0 ? 'missed_entrance' : 'missing_note', e, undefined,
      i === 0 ? 'No matching entrance was detected; review this passage.' : 'No matching note was detected; review this passage.');
  }
  for (const j of aligned.extra) add('extra_note', undefined, detected[j], 'An additional note was detected.');
  const dynamics = aligned.matches.filter(m => expected[m.expectedIndex].dynamicsDb !== undefined);
  if (dynamics.length >= 3) {
    const residuals = dynamics.map(m => detected[m.detectedIndex].rmsDb - expected[m.expectedIndex].dynamicsDb!);
    const baseline = median(residuals);
    dynamics.forEach((m, i) => {
      const delta = residuals[i] - baseline;
      if (Math.abs(delta) > o.dynamicsToleranceDb) {
        add('uneven_dynamics', expected[m.expectedIndex], detected[m.detectedIndex],
          `Note is ${Math.abs(delta).toFixed(1)} dB ${delta > 0 ? 'louder' : 'quieter'} than the relative target.`,
          { dynamicsErrorDb: delta });
      }
    });
  } else warnings.push('Dynamics not assessed: at least three matched notes need explicit dynamicsDb targets.');
  const clippedSampleFraction = clip.samples.reduce((n, x) => n + (Math.abs(x) >= 0.999 ? 1 : 0), 0) / clip.samples.length;
  if (clippedSampleFraction > 0.001) warnings.push('Recording may be clipped; pitch and dynamics feedback may be unreliable.');
  if (detection.voicedConfidenceFraction < 0.7) warnings.push('Low pitch confidence: use an isolated single-note melody and review uncertain passages.');
  return { version: '0.2.0-crepe', pitchEngine: 'torchcrepe', durationSec: clip.samples.length / clip.sampleRate,
    detectedNotes: detected, matches: aligned.matches,
    findings: findings.sort((a, b) => a.startSec - b.startSec),
    quality: { voicedConfidenceFraction: detection.voicedConfidenceFraction, clippedSampleFraction, warnings } };
}

/** Async: invoke the real local CREPE model, then apply deterministic scoring. */
export async function analyzeClip(clip: AudioClip, expected: ExpectedNote[], options: AnalysisOptions = {}, runtime: CrepeRuntimeOptions = {}): Promise<AnalysisResult> {
  validate(clip, expected, { ...defaults, ...options });
  const track = await estimatePitch(clip, options, runtime);
  return analyzePitchTrack(clip, expected, track, options);
}
