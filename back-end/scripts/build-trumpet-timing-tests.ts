import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { extractAudioClip } from '../src/extract.ts';
import { buildTimingCases, durationSec, encodeWav, reference } from './timing-fixtures.ts';

const inputFolder = process.argv[2];
if (!inputFolder) {
  console.error('Usage: node scripts/build-trumpet-timing-tests.ts <sample-folder> [output-folder]');
  process.exitCode = 1;
} else {
  try {
    const folder = resolve(inputFolder), output = resolve(process.argv[3] ?? 'practice/timing');
    const names = [
      ['trumpet_C5_long_forte_normal (1).mp3', 'trumpet_C5_long_forte_normal.mp3'],
      ['trumpet_D5_15_forte_normal.mp3'],
      ['trumpet_E5_15_forte_normal.mp3'],
    ];
    const paths = await Promise.all(names.map(async choices => {
      for (const filename of choices) {
        const path = join(folder, filename);
        try { await access(path); return path; } catch { /* try the next filename */ }
      }
      throw new Error(`Missing sample: ${choices.join(' or ')} in ${folder}`);
    }));
    const sources = await Promise.all(paths.map(path => extractAudioClip(path, {
      startSec: 0.3, endSec: 0.7, sampleRate: 16000, ffmpegPath: process.env.FFMPEG_PATH,
    })));
    const cases = buildTimingCases(sources.map(s => s.samples));
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'reference.json'), JSON.stringify({ notes: reference }, null, 2));
    for (const c of cases) await writeFile(join(output, `${c.name}.wav`), encodeWav(c.clip.samples));
    await writeFile(join(output, 'manifest.json'), JSON.stringify({
      description: 'Real trumpet samples placed at controlled times. These are constructed test clips, not live performances.',
      durationSec, sourceFiles: paths,
      cases: cases.map(c => ({ name: c.name, audioFile: `${c.name}.wav`, expectedTimingFindings: c.expectedTimingFindings,
        actualNotes: c.playedNotes })),
    }, null, 2));
    console.log(`Created ${cases.length} timing-test recordings in ${output}`);
    console.log('Reference: sounding C5, D5, E5, C5, starting at 0.5, 1.5, 2.5 and 3.5 seconds.');
    console.log('Next: node scripts/run-trumpet-timing-tests.ts');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
