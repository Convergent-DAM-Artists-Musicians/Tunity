// Process-contract fixture only. This is not a pitch detector.
import { readFile, writeFile } from 'node:fs/promises';
const request = JSON.parse(await readFile(process.argv[process.argv.indexOf('--request') + 1], 'utf8'));
const mode = process.env.FAKE_CREPE_MODE;
if (mode === 'fail') { console.error('fixture inference failure'); process.exit(2); }
if (mode === 'wait') await new Promise(r => setTimeout(r, 10000));
const bytes = await readFile(request.pcmPath);
if (bytes.length !== request.sampleCount * 4 || request.sampleRate !== 16000) process.exit(3);
const frames = Array.from({ length: Math.ceil(request.sampleCount / 160) }, (_, i) => ({
  timeSec: i * 0.01, frequencyHz: 440, periodicity: 0.95,
}));
if (mode === 'bad') frames[0].periodicity = 2;
await writeFile(request.outputPath, JSON.stringify({ engine: 'torchcrepe', model: request.model, hopSec: 0.01, frames }));
