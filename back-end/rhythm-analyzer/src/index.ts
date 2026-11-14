import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AudioClip, ExpectedNote } from "../../src/types.ts";
import type { RhythmDetection, RhythmOptions, RhythmScore } from "./types.ts";
import { alignRhythm, validateRhythmScore } from "./alignment.ts";
export {
  alignRhythm,
  validateRhythmScore,
  beatToSeconds,
} from "./alignment.ts";
export type * from "./types.ts";
export type RhythmRuntime = {
  pythonPath?: string;
  workerPath?: string;
  timeoutMs?: number;
};

export function validateDetection(d: RhythmDetection, duration: number): void {
  if (
    !d ||
    d.engine !== "spectral-yin-v1" ||
    d.hopSec !== 0.005 ||
    !Array.isArray(d.notes) ||
    d.notes.length > 2400 ||
    !Number.isFinite(d.silenceThresholdDb) ||
    !Array.isArray(d.warnings) ||
    d.warnings.some((w) => typeof w !== "string")
  )
    throw new Error("Invalid rhythm worker response.");
  d.notes.forEach((n, i) => {
    if (
      !n ||
      ![
        n.startSec,
        n.endSec,
        n.midi,
        n.frequencyHz,
        n.confidence,
        n.offsetConfidence,
        n.rmsDb,
        n.boundaryUncertaintyMs,
      ].every(Number.isFinite) ||
      n.startSec < 0 ||
      n.endSec <= n.startSec ||
      n.endSec > duration + 0.01 ||
      (i && n.startSec < d.notes[i - 1].endSec - 0.001) ||
      n.confidence < 0 ||
      n.confidence > 1 ||
      n.offsetConfidence < 0 ||
      n.offsetConfidence > 1 ||
      n.boundaryUncertaintyMs < 0 ||
      !["attack", "pitch_transition"].includes(n.boundary)
    )
      throw new Error("Invalid rhythm note boundaries.");
  });
}
export async function detectRhythm(
  clip: AudioClip,
  runtime: RhythmRuntime = {},
): Promise<RhythmDetection> {
  if (
    clip.sampleRate !== 16000 ||
    !clip.samples.length ||
    clip.samples.length > 16000 * 120 ||
    !Number.isFinite(clip.sourceStartSec) ||
    clip.sourceStartSec < 0 ||
    clip.samples.some((x) => !Number.isFinite(x))
  )
    throw new Error(
      "Rhythm detection requires finite mono 16 kHz PCM, up to 120 seconds.",
    );
  const timeout = runtime.timeoutMs ?? 120000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 240000)
    throw new Error("Invalid rhythm worker timeout.");
  const folder = await mkdtemp(join(tmpdir(), "tunity-rhythm-"));
  try {
    const pcmPath = join(folder, "audio.f32"),
      outputPath = join(folder, "rhythm.json"),
      requestPath = join(folder, "request.json");
    const pcm = Buffer.alloc(clip.samples.length * 4);
    clip.samples.forEach((x, i) => pcm.writeFloatLE(x, i * 4));
    await writeFile(pcmPath, pcm);
    await writeFile(
      requestPath,
      JSON.stringify({
        pcmPath,
        outputPath,
        sampleCount: clip.samples.length,
        sampleRate: 16000,
      }),
    );
    await new Promise<void>((accept, reject) => {
      const proc = spawn(
        runtime.pythonPath ?? process.env.PYTHON_PATH ?? "python3",
        [
          runtime.workerPath ??
            fileURLToPath(
              new URL("../python/rhythm_worker.py", import.meta.url),
            ),
          "--request",
          requestPath,
        ],
        { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let log = "",
        failure: Error | undefined;
      const remember = (data: Buffer) => {
        log = (log + data.toString()).slice(-6000);
      };
      proc.stdout.on("data", remember);
      proc.stderr.on("data", remember);
      const timer = setTimeout(() => {
        failure = new Error("Rhythm analysis timed out.");
        proc.kill("SIGKILL");
      }, timeout);
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`Cannot launch rhythm worker: ${e.message}`));
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code !== 0)
          reject(new Error(`Rhythm worker failed (${code}): ${log}`));
        else accept();
      });
    });
    if ((await stat(outputPath)).size > 4 * 1024 * 1024)
      throw new Error("Rhythm worker response exceeds size limit.");
    const detection = JSON.parse(
      await readFile(outputPath, "utf8"),
    ) as RhythmDetection;
    validateDetection(detection, clip.samples.length / clip.sampleRate);
    return detection;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function analyzeRhythmClip(
  clip: AudioClip,
  score: RhythmScore,
  options: RhythmOptions = {},
  runtime: RhythmRuntime = {},
) {
  validateRhythmScore(score);
  const detection = await detectRhythm(clip, runtime);
  const result = alignRhythm(
    score,
    detection.notes,
    clip.samples.length / clip.sampleRate,
    clip.sourceStartSec,
    options,
  );
  result.quality.warnings.push(
    ...detection.warnings,
    "Boundary confidence is a heuristic evidence score, not a calibrated probability. Soft slurs and breath noise may need review.",
  );
  result.quality.clippedSampleFraction =
    clip.samples.reduce((n, x) => n + (Math.abs(x) >= 0.999 ? 1 : 0), 0) /
    clip.samples.length;
  if (result.quality.clippedSampleFraction > 0.001)
    result.quality.warnings.push(
      "Clipped recording: onset and release measurements may be unreliable.",
    );
  return result;
}

/** Compatibility for existing timed-reference JSON. No written values/meter are inferred. */
export function rhythmFromTimedNotes(notes: ExpectedNote[]): RhythmScore {
  if (!Array.isArray(notes) || !notes.length)
    throw new Error("Provide reference notes or a structured rhythm score.");
  const events: RhythmScore["events"] = [];
  let end = 0;
  for (const n of notes) {
    if (n.startSec > end + 1e-7)
      events.push({
        id: `rest-before-${n.id}`,
        kind: "rest",
        startBeat: end,
        durationBeats: n.startSec - end,
        measure: "unknown",
        beat: 1,
      });
    events.push({
      id: n.id,
      kind: "note",
      midi: n.midi,
      startBeat: n.startSec,
      durationBeats: n.endSec - n.startSec,
      measure: "unknown",
      beat: 1,
    });
    end = n.endSec;
  }
  return {
    notationSource: "timed_reference",
    events,
    tempoMap: [{ beat: 0, bpm: 60 }],
    meterMap: [{ beat: 0, numerator: 4, denominator: 4 }],
  };
}
