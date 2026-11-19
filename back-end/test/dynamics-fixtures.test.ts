import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesize } from '../src/fixtures.ts';
import { buildTimingCases, reference } from '../scripts/timing-fixtures.ts';
import { buildDynamicsCases, stableLevelDb } from '../scripts/dynamics-fixtures.ts';
import { analyzeFixture } from './helpers.ts';

const sources = [72, 74, 76].map((midi, i) => synthesize([{ midi, startSec: 0, endSec: 0.4, amplitude: [0.1, 0.25, 0.15][i] }], 0.4).samples);
const baseline = buildTimingCases(sources)[0].clip;

test('five controlled dynamics cases produce the expected flags and dB measurements with oracle frames', () => {
  for (const c of buildDynamicsCases(baseline)) {
    const result = analyzeFixture(c.clip, c.notes, reference);
    const dynamics = result.findings.filter(f => f.kind === 'uneven_dynamics');
    assert.deepEqual(dynamics.map(f => f.expectedId).sort(), c.expectedDynamics.map(e => e.expectedId).sort(), c.name);
    for (const e of c.expectedDynamics) assert.ok(Math.abs(dynamics.find(f => f.expectedId === e.expectedId)!.dynamicsErrorDb! - e.deltaDb) < 0.2, c.name);
    assert.equal(result.matches.length, 4);
    assert.equal(result.quality.clippedSampleFraction, 0);
    assert.ok(!result.quality.warnings.some(w => w.startsWith('Dynamics not assessed')));
  }
});

test('the identical quieter recording is judged differently when its reference intends the change', () => {
  const cases = buildDynamicsCases(baseline);
  const quiet = cases.find(c => c.name === 'quieter-note')!;
  const intentional = cases.find(c => c.name === 'intentional-quiet')!;
  assert.deepEqual(quiet.clip.samples, intentional.clip.samples);
  assert.ok(analyzeFixture(quiet.clip, quiet.notes, reference).findings.some(f => f.kind === 'uneven_dynamics'));
  assert.ok(!analyzeFixture(intentional.clip, intentional.notes, reference).findings.some(f => f.kind === 'uneven_dynamics'));
});

test('calibrated baseline has equal stable levels despite unequal source recordings', () => {
  const even = buildDynamicsCases(baseline)[0];
  for (const n of reference) {
    const segment = even.clip.samples.slice(Math.round(n.startSec * 16000), Math.round(n.endSec * 16000));
    assert.ok(Math.abs(stableLevelDb(segment) + 26) < 0.01);
  }
  assert.throws(() => buildDynamicsCases({ ...baseline, samples: new Float32Array(80000) }), /too quiet/);
});
