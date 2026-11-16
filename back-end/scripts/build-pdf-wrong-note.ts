import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extractAudioClip } from '../src/extract.ts';
import { encodeWav, rate } from './timing-fixtures.ts';

// Construct a deliberate error without changing the score or original recording.
try {
  const reference = JSON.parse(await readFile('reference.pdf-reviewed.json', 'utf8'));
  if (reference.durationSec !== 4 || reference.notes.length !== 4 ||
      reference.notes.some((n: { midi: number; startSec: number; endSec: number }, i: number) =>
        n.midi !== [72, 74, 76, 72][i] || n.startSec !== i || n.endSec !== i + 1)) {
    throw new Error('Expected the reviewed four-second C5-D5-E5-C5 score.');
  }
  const input = 'practice/musescore/trumpet-test.wav';
  const output = 'practice/musescore/trumpet-test-wrong-note.wav';
  const original = await extractAudioClip(input, {
    startSec: 0, endSec: 4, sampleRate: rate, ffmpegPath: process.env.FFMPEG_PATH,
  });
  if (original.samples.length !== 4 * rate) throw new Error('Expected exactly four seconds.');
  const shifted = spawnSync(process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input,
    '-af', `atrim=start=2:end=3,asetpts=PTS-STARTPTS,rubberband=pitch=${2 ** (2 / 12)},apad,atrim=duration=1`,
    '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1',
  ], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  if (shifted.error) throw shifted.error;
  if (shifted.status !== 0) throw new Error(shifted.stderr.toString());
  if (shifted.stdout.length !== rate * 4) throw new Error('Expected one second of shifted audio.');
  for (let i = 0; i < rate; i++) {
    const fade = Math.min(1, i / 80, (rate - 1 - i) / 80);
    original.samples[2 * rate + i] = shifted.stdout.readFloatLE(i * 4) * fade;
  }
  await writeFile(output, encodeWav(original.samples));
  await writeFile('practice/musescore/wrong-note-manifest.json', JSON.stringify({
    input, output, reference: 'reference.pdf-reviewed.json', durationSec: 4,
    change: 'Only the third note (2–3 seconds) is shifted up two semitones: sounding E5 to F#5.',
    expectedFinding: { kind: 'wrong_note', expectedId: reference.notes[2].id,
      expectedMidi: 76, detectedMidiApprox: 78 },
    description: 'Constructed test audio using trumpet samples; not a continuous player recording.',
  }, null, 2));
  console.log(`Created ${output}. Expected: wrong_note on ${reference.notes[2].id}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
