import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAudioClip } from '../src/extract.ts';
import { synthesize } from '../src/fixtures.ts';

test('extraction rejects invalid intervals and sample rates before spawning', async () => {
  await assert.rejects(extractAudioClip('unused.wav', { startSec: -1, endSec: 2 }));
  await assert.rejects(extractAudioClip('unused.wav', { startSec: 2, endSec: 1 }));
  await assert.rejects(extractAudioClip('unused.wav', { startSec: 0, endSec: 121 }));
  await assert.rejects(extractAudioClip('unused.wav', { startSec: 0, endSec: 1, sampleRate: 1 }));
});

test('missing FFmpeg executable produces a useful failure', async () => {
  await assert.rejects(extractAudioClip('unused.wav', {
    startSec: 0, endSec: 1, ffmpegPath: join(tmpdir(), 'nonexistent-music-analyzer-ffmpeg.exe'),
  }), /ENOENT/);
});

test('FFmpeg nonzero exit is surfaced', async () => {
  await assert.rejects(extractAudioClip('unused.wav', {
    startSec: 0, endSec: 1, ffmpegPath: process.execPath,
  }), /FFmpeg failed/);
});

const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffmpegAvailable = spawnSync(ffmpegPath, ['-version'], { windowsHide: true }).status === 0;

test('real FFmpeg seeks, decodes, and preserves source timestamps', {
  skip: ffmpegAvailable ? false : 'Install FFmpeg or set FFMPEG_PATH to run the decoding integration test.',
}, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'music-analyzer-'));
  try {
    const audio = synthesize([
      { midi: 69, startSec: 0, endSec: 0.5 },
      { midi: 72, startSec: 0.5, endSec: 1 },
    ], 1);
    const wav = Buffer.alloc(44 + audio.samples.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(audio.sampleRate, 24); wav.writeUInt32LE(audio.sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
    wav.writeUInt32LE(audio.samples.length * 2, 40);
    audio.samples.forEach((value, i) => wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2));
    const path = join(folder, 'two notes.wav');
    await writeFile(path, wav);
    const clip = await extractAudioClip(path, { startSec: 0.6, endSec: 0.9, ffmpegPath });
    assert.equal(clip.sourceStartSec, 0.6);
    assert.ok(Math.abs(clip.samples.length / clip.sampleRate - 0.3) < 0.01);
    let crossings = 0;
    for (let i = 1; i < clip.samples.length; i++) {
      if (clip.samples[i - 1] <= 0 && clip.samples[i] > 0) crossings++;
    }
    const hz = crossings / (clip.samples.length / clip.sampleRate);
    assert.ok(Math.abs(hz - 523.25) < 10);
    await assert.rejects(extractAudioClip(path, { startSec: 2, endSec: 3, ffmpegPath }), /No valid audio/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
