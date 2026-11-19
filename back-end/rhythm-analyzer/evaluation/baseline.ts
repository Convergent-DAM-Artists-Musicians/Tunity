import { readFile, writeFile } from "node:fs/promises";
import { extractAudioClip } from "../../src/extract.ts";
import { estimatePitch } from "../../src/crepe.ts";
import { segmentNotes, defaults } from "../../src/notes.ts";
import { alignNotes } from "../../src/analyzer.ts";
const root = new URL("./", import.meta.url);
const clips = JSON.parse(await readFile(new URL("clips.json", root), "utf8"));
for (const c of clips.filter((c: any) => c.split === "development")) {
  const clip = await extractAudioClip(new URL(c.audio, root).pathname, {
    startSec: 0,
    endSec: c.endSec,
    ffmpegPath: process.env.FFMPEG_PATH,
  });
  let track;
  try {
    track = JSON.parse(
      await readFile(new URL(`data/${c.id}.crepe.json`, root), "utf8"),
    );
  } catch {
    track = await estimatePitch(clip);
    await writeFile(
      new URL(`data/${c.id}.crepe.json`, root),
      JSON.stringify(track),
    );
  }
  const detected = segmentNotes(clip, track, defaults);
  const truth = JSON.parse(await readFile(new URL(c.truth, root), "utf8"));
  const aligned = alignNotes(truth, detected.notes);
  await writeFile(
    new URL(`results/${c.id}.baseline.json`, root),
    JSON.stringify({ ...detected, aligned }, null, 2),
  );
  console.log(c.id, truth.length, detected.notes.length);
}
