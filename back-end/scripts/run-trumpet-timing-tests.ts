import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { analyzeClip } from '../src/analyzer.ts';
import { extractAudioClip } from '../src/extract.ts';
import { timingKinds } from './timing-fixtures.ts';
import type { ExpectedNote } from '../src/types.ts';

const folder = resolve(process.argv[2] ?? 'practice/timing');
try {
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as {
    durationSec: number; cases: { name: string; audioFile: string; expectedTimingFindings: string[] }[];
  };
  const reference = JSON.parse(await readFile(join(folder, 'reference.json'), 'utf8')) as { notes: ExpectedNote[] };
  const summaries = [];
  for (const c of manifest.cases) {
    console.log(`Analyzing ${c.name} with real CREPE...`);
    const clip = await extractAudioClip(join(folder, c.audioFile), {
      startSec: 0, endSec: manifest.durationSec, ffmpegPath: process.env.FFMPEG_PATH,
    });
    const result = await analyzeClip(clip, reference.notes);
    await writeFile(join(folder, `${c.name}.result.json`), JSON.stringify(result, null, 2));
    const observed = result.findings.filter(f => timingKinds.has(f.kind)).map(f => `${f.kind}:${f.expectedId ?? 'extra'}`).sort();
    const expected = [...c.expectedTimingFindings].sort();
    const passed = JSON.stringify(observed) === JSON.stringify(expected);
    const summary = { name: c.name, passed, expected, observed,
      otherFindings: result.findings.filter(f => !timingKinds.has(f.kind)), warnings: result.quality.warnings };
    summaries.push(summary);
    console.log(`${passed ? 'PASS' : 'REVIEW'} ${c.name}: ${observed.join(', ') || 'no timing errors'}`);
  }
  const report = { passedCases: summaries.filter(s => s.passed).length, totalCases: summaries.length, cases: summaries };
  await writeFile(join(folder, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(`${report.passedCases}/${report.totalCases} timing cases matched expectations. See ${join(folder, 'summary.json')}`);
  if (report.passedCases !== report.totalCases) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
