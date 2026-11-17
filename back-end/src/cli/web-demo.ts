import { importSheetMusic } from "../score/score-import.ts";
import { extname } from "node:path";
import { analyzePerformance } from "../../performance-analyzer/src/index.ts";
/** Local JSON bridge used by the Next.js demo API. */
import { readFile } from "node:fs/promises";
import { extractAudioClip } from "../extract.ts";
import { estimatePitch } from "../pitch/crepe.ts";
import { analyzePitchTrack } from "../analyzer.ts";
import {
  analyzeRhythmClip,
  detectRhythm,
  rhythmFromTimedNotes,
} from "../../rhythm-analyzer/src/index.ts";
import type { RhythmScore, RhythmOptions } from "../../rhythm-analyzer/src/types.ts";
import { defaults, segmentNotes } from "../notes.ts";
import type { ExpectedNote, AnalysisOptions } from "../types.ts";

const [audioPath, referencePath, mode = "performance"] = process.argv.slice(2);

try {
  if (!audioPath) throw new Error("An audio file is required.");

  const reference = referencePath
    ? (([".xml", ".musicxml", ".mxl"].includes(extname(referencePath).toLowerCase()) ? await importSheetMusic(referencePath) : JSON.parse(await readFile(referencePath, "utf8"))) as {
        warnings?: string[];
        requiresReview?: boolean;
        notes?: ExpectedNote[];
        rhythm?: RhythmScore;
        events?: RhythmScore["events"];
        tempoMap?: RhythmScore["tempoMap"];
        meterMap?: RhythmScore["meterMap"];
        rhythmOptions?: RhythmOptions;
        options?: AnalysisOptions;
      })
    : undefined;

  if (
    mode === "pitch" &&
    reference &&
    (!Array.isArray(reference.notes) ||
      !reference.notes.length ||
      reference.notes.length > 2000)
  ) {
    throw new Error(
      "Reference JSON must contain 1–2000 notes in a notes array.",
    );
  }

  const clip = await extractAudioClip(audioPath, {
    startSec: 0,
    endSec: 120,
    ffmpegPath: process.env.FFMPEG_PATH,
  });

  if (mode === "performance") {
    console.log(JSON.stringify(await analyzePerformance(clip, reference)));
  } else if (mode === "rhythm") {
    if (reference) {
      const score =
        reference.rhythm ??
        (reference.events
          ? (reference as RhythmScore)
          : rhythmFromTimedNotes(reference.notes!));
      const result = await analyzeRhythmClip(
        clip,
        score,
        reference.rhythmOptions,
      );
      if (Array.isArray(reference.warnings))
        result.quality.warnings.push(
          ...reference.warnings.filter((w: unknown) => typeof w === "string"),
        );
      if (reference.requiresReview)
        result.quality.warnings.push(
          "Imported score requires review; notation errors can produce incorrect rhythm feedback.",
        );
      if (!reference.rhythm && !reference.events)
        result.quality.warnings.push(
          "Timed reference only: written values and measure locations are unavailable. Import a reviewed MusicXML score for notation-aware feedback.",
        );
      console.log(JSON.stringify({ ...result, hasReference: true }));
    } else {
      const d = await detectRhythm(clip);
      console.log(
        JSON.stringify({
          version: "1.0.0-rhythm",
          rhythmEngine: d.engine,
          hasReference: false,
          durationSec: clip.samples.length / clip.sampleRate,
          detectedNotes: d.notes,
          matches: [],
          findings: [],
          quality: {
            voicedConfidenceFraction: d.notes.length
              ? d.notes.reduce((s, n) => s + n.confidence, 0) / d.notes.length
              : 0,
            warnings: [
              "No reference: acoustic boundaries detected; written rhythm and mistakes cannot be determined.",
              ...d.warnings,
            ],
          },
        }),
      );
    }
  } else if (mode === "pitch") {
    const track = await estimatePitch(clip);

    if (reference) {
      console.log(
        JSON.stringify({
          ...analyzePitchTrack(
            clip,
            reference.notes!,
            track,
            reference.options,
          ),
          hasReference: true,
        }),
      );
    } else {
      const detection = segmentNotes(clip, track, defaults);

      console.log(
        JSON.stringify({
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
        }),
      );
    }
  } else throw new Error("Choose rhythm or pitch analysis.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Analysis failed.");
  process.exitCode = 1;
}
