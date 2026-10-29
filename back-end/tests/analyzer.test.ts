import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeClip, analyzePitchTrack } from '../src/analyzer.ts';
import { reference, synthesize } from '../src/fixtures.ts';
import { analyzeFixture, trackForNotes } from '../helpers.ts';

test('correct performance with known pitch frames produces no findings', () => {
  assert.deepEqual(analyzeFixture(synthesize(reference), reference, reference).findings, []);
});
test('known frames yield all seven feedback kinds and source timestamps', () => {
  const played = reference.map(n => ({ ...n, amplitude: 0.25 }));
  played[0].startSec += 0.3; played[1].midi += 1; played[2].midi += 0.35;
  played[3].midi -= 0.35; played[4].startSec -= 0.12; played[5].startSec += 0.12; played[6].amplitude = 0.07;
  const result = analyzeFixture(synthesize(played, 5, 10), reference, played);
  for (const kind of ['missed_entrance', 'wrong_note', 'sharp', 'flat', 'early', 'late', 'uneven_dynamics']) {
    assert.ok(result.findings.some(f => f.kind === kind), kind);
  }
  const sharp = result.findings.find(f => f.kind === 'sharp')!;
  assert.ok(Math.abs(sharp.cents! - 35) < 0.01);
  assert.equal(sharp.sourceStartSec, sharp.startSec + 10);
  assert.equal(result.pitchEngine, 'torchcrepe');
});
test('missing notes preserve subsequent alignment', () => {
  const played = reference.filter((_, i) => i !== 0 && i !== 3);
  assert.deepEqual(analyzeFixture(synthesize(played), reference, played).findings.map(f => [f.kind, f.expectedId]),
    [['missed_entrance', 'note-1'], ['missing_note', 'note-4']]);
});
test('extra notes preserve subsequent alignment', () => {
  const played = [...reference, { midi: 66, startSec: 3.42, endSec: 3.58 }];
  assert.deepEqual(analyzeFixture(synthesize(played), reference, played).findings.map(f => f.kind), ['extra_note']);
});
test('relative dynamics tolerate intentional accents and constant gain', () => {
  const expected = reference.map((n, i) => ({ ...n, dynamicsDb: i % 2 ? -8 : 0 }));
  const played = expected.map(n => ({ ...n, amplitude: 0.1 * 10 ** (n.dynamicsDb / 20) }));
  assert.deepEqual(analyzeFixture(synthesize(played), expected, played).findings, []);
});
test('explicit lead-in shifts the expected onsets', () => {
  const played = reference.map(n => ({ ...n, startSec: n.startSec + 0.2, endSec: n.endSec + 0.2 }));
  assert.deepEqual(analyzeFixture(synthesize(played), reference, played, { referenceOffsetSec: 0.2 }).findings, []);
});
test('energy gate suppresses high-confidence CREPE pitches in silence', () => {
  const clip = synthesize([]);
  const track = trackForNotes(clip, [{ midi: 69, startSec: 0, endSec: 5 }], 1);
  assert.equal(analyzePitchTrack(clip, reference, track).detectedNotes.length, 0);
});
test('low-periodicity audible notes are uncertain rather than confirmed missing', () => {
  const clip = synthesize(reference);
  const result = analyzePitchTrack(clip, reference, trackForNotes(clip, reference, 0.1));
  assert.equal(result.findings.length, 0);
  assert.ok(result.quality.warnings.some(w => w.includes('Could not reliably assess')));
});
test('brief unstable attacks do not spoil sustained-note tuning', () => {
  const clip = synthesize(reference), track = trackForNotes(clip, reference);
  for (const n of reference) for (const f of track.frames) {
    if (f.timeSec >= n.startSec && f.timeSec < n.startSec + 0.02 && f.frequencyHz) f.frequencyHz *= 2 ** (0.35 / 12);
  }
  assert.deepEqual(analyzePitchTrack(clip, reference, track).findings, []);
});
test('malformed tracks, invalid reference and nonfinite samples are rejected', async () => {
  const clip = synthesize(reference), track = trackForNotes(clip, reference);
  assert.throws(() => analyzePitchTrack(clip, reference, { ...track, frames: [] }));
  const bad = structuredClone(track); bad.frames[5].timeSec = 0.6;
  assert.throws(() => analyzePitchTrack(clip, reference, bad), /timestamps/);
  assert.throws(() => analyzePitchTrack(clip, [{ ...reference[0], endSec: 8 }], track));
  await assert.rejects(analyzeClip({ ...clip, sampleRate: 22050 }, reference), /Invalid audio/);
  clip.samples[0] = NaN;
  await assert.rejects(analyzeClip(clip, reference), /non-finite/);
});
