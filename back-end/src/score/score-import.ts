import { createRequire } from 'node:module';
import { readFile, stat, mkdtemp, readdir, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { children, parseXml, parseMusicXml } from '../../../score-xml.ts';
import type { ImportedScore, ScoreImportOptions } from '../../../score-xml.ts';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const maxUpload = 20 * 1024 * 1024;
const maxXml = 5 * 1024 * 1024;

/** Server configuration only: native executable or java with server-owned args. */
export type OmrCommand = { executable: string; args?: string[]; timeoutMs?: number };
export type SheetImportOptions = ScoreImportOptions & { omr?: OmrCommand };

async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit || info.size === 0) throw new Error(`Invalid score file or file exceeds ${limit} bytes.`);
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error('Score file exceeds the size limit.');
  return bytes;
}

// Stream decompression so a small ZIP cannot allocate an unbounded XML buffer.
async function zipText(entry: { internalStream(type: string): any } | null, limit: number): Promise<string> {
  if (!entry) throw new Error('MXL archive is missing a required entry.');
  return new Promise((accept, reject) => {
    const stream = entry.internalStream('nodebuffer');
    const chunks: Buffer[] = [];
    let bytes = 0, failed = false;
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) {
        failed = true; stream.pause(); reject(new Error('Uncompressed MusicXML exceeds the size limit.'));
      } else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => { if (!failed) accept(Buffer.concat(chunks).toString('utf8')); });
    stream.resume();
  });
}

export async function readMusicXmlFile(path: string): Promise<string> {
  const compressed = extname(path).toLowerCase() === '.mxl';
  const bytes = await boundedRead(path, compressed ? maxUpload : maxXml);
  if (!compressed) return bytes.toString('utf8');
  const archive = await JSZip.loadAsync(bytes);
  if (Object.keys(archive.files).length > 256) throw new Error('MXL archive contains too many entries.');
  const manifest = parseXml(await zipText(archive.file('META-INF/container.xml'), 64 * 1024));
  const container = children(manifest)[0];
  if (!container) throw new Error('MXL container manifest is empty.');
  const roots = children(container, 'rootfiles').flatMap(n => children(n, 'rootfile'));
  const musicRoots = roots.filter(n => n.attributes?.['media-type'] === 'application/vnd.recordare.musicxml+xml');
  const root = musicRoots.length ? musicRoots[0] : roots[0];
  const fullPath = root?.attributes?.['full-path'];
  if (!fullPath || fullPath.startsWith('/') || fullPath.includes('\\') || fullPath.split('/').includes('..')) throw new Error('Invalid MXL root path.');
  // Read in memory only; archive paths are never extracted onto the filesystem.
  return zipText(archive.file(fullPath), maxXml);
}

async function runOmr(input: string, output: string, command: OmrCommand): Promise<void> {
  const timeoutMs = command.timeoutMs ?? 180000;
  if (!command.executable || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000) throw new Error('Invalid OMR command configuration.');
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command.executable)) {
    throw new Error('Use an Audiveris native executable or invoke Java directly; shell batch launchers are not supported.');
  }
  await new Promise<void>((accept, reject) => {
    const proc = spawn(command.executable, [...(command.args ?? []), '-batch', '-transcribe', '-export', '-output', output, '--', input], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '', failure: Error | undefined;
    const remember = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-6000); };
    proc.stdout.on('data', remember); proc.stderr.on('data', remember);
    const timer = setTimeout(() => { failure = new Error('Sheet-music recognition timed out.'); proc.kill(); }, timeoutMs);
    proc.on('error', error => { clearTimeout(timer); reject(new Error(`Cannot launch Audiveris: ${error.message}`)); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Audiveris failed (${code}): ${log}`));
      else accept();
    });
  });
}

async function findExports(folder: string, depth = 0): Promise<string[]> {
  if (depth > 4) throw new Error('OMR output directory nesting exceeds the limit.');
  const entries = await readdir(folder, { withFileTypes: true });
  if (entries.length > 256) throw new Error('OMR produced too many output files.');
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) paths.push(...await findExports(path, depth + 1));
    else if (entry.isFile() && /\.(mxl|musicxml|xml)$/i.test(entry.name)) paths.push(path);
  }
  return paths;
}

/** Import a file already uploaded to Storage and downloaded by an authorized worker. */
export async function importSheetMusic(inputPath: string, options: SheetImportOptions = {}): Promise<ImportedScore> {
  const path = resolve(inputPath), extension = extname(path).toLowerCase();
  if (['.xml', '.musicxml', '.mxl'].includes(extension)) {
    return parseMusicXml(await readMusicXmlFile(path), options);
  }
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(extension)) {
    throw new Error('Upload PDF, PNG, JPEG, TIFF, MusicXML, or MXL sheet music.');
  }
  const bytes = await boundedRead(path, maxUpload);
  const valid = extension === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : ['.jpg', '.jpeg'].includes(extension) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) || bytes.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42]));
  if (!valid) throw new Error('Sheet-music file contents do not match its extension.');
  if (!options.omr) throw new Error('PDF/image uploads require Audiveris. Configure the server-side omr command or upload MusicXML/MXL instead.');
  const output = await mkdtemp(join(tmpdir(), 'music-score-'));
  try {
    await runOmr(path, output, options.omr);
    const exports = await findExports(output);
    if (exports.length !== 1) throw new Error(`Audiveris produced ${exports.length} score exports; upload one movement or export a single MusicXML score manually.`);
    const score = parseMusicXml(await readMusicXmlFile(exports[0]), options);
    return { ...score, source: 'omr', requiresReview: true, warnings: [
      'Optical music recognition can misread notes, rests, accidentals and rhythms. Confirm/correct the imported reference before grading.',
      ...score.warnings,
    ] };
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}
