import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { extractAudioClip } from '../src/extract.ts';
import { buildDynamicsCases } from './dynamics-fixtures.ts';
import { durationSec, encodeWav } from './timing-fixtures.ts';

try {
  const input = resolve(process.argv[2] ?? 'practice/timing/correct.wav');
  const output = resolve(process.argv[3] ?? 'practice/dynamics');
  const clip = await extractAudioClip(input, { startSec: 0, endSec: durationSec, sampleRate: 16000, ffmpegPath: process.env.FFMPEG_PATH });
  const cases = buildDynamicsCases(clip);
  await mkdir(output, { recursive: true });
  for (const c of cases) {
    await writeFile(join(output, `${c.name}.wav`), encodeWav(c.clip.samples));
    await writeFile(join(output, `${c.name}.reference.json`), JSON.stringify({ notes: c.notes }, null, 2));
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ durationSec, sourceFile: input,
    description: 'Constructed relative-level tests. Raw waveform levels are calibrated for fixture preparation, not in the production analyzer.',
    cases: cases.map(c => ({ name: c.name, audioFile: `${c.name}.wav`, referenceFile: `${c.name}.reference.json`,
      expectedNoteCount: c.notes.length, expectedDynamics: c.expectedDynamics,
      actualRelativeDb: c.actualRelativeDb, calibration: c.calibration })),
  }, null, 2));
  console.log(`Created ${cases.length} dynamics cases in ${output}`);
  console.log('Next: node scripts/run-trumpet-dynamics-tests.ts');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
