import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { estimatePitch } from '../src/crepe.ts';
import { analyzeClip } from '../src/analyzer.ts';
import { synthesize } from '../src/fixtures.ts';
const runtime = { pythonPath: process.execPath, workerPath: fileURLToPath(new URL('./fixtures/fake-crepe.ts', import.meta.url)) };
const expected = [{ id: 'a4', midi: 69, startSec: 0.1, endSec: 0.5 }];
test('async analyzer invokes the PCM/JSON worker contract', async () => {
  const result = await analyzeClip(synthesize(expected, 0.8), expected, {}, runtime);
  assert.equal(result.detectedNotes.length, 1); assert.deepEqual(result.findings, []);
});
test('worker errors, timeout and malformed output are surfaced', async () => {
  const clip = synthesize(expected, 0.8);
  try {
    process.env.FAKE_CREPE_MODE = 'fail';
    await assert.rejects(estimatePitch(clip, {}, runtime), /fixture inference failure/);
    process.env.FAKE_CREPE_MODE = 'bad';
    await assert.rejects(estimatePitch(clip, {}, runtime), /invalid frame/);
    process.env.FAKE_CREPE_MODE = 'wait';
    await assert.rejects(estimatePitch(clip, {}, { ...runtime, timeoutMs: 100 }), /timed out/);
  } finally { delete process.env.FAKE_CREPE_MODE; }
});
test('invalid frequencies, sample rates and runtime options fail before inference', async () => {
  const clip = synthesize(expected, 0.8);
  await assert.rejects(estimatePitch(clip, { maxFrequencyHz: 2500 }, runtime), /Invalid CREPE/);
  await assert.rejects(estimatePitch({ ...clip, sampleRate: 22050 }, {}, runtime), /16 kHz/);
  await assert.rejects(estimatePitch(clip, {}, { ...runtime, batchSize: 0 }), /Invalid CREPE/);
});
test('real CREPE estimates a generated A4', {
  skip: process.env.RUN_CREPE_INTEGRATION === '1' ? false : 'Set RUN_CREPE_INTEGRATION=1 after installing Python dependencies.',
}, async () => {
  const result = await analyzeClip(synthesize(expected, 0.8), expected);
  assert.equal(result.detectedNotes.length, 1);
  assert.ok(Math.abs(result.detectedNotes[0].midi - 69) < 0.15);
  assert.ok(!result.findings.some(f => ['wrong_note', 'sharp', 'flat'].includes(f.kind)));
});
