import { analyzePitchTrack } from '../src/analyzer.ts';
import type { SynthNote } from '../src/fixtures.ts';
import type { AnalysisOptions, AudioClip, ExpectedNote, PitchTrack } from '../src/types.ts';
/** Oracle frames for postprocessing tests only. This is NOT audio inference. */
export function trackForNotes(clip: AudioClip, played: SynthNote[], periodicity = 0.95): PitchTrack {
  return { engine: 'torchcrepe', model: 'full', hopSec: 0.01,
    frames: Array.from({ length: Math.ceil(clip.samples.length / clip.sampleRate / 0.01) }, (_, i) => {
      const timeSec = i * 0.01;
      const note = played.find(n => timeSec + 0.005 >= n.startSec - 1e-8 && timeSec + 0.005 < n.endSec - 1e-8);
      return { timeSec, frequencyHz: note ? 440 * 2 ** ((note.midi - 69) / 12) : null, periodicity: note ? periodicity : 0 };
    }) };
}
export function analyzeFixture(clip: AudioClip, expected: ExpectedNote[], played: SynthNote[], options: AnalysisOptions = {}) {
  return analyzePitchTrack(clip, expected, trackForNotes(clip, played), options);
}
