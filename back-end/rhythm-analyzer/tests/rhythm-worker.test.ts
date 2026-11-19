import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { detectRhythm } from "../src/index.ts";
const runtime = {
  pythonPath: process.execPath,
  workerPath: fileURLToPath(
    new URL("./fixtures/fake-rhythm.ts", import.meta.url),
  ),
};
const clip = (value: number) => ({
  samples: Float32Array.of(value, 0),
  sampleRate: 16000,
  sourceStartSec: 0,
});
test("rhythm worker handles valid output and rejects malformed output", async () => {
  assert.deepEqual((await detectRhythm(clip(0), runtime)).notes, []);
  await assert.rejects(detectRhythm(clip(1), runtime), /Invalid rhythm worker/);
});
test("rhythm worker terminates timed-out processes", async () => {
  await assert.rejects(
    detectRhythm(clip(0.5), { ...runtime, timeoutMs: 200 }),
    /timed out/,
  );
});
test("rhythm validates audio before launching a worker", async () => {
  await assert.rejects(detectRhythm(clip(NaN), runtime), /finite mono/);
  await assert.rejects(
    detectRhythm({ ...clip(0), sampleRate: 44100 }, runtime),
    /16 kHz/,
  );
});
