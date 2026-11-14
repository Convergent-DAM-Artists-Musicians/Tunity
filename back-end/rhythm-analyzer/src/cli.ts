import { readFile, writeFile } from "node:fs/promises";
import { extractAudioClip } from "../../src/extract.ts";
import { analyzeRhythmClip, rhythmFromTimedNotes } from "./index.ts";
const [input, referencePath, start, end, output] = process.argv.slice(2);
try {
  if (
    !input ||
    !referencePath ||
    start === undefined ||
    end === undefined ||
    !output
  )
    throw new Error(
      "Usage: npm run analyze:rhythm -- <audio> <reference.json> <startSec> <endSec> <output.json>",
    );
  const reference = JSON.parse(await readFile(referencePath, "utf8"));
  const score =
    reference.rhythm ??
    (reference.events ? reference : rhythmFromTimedNotes(reference.notes));
  const clip = await extractAudioClip(input, {
    startSec: Number(start),
    endSec: Number(end),
    ffmpegPath: process.env.FFMPEG_PATH,
  });
  const result = await analyzeRhythmClip(clip, score, reference.rhythmOptions);
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
      "Legacy timed reference: measure, meter and written rhythmic values are unavailable. Import MusicXML for those fields.",
    );
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(`Rhythm analysis saved to ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
