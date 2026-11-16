import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { extractAudioClip } from '../src/extract.ts';
import { encodeWav, rate } from './timing-fixtures.ts';
import type { ExpectedNote } from '../src/types.ts';

// A separate fixture for the user's one-bar, quarter=60 MuseScore export.
try {
  const inputFolder = resolve(process.argv[2] ?? join(process.env.LOCALAPPDATA ?? '.', 'Temp'));
  const output = resolve(process.argv[3] ?? 'practice/musescore/trumpet-test.wav');
  const imported = JSON.parse(await readFile('reference.musescore-upload.json', 'utf8')) as {
    notes: ExpectedNote[]; durationSec: number;
  };
  const pitches = [72, 74, 76, 72];
  if (imported.durationSec !== 4 || imported.notes.length !== 4 || imported.notes.some((n, i) =>
    n.midi !== pitches[i] || Math.abs(n.startSec - i) > 1e-7 || Math.abs(n.endSec - i - 1) > 1e-7)) {
    throw new Error('This builder requires the verified four-quarter-note, quarter=60 reference (MIDI 72,74,76,72). Reimport the matching MuseScore score first.');
  }
  const choices = [
    ['trumpet_C5_long_forte_normal (1).mp3', 'trumpet_C5_long_forte_normal.mp3'],
    ['trumpet_D5_15_forte_normal.mp3'], ['trumpet_E5_15_forte_normal.mp3'],
  ];
  const paths = await Promise.all(choices.map(async names => {
    for (const name of names) {
      const path = join(inputFolder, name);
      try { await access(path); return path; } catch { /* try alternative name */ }
    }
    throw new Error(`Sample not found: ${names.join(' or ')}`);
  }));
  const sources = await Promise.all(paths.map(path => extractAudioClip(path, {
    startSec: 0.3, endSec: 1.3, sampleRate: rate, ffmpegPath: process.env.FFMPEG_PATH,
  })));
  if (sources.some(s => s.samples.length !== rate)) throw new Error('A sample is too short for the selected one-second section.');
  const samples = new Float32Array(4 * rate);
  [0, 1, 2, 0].forEach((sourceIndex, noteIndex) => {
    const source = sources[sourceIndex].samples;
    source.forEach((value, j) => {
      // Five-millisecond fades remove editing clicks without changing placement.
      const gain = Math.min(1, j / 80, (source.length - 1 - j) / 80);
      samples[noteIndex * rate + j] = value * gain;
    });
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, encodeWav(samples));
  await writeFile(join(dirname(output), 'manifest.json'), JSON.stringify({
    durationSec: 4, sampleRate: rate, channels: 1,
    description: 'Four real trumpet sample segments placed back-to-back at the imported score times. This is constructed audio, not a continuous player recording.',
    sourceFiles: paths, sourceIntervalSec: [0.3, 1.3], edgeFadeSec: 0.005,
    expectedNotes: imported.notes,
  }, null, 2));
  console.log(`Created ${output}`);
  console.log('Sounding C5-D5-E5-C5, starting at 0, 1, 2 and 3 seconds. Total: 4 seconds.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
