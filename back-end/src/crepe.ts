import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisOptions, AudioClip, CrepeRuntimeOptions, PitchTrack } from './types.ts';

export function validatePitchTrack(track: PitchTrack, clip: AudioClip): void {
  const duration = clip.samples.length / clip.sampleRate;
  if (!track || track.engine !== 'torchcrepe' || !['full', 'tiny'].includes(track.model)
      || track.hopSec !== 0.01 || !Array.isArray(track.frames)
      || track.frames.length !== Math.ceil(duration / track.hopSec)) throw new Error('Invalid CREPE pitch track or frame count.');
  track.frames.forEach((frame, i) => {
    if (!frame || !Number.isFinite(frame.timeSec) || Math.abs(frame.timeSec - i * track.hopSec) > 1e-6
        || !Number.isFinite(frame.periodicity) || frame.periodicity < 0 || frame.periodicity > 1
        || (frame.frequencyHz !== null && (!Number.isFinite(frame.frequencyHz) || frame.frequencyHz < 50 || frame.frequencyHz > 2006))) {
      throw new Error('CREPE returned invalid frame values or timestamps.');
    }
  });
}

/** PCM and output live in a private per-job directory. No audio is sent to a remote service. */
export async function estimatePitch(clip: AudioClip, options: AnalysisOptions = {}, runtime: CrepeRuntimeOptions = {}): Promise<PitchTrack> {
  if (clip.sampleRate !== 16000 || !clip.samples.length || clip.samples.length > 16000 * 120
      || clip.samples.some(x => !Number.isFinite(x))) throw new Error('CREPE requires finite mono 16 kHz PCM, up to 120 seconds.');
  const minHz = options.minFrequencyHz ?? 65, maxHz = options.maxFrequencyHz ?? 1800;
  const model = runtime.model ?? 'full', device = runtime.device ?? 'cpu';
  const timeoutMs = runtime.timeoutMs ?? 180000, batchSize = runtime.batchSize ?? 256, threads = runtime.threads ?? 2;
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz < 50 || maxHz > 2006 || minHz >= maxHz
      || !['full', 'tiny'].includes(model) || !/^(cpu|cuda:\d+)$/.test(device)
      || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000
      || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2048
      || !Number.isInteger(threads) || threads < 1 || threads > 32) throw new Error('Invalid CREPE runtime or frequency range.');
  const folder = await mkdtemp(join(tmpdir(), 'trumpet-crepe-'));
  try {
    const pcmPath = join(folder, 'audio.f32'), outputPath = join(folder, 'track.json'), requestPath = join(folder, 'request.json');
    const pcm = Buffer.alloc(clip.samples.length * 4);
    clip.samples.forEach((x, i) => pcm.writeFloatLE(x, i * 4));
    await writeFile(pcmPath, pcm);
    await writeFile(requestPath, JSON.stringify({ pcmPath, outputPath, sampleRate: 16000, sampleCount: clip.samples.length,
      minHz, maxHz, model, device, batchSize, threads }));
    await new Promise<void>((accept, reject) => {
      const proc = spawn(runtime.pythonPath ?? process.env.PYTHON_PATH ?? 'python', [
        runtime.workerPath ?? fileURLToPath(new URL('../python/crepe_worker.py', import.meta.url)), '--request', requestPath,
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '', failure: Error | undefined;
      const remember = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-6000); };
      proc.stdout.on('data', remember); proc.stderr.on('data', remember);
      const timer = setTimeout(() => { failure = new Error('CREPE analysis timed out.'); proc.kill(); }, timeoutMs);
      proc.on('error', error => { clearTimeout(timer); reject(new Error(`Cannot launch CREPE Python worker: ${error.message}`)); });
      proc.on('close', code => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`CREPE worker failed (${code}): ${log}`));
        else accept();
      });
    });
    if ((await stat(outputPath)).size > 3 * 1024 * 1024) throw new Error('CREPE response exceeds the size limit.');
    const track = JSON.parse(await readFile(outputPath, 'utf8')) as PitchTrack;
    validatePitchTrack(track, clip);
    return track;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
