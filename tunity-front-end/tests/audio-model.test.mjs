import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  validateAudioInfo,
  verifyAudioHeader,
  prepareAudio,
} from "../lib/audio-model.ts";

test("normalizes audio types from extension and trims recording titles", () => {
  const info = validateAudioInfo(
    { name: "take.MP3", size: 100 },
    "  Warm-up  ",
  );
  assert.equal(info.contentType, "audio/mpeg");
  assert.equal(info.title, "Warm-up");
  assert.equal(
    validateAudioInfo({ name: "tone.wav", size: 100 }, "").title,
    "tone",
  );
});
test("accepts the exact small-file allowance and rejects empty, oversized and invalid sizes", () => {
  assert.equal(
    validateAudioInfo({ name: "take.mp3", size: MAX_AUDIO_BYTES }, "").size,
    512000,
  );
  for (const size of [0, -1, MAX_AUDIO_BYTES + 1, NaN, Infinity, 1.5])
    assert.throws(() => validateAudioInfo({ name: "take.mp3", size }, ""));
});
test("rejects unsupported filenames and overlong labels", () => {
  for (const name of [
    "payload.html",
    "file.exe",
    "audio",
    "x".repeat(181) + ".mp3",
  ])
    assert.throws(() => validateAudioInfo({ name, size: 100 }, ""));
  assert.throws(() =>
    validateAudioInfo({ name: "tone.wav", size: 100 }, "x".repeat(101)),
  );
});
test("rejects text renamed as audio", () => {
  const data = new TextEncoder().encode(
    "<html>This is not an audio file</html>",
  );
  for (const type of AUDIO_TYPES)
    assert.throws(() => verifyAudioHeader(type, data));
});
test("recognizes WAV, MP3, M4A, AAC, FLAC, OGG, and WebM headers", () => {
  for (const [type, bytes] of [
    ["audio/wav", new TextEncoder().encode("RIFF0000WAVEfmt ")],
    ["audio/mpeg", new TextEncoder().encode("ID3\0\0\0")],
    ["audio/mp4", new TextEncoder().encode("0000ftypM4A ")],
    ["audio/aac", new Uint8Array([255, 241, 0, 0])],
    ["audio/flac", new TextEncoder().encode("fLaC")],
    ["audio/ogg", new TextEncoder().encode("OggS")],
    ["audio/webm", new Uint8Array([26, 69, 223, 163])],
  ])
    assert.doesNotThrow(() => verifyAudioHeader(type, bytes));
});
test("prepares the actual binary audio with the same size used for quota checks", async () => {
  const file = new File(["RIFF0000WAVEfmt "], "tone.wav", {
    type: "audio/wav",
  });
  const prepared = await prepareAudio(file, "Tone");
  assert.equal(prepared.bytes.length, file.size);
  assert.equal(prepared.info.title, "Tone");
  await assert.rejects(
    prepareAudio(new File(["not audio"], "bad.wav")),
    /does not match/,
  );
});
