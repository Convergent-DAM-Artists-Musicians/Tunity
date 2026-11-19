import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractAudioClip } from "../../src/extract.ts";
import { estimatePitch } from "../../src/crepe.ts";
import { measurePerformance } from "../src/index.ts";
const source = new URL(
    "../../rhythm-analyzer/evaluation/data/",
    import.meta.url,
  ),
  out = new URL("./results/", import.meta.url);
const rows = [];
for (const id of ["05", "09"]) {
  const base = JSON.parse(
    await readFile(new URL(`${id}-verified.wav.json`, out), "utf8"),
  );
  const score = JSON.parse(
    await readFile(new URL(`${id}-verified.score.json`, source), "utf8"),
  );
  const clip = await extractAudioClip(
    fileURLToPath(new URL(`${id}-verified.wav`, source)),
    { startSec: 0, endSec: 120, ffmpegPath: process.env.FFMPEG_PATH },
  );
  const start = Date.now(),
    track = await estimatePitch(clip, {}, { model: "tiny", batchSize: 32 });
  const tiny = measurePerformance(clip, base, score, track);
  const summary = (ns: any[]) => ({
    notes: ns.length,
    covered: ns.filter((n) => n.pitchCoverage >= 0.65).length,
    correctSemitone: ns.filter(
      (n) => n.midi !== undefined && Math.round(n.midi) === n.expectedMidi,
    ).length,
    meanAbsoluteCents:
      ns.reduce((s, n) => s + Math.abs(n.cents ?? 0), 0) / ns.length,
  });
  rows.push({
    id,
    full: summary(base.insights.notes),
    tiny: summary(tiny.insights.notes),
    tinySeconds: (Date.now() - start) / 1000,
  });
  console.log(rows.at(-1));
}
await writeFile(
  new URL("pitch-model.json", out),
  JSON.stringify(rows, null, 2),
);
