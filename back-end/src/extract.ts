import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { AudioClip } from './types.ts';

export type ExtractOptions = {
  startSec: number;
  endSec: number;
  sampleRate?: number;
  ffmpegPath?: string;
  timeoutMs?: number;
};

/** Local files only. Supply a server-controlled path after downloading from Storage. */
export async function extractAudioClip(inputPath: string, options: ExtractOptions): Promise<AudioClip> {
  const { startSec, endSec } = options;
  const sampleRate = options.sampleRate ?? 16000;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0
      || endSec <= startSec || endSec - startSec > 120) {
    throw new Error('Select a finite clip between 0 and 120 seconds long.');
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) {
    throw new Error('sampleRate must be an integer between 8000 and 48000.');
  }
  const timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid timeoutMs.');
  const maxBytes = Math.ceil((endSec - startSec) * sampleRate + sampleRate) * 4;
  const bytes = await new Promise<Buffer>((accept, reject) => {
    const proc = spawn(options.ffmpegPath ?? 'ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-protocol_whitelist', 'file,pipe',
      '-ss', String(startSec), '-i', resolve(inputPath), '-t', String(endSec - startSec),
      '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(sampleRate),
      '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1',
    ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('FFmpeg extraction timed out.');
      proc.kill();
    }, timeoutMs);
    proc.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        failure = new Error('Decoded audio exceeded the clip limit.');
        proc.kill();
      } else chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    proc.on('error', (error) => { clearTimeout(timer); reject(error); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`FFmpeg failed (${code}): ${stderr}`));
      else accept(Buffer.concat(chunks));
    });
  });
  if (!bytes.length || bytes.length % 4) throw new Error('No valid audio was decoded for this clip.');
  const samples = new Float32Array(bytes.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readFloatLE(i * 4);
  return { samples, sampleRate, sourceStartSec: startSec };
}
