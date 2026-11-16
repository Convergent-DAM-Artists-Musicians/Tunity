import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { extractAudioClip } from '../src/extract.ts';
import { analyzeClip } from '../src/analyzer.ts';
import type { ExpectedNote } from '../src/types.ts';
import type { DynamicsExpectation } from './dynamics-fixtures.ts';

try {
  const folder = resolve(process.argv[2] ?? 'practice/dynamics');
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as {
    durationSec: number; cases: { name: string; audioFile: string; referenceFile: string;
      expectedNoteCount: number; expectedDynamics: DynamicsExpectation[] }[];
  };
  const summaries = [];
  for (const c of manifest.cases) {
    console.log(`Analyzing ${c.name} with real CREPE...`);
    const reference = JSON.parse(await readFile(join(folder, c.referenceFile), 'utf8')) as { notes: ExpectedNote[] };
    const clip = await extractAudioClip(join(folder, c.audioFile), {
      startSec: 0, endSec: manifest.durationSec, ffmpegPath: process.env.FFMPEG_PATH,
    });
    const result = await analyzeClip(clip, reference.notes);
    await writeFile(join(folder, `${c.name}.result.json`), JSON.stringify(result, null, 2));
    const dynamics = result.findings.filter(f => f.kind === 'uneven_dynamics');
    const observed = dynamics.map(f => `${f.kind}:${f.expectedId}`).sort();
    const expected = c.expectedDynamics.map(e => `uneven_dynamics:${e.expectedId}`).sort();
    const checks = {
      findingsMatch: JSON.stringify(observed) === JSON.stringify(expected),
      levelsMatch: c.expectedDynamics.every(e => dynamics.some(f => f.expectedId === e.expectedId
        && Number.isFinite(f.dynamicsErrorDb) && Math.abs(f.dynamicsErrorDb! - e.deltaDb) <= 1)),
      allNotesDetected: result.detectedNotes.length === c.expectedNoteCount && result.matches.length === c.expectedNoteCount,
      noClipping: result.quality.clippedSampleFraction === 0,
      dynamicsAssessed: !result.quality.warnings.some(w => w.startsWith('Dynamics not assessed')),
    };
    const passed = Object.values(checks).every(Boolean);
    summaries.push({ name: c.name, passed, checks, expected, observed,
      measuredDynamics: dynamics.map(f => ({ expectedId: f.expectedId, dynamicsErrorDb: f.dynamicsErrorDb })),
      otherFindings: result.findings.filter(f => f.kind !== 'uneven_dynamics'), warnings: result.quality.warnings });
    console.log(`${passed ? 'PASS' : 'REVIEW'} ${c.name}: ${observed.join(', ') || 'no dynamics errors'}`);
  }
  const report = { passedCases: summaries.filter(s => s.passed).length, totalCases: summaries.length, cases: summaries };
  await writeFile(join(folder, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(`${report.passedCases}/${report.totalCases} dynamics cases matched expectations. See ${join(folder, 'summary.json')}`);
  if (report.passedCases !== report.totalCases) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
