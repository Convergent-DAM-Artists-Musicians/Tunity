// Process-level adapter fixture; does not perform optical music recognition.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--fail')) process.exit(2);
if (args.includes('--wait')) await new Promise(r => setTimeout(r, 10000));
if (!['-batch', '-transcribe', '-export', '--'].every(flag => args.includes(flag))) process.exit(3);
const output = args[args.indexOf('-output') + 1];
await mkdir(join(output, 'nested'), { recursive: true });
if (!args.includes('--empty')) {
  const xml = await readFile(new URL('../../examples/scale.musicxml', import.meta.url));
  await writeFile(join(output, 'nested', 'score.musicxml'), xml);
}
