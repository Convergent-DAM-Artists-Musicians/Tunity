import { importSheetMusic } from './score-import.ts';
import type { SheetImportOptions } from './score-import.ts';

/** JSON bridge used by the Next.js studio routes. Prints the imported score to stdout. */
const [input, settings] = process.argv.slice(2);
try {
  if (!input) throw new Error('A MusicXML or MXL file is required.');
  const options = settings ? JSON.parse(settings) as Pick<SheetImportOptions, 'partId' | 'voice' | 'staff' | 'tempoBpm'> : {};
  console.log(JSON.stringify(await importSheetMusic(input, {
    partId: options.partId, voice: options.voice, staff: options.staff, tempoBpm: options.tempoBpm,
  })));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
