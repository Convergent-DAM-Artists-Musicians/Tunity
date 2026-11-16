import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesize } from '../src/fixtures.ts';
import { buildTimingCases, encodeWav, reference, timingKinds } from '../scripts/timing-fixtures.ts';
import { analyzeFixture } from './helpers.ts';

test('constructed timing scenarios have the expected outcomes with oracle pitch frames', () => {
  const sources = [72, 74, 76].map(midi => synthesize([{ midi, startSec: 0, endSec: 0.4 }], 0.4).samples);
  for (const c of buildTimingCases(sources)) {
    const result = analyzeFixture(c.clip, reference, c.playedNotes);
    const actual = result.findings.filter(f => timingKinds.has(f.kind)).map(f => `${f.kind}:${f.expectedId ?? 'extra'}`).sort();
    assert.deepEqual(actual, [...c.expectedTimingFindings].sort(), c.name);
    const wav = encodeWav(c.clip.samples);
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt32LE(40), 5 * 16000 * 2);
  }
});

test('builder rejects incomplete source clips rather than padding the test silently', () => {
  assert.throws(() => buildTimingCases([new Float32Array(1), new Float32Array(6400), new Float32Array(6400)]));
});
