import type { AudioClip, ExpectedNote } from '../src/types.ts';
import { median } from '../src/notes.ts';
import { reference, rate, durationSec } from './timing-fixtures.ts';

export type DynamicsExpectation = { expectedId: string; deltaDb: number };

/** Independent raw-waveform calibration for constructed test fixtures only. */
export function stableLevelDb(samples: Float32Array): number {
  const levels: number[] = [];
  for (let start = 480; start + 160 <= samples.length - 320; start += 160) {
    let energy = 0;
    for (let i = start; i < start + 160; i++) energy += samples[i] ** 2;
    levels.push(10 * Math.log10(Math.max(energy / 160, 1e-12)));
  }
  if (!levels.length) throw new Error('Not enough sustained audio to calibrate a note.');
  return median(levels);
}

export function buildDynamicsCases(input: AudioClip) {
  if (input.sampleRate !== rate || input.samples.length !== durationSec * rate
      || input.samples.some(x => !Number.isFinite(x))) throw new Error('Supply the five-second baseline timing clip at 16 kHz.');
  const calibrationDb = -26;
  const normalized = reference.map(n => {
    const segment = input.samples.slice(Math.round(n.startSec * rate), Math.round(n.endSec * rate));
    const level = stableLevelDb(segment);
    if (level < -45) throw new Error(`Source ${n.id} is too quiet for this fixture. Rebuild the timing clips first.`);
    const gain = 10 ** ((calibrationDb - level) / 20);
    return { samples: segment.map(x => x * gain), sourceLevelDb: level, appliedGainDb: calibrationDb - level };
  });
  const configs: { name: string; actualDb: number[]; targetDb: number[]; expected: DynamicsExpectation[] }[] = [
    { name: 'even', actualDb: [0, 0, 0, 0], targetDb: [0, 0, 0, 0], expected: [] },
    { name: 'quieter-note', actualDb: [0, 0, -10, 0], targetDb: [0, 0, 0, 0], expected: [{ expectedId: 'note-3', deltaDb: -10 }] },
    { name: 'louder-note', actualDb: [0, 0, 8, 0], targetDb: [0, 0, 0, 0], expected: [{ expectedId: 'note-3', deltaDb: 8 }] },
    { name: 'intentional-quiet', actualDb: [0, 0, -10, 0], targetDb: [0, 0, -10, 0], expected: [] },
    { name: 'uniform-gain', actualDb: [-6, -6, -6, -6], targetDb: [0, 0, 0, 0], expected: [] },
  ];
  return configs.map(c => {
    const samples = new Float32Array(durationSec * rate);
    normalized.forEach((source, i) => {
      const start = Math.round(reference[i].startSec * rate), gain = 10 ** (c.actualDb[i] / 20);
      source.samples.forEach((x, j) => { samples[start + j] = x * gain; });
    });
    if (samples.some(x => Math.abs(x) >= 0.999)) throw new Error('Fixture would clip. Lower the calibration target.');
    const notes: ExpectedNote[] = reference.map((n, i) => ({ ...n, dynamicsDb: c.targetDb[i] }));
    return { name: c.name, notes, expectedDynamics: c.expected, actualRelativeDb: c.actualDb,
      calibration: normalized.map((n, i) => ({ id: reference[i].id, sourceLevelDb: n.sourceLevelDb, appliedGainDb: n.appliedGainDb })),
      clip: { samples, sampleRate: rate, sourceStartSec: 0 } satisfies AudioClip };
  });
}
