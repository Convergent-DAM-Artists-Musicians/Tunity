import type { AudioClip, ExpectedNote } from '../src/types.ts';

export const durationSec = 5;
export const rate = 16000;
export const reference: ExpectedNote[] = [72, 74, 76, 72].map((midi, i) => ({
  id: `note-${i + 1}`, midi, startSec: 0.5 + i, endSec: 0.9 + i,
}));
export const timingKinds = new Set(['early', 'late', 'missing_note', 'missed_entrance', 'extra_note']);

/** Pitch is supplied by real recordings; only placement/omissions are synthesized. */
export function buildTimingCases(sources: Float32Array[]) {
  if (sources.length !== 3 || sources.some(s => s.length !== 6400 || s.some(v => !Number.isFinite(v)))) {
    throw new Error('Supply three finite 0.4-second mono 16 kHz recordings.');
  }
  const configurations = [
    { name: 'correct', shiftIndex: -1, shift: 0, omit: -1, expected: [] },
    { name: 'early', shiftIndex: 2, shift: -0.15, omit: -1, expected: ['early:note-3'] },
    { name: 'late', shiftIndex: 2, shift: 0.15, omit: -1, expected: ['late:note-3'] },
    { name: 'missing-note', shiftIndex: -1, shift: 0, omit: 2, expected: ['missing_note:note-3'] },
    { name: 'late-entrance', shiftIndex: 0, shift: 0.32, omit: -1, expected: ['missed_entrance:note-1'] },
    { name: 'missing-entrance', shiftIndex: -1, shift: 0, omit: 0, expected: ['missed_entrance:note-1'] },
  ];
  return configurations.map(c => {
    const samples = new Float32Array(durationSec * rate);
    const playedNotes: ExpectedNote[] = [];
    reference.forEach((n, i) => {
      if (i === c.omit) return;
      const shift = i === c.shiftIndex ? c.shift : 0;
      const actual = { ...n, startSec: n.startSec + shift, endSec: n.endSec + shift };
      playedNotes.push(actual);
      const source = sources[[0, 1, 2, 0][i]];
      const start = Math.round(actual.startSec * rate);
      for (let j = 0; j < source.length; j++) {
        // Five-millisecond fades prevent edit clicks; the timing check allows this small attack.
        const envelope = Math.min(1, j / 80, (source.length - 1 - j) / 80);
        samples[start + j] += source[j] * envelope;
      }
    });
    return { name: c.name, expectedTimingFindings: c.expected,
      playedNotes, clip: { samples, sampleRate: rate, sourceStartSec: 0 } satisfies AudioClip };
  });
}

export function encodeWav(samples: Float32Array): Buffer {
  if (samples.some(x => !Number.isFinite(x) || Math.abs(x) > 1)) throw new Error('Cannot encode invalid or clipped fixture samples.');
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => wav.writeInt16LE(Math.round(x * 32767), 44 + i * 2));
  return wav;
}
