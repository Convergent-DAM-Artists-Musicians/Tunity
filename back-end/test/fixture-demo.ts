import { reference, synthesize } from '../src/fixtures.ts';
import { analyzeFixture } from './helpers.ts';
const notes = reference.map(n => ({ ...n, amplitude: 0.25 }));
notes[0].startSec += 0.3; notes[1].midi += 1; notes[2].midi += 0.35;
notes[3].midi -= 0.35; notes[4].startSec -= 0.12; notes[5].startSec += 0.12; notes[6].amplitude = 0.07;
console.log(JSON.stringify({ fixtureOnly: true, description: 'Synthetic audio and oracle frames; not CREPE inference.',
  result: analyzeFixture(synthesize(notes, 5, 10), reference, notes) }, null, 2));
