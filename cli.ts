import { readFile, writeFile } from 'node:fs/promises';
import { extractAudioClip } from './extract.ts';
import { analyzeClip } from './analyzer.ts';
import type { AnalysisOptions, ExpectedNote } from './types.ts';

const [input, referencePath, start, end, output] = process.argv.slice(2);
if (!input || !referencePath || start === undefined || end === undefined || !output) {
  console.error('Usage: node src/cli.ts <audio-or-video> <reference.json> <startSec> <endSec> <output.json>');
  process.exitCode = 1;
} else {
  try {
    const reference = JSON.parse(await readFile(referencePath, 'utf8')) as {
      notes: ExpectedNote[]; options?: AnalysisOptions;
    };
    if (!Array.isArray(reference.notes)) throw new Error('Reference JSON must contain a notes array.');
    const clip = await extractAudioClip(input, {
      startSec: Number(start), endSec: Number(end), ffmpegPath: process.env.FFMPEG_PATH,
    });
    await writeFile(output, JSON.stringify(await analyzeClip(clip, reference.notes, reference.options), null, 2));
    console.log(`Analysis saved to ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
