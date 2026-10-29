import type { AudioClip, ExpectedNote } from '../src/types.ts';

export type SynthNote = { midi: number; startSec: number; endSec: number; amplitude?: number };
export const reference: ExpectedNote[] = [69, 71, 72, 74, 76, 77, 79].map((midi, i) => ({
  id: `note-${i + 1}`, midi, startSec: 0.3 + i * 0.65, endSec: 0.7 + i * 0.65, dynamicsDb: 0,
}));

export function synthesize(notes: SynthNote[], durationSec = 5, sourceStartSec = 0): AudioClip {
  const sampleRate = 16000;
  const samples = new Float32Array(Math.round(durationSec * sampleRate));
  for (const note of notes) {
    const hz = 440 * 2 ** ((note.midi - 69) / 12);
    for (let j = Math.round(note.startSec * sampleRate); j < Math.min(samples.length, Math.round(note.endSec * sampleRate)); j++) {
      const t = j / sampleRate - note.startSec;
      const envelope = Math.min(1, t / 0.008, (note.endSec - j / sampleRate) / 0.008);
      samples[j] += (note.amplitude ?? 0.25) * Math.max(0, envelope)
        * (Math.sin(2 * Math.PI * hz * t) + 0.15 * Math.sin(4 * Math.PI * hz * t));
    }
  }
  return { samples, sampleRate, sourceStartSec };
}

export function examplePerformance(): AudioClip {
  const notes = reference.map(e => ({ ...e, amplitude: 0.25 }));
  notes[0].startSec += 0.3; // Missed/late entrance.
  notes[1].midi += 1; // Wrong note.
  notes[2].midi += 0.35; // Sharp.
  notes[3].midi -= 0.35; // Flat.
  notes[4].startSec -= 0.12; // Early.
  notes[5].startSec += 0.12; // Late.
  notes[6].amplitude = 0.07; // Uneven dynamics.
  return synthesize(notes, 5, 10);
}
