import { readFile, writeFile } from 'node:fs/promises';
import { importSheetMusic } from './score-import.ts';
import { referenceForScorePassage } from './score-xml.ts';
import type { SheetImportOptions } from './score-import.ts';

const [input, output, settings] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node src/score-cli.ts <sheet.pdf|png|musicxml|mxl> <reference.json> [settings.json]');
  process.exitCode = 1;
} else {
  try {
    const config = settings ? JSON.parse(await readFile(settings, 'utf8')) as SheetImportOptions & {
      passage?: { startSec: number; endSec: number; countInSec?: number };
    } : {};
    const score = await importSheetMusic(input, config);
    const p = config.passage;
    const notes = p ? referenceForScorePassage(score, p.startSec, p.endSec, p.countInSec) : score.notes;
    await writeFile(output, JSON.stringify({ ...score, notes }, null, 2));
    console.log(`Imported ${notes.length} notes into ${output}. Review the reference before grading.`);
    for (const warning of score.warnings) console.warn(warning);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
