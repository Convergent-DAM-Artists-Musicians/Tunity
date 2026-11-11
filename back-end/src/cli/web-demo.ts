/** Local JSON bridge used by the Next.js demo API. */
import { readFile } from "node:fs/promises";
import { extractAudioClip } from "../extract.ts";
import { estimatePitch } from "../pitch/crepe.ts";
import { analyzePitchTrack } from "../analyzer.ts";
import { defaults, segmentNotes } from "../notes.ts";
import type { ExpectedNote, AnalysisOptions } from "../types.ts";

const [audioPath, referencePath] = process.argv.slice(2);

try {
  if (!audioPath) throw new Error("An audio file is required.");

  const reference = referencePath
    ? JSON.parse(await readFile(referencePath, "utf8")) as {
        notes: ExpectedNote[];
        options?: AnalysisOptions;
      }
    : undefined;

  if (reference && (
    !Array.isArray(reference.notes) ||
    !reference.notes.length ||
    reference.notes.length > 2000
  )) {
    throw new Error("Reference JSON must contain 1–2000 notes in a notes array.");
  }

  const clip = await extractAudioClip(audioPath, {
    startSec: 0,
    endSec: 120,
    ffmpegPath: process.env.FFMPEG_PATH,
  });

  const track = await estimatePitch(clip);

  if (reference) {
    console.log(JSON.stringify({
      ...analyzePitchTrack(clip, reference.notes, track, reference.options),
      hasReference: true,
    }));
  } else {
    const detection = segmentNotes(clip, track, defaults);

    console.log(JSON.stringify({
      version: "0.2.0-crepe",
      pitchEngine: "torchcrepe",
      hasReference: false,
      durationSec: clip.samples.length / clip.sampleRate,
      detectedNotes: detection.notes,
      matches: [],
      findings: [],
      quality: {
        voicedConfidenceFraction: detection.voicedConfidenceFraction,
        warnings: [
          "No reference provided. Notes were detected, but pitch and timing were not graded.",
          ...(detection.voicedConfidenceFraction < 0.7
            ? ["Low pitch confidence. Review this recording manually."]
            : []),
        ],
      },
    }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Analysis failed.");
  process.exitCode = 1;
}
