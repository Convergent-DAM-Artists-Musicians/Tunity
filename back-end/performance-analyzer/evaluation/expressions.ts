import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extractAudioClip } from "../../src/extract.ts";
import { analyzePerformance } from "../src/index.ts";
import { fileURLToPath } from "node:url";
const data = new URL("./data/", import.meta.url),
  out = new URL("./results/", import.meta.url);
await mkdir(out, { recursive: true });
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", data), "utf8"),
);
const rows = [];
for (const item of manifest) {
  const score = JSON.parse(
    await readFile(
      new URL(item.file.replace(".wav", ".score.json"), data),
      "utf8",
    ),
  );
  const clip = await extractAudioClip(fileURLToPath(new URL(item.file, data)), {
    startSec: 0,
    endSec: 120,
    ffmpegPath: process.env.FFMPEG_PATH,
  });
  const result = await analyzePerformance(clip, score);
  const relevant = result.findings.filter(
    (f) =>
      f.category === "articulation" ||
      f.category === "dynamics" ||
      f.kind === "pitch_drift",
  );
  const tp = item.expected.filter((e: any) =>
    relevant.some((f) => f.kind === e.kind && f.expectedId === e.expectedId),
  ).length;
  const fp = relevant.filter(
    (f) =>
      !item.expected.some(
        (e: any) => f.kind === e.kind && f.expectedId === e.expectedId,
      ),
  ).length;
  const fn = item.expected.length - tp;
  rows.push({
    file: item.file,
    tp,
    fp,
    fn,
    notes: result.detectedNotes.length,
    alignment: result.alignment.confidence,
    findings: relevant,
  });
  await writeFile(new URL(item.file + ".json", out), JSON.stringify(result));
  await writeFile(
    new URL("expressions.json", out),
    JSON.stringify(rows, null, 2),
  );
  console.log(item.file, { tp, fp, fn });
}
const tp = rows.reduce((s, r) => s + r.tp, 0),
  fp = rows.reduce((s, r) => s + r.fp, 0),
  fn = rows.reduce((s, r) => s + r.fn, 0);
console.log({ tp, fp, fn, precision: tp / (tp + fp), recall: tp / (tp + fn) });
if (fp || fn) process.exitCode = 1;
