/** All local evaluation audio, real and controlled. No cached detector results. */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { extractAudioClip } from "../../src/extract.ts";
import { analyzePerformance } from "../src/index.ts";
const data = fileURLToPath(
  new URL("../../rhythm-analyzer/evaluation/data/", import.meta.url),
);
const out = fileURLToPath(new URL("./results/", import.meta.url));
await mkdir(out, { recursive: true });
const files = (await readdir(data)).filter((f) => f.endsWith(".wav")).sort();
const rows = [];
for (const file of files) {
  let reference;
  try {
    reference = JSON.parse(
      await readFile(join(data, file.replace(/\.wav$/, ".score.json")), "utf8"),
    );
  } catch {}
  if (!reference && file.startsWith("real-edit-")) {
    const controls = JSON.parse(
      await readFile(join(data, "real-controls.json"), "utf8"),
    );
    const control = controls.find(
      (r: { id: string }) =>
        r.id === file.replace("real-edit-", "real-").replace(".wav", ""),
    );
    if (control)
      reference = { ...control.score, rhythmOptions: control.options };
  }
  const clip = await extractAudioClip(join(data, file), {
    startSec: 0,
    endSec: 120,
    ffmpegPath: process.env.FFMPEG_PATH,
  });
  const start = Date.now();
  try {
    const r = await analyzePerformance(clip, reference);
    if (!r.pitchEngine) throw new Error("Pitch worker unavailable");
    if (
      JSON.stringify(r).includes("null") &&
      r.insights.notes.some((n) => !Number.isFinite(n.loudnessDb))
    )
      throw new Error("Nonfinite measurement");
    const row = {
      file,
      hasReference: r.hasReference,
      duration: r.durationSec,
      notes: r.detectedNotes.length,
      matched: r.matches.length,
      findings: r.findings.reduce(
        (counts: Record<string, number>, f) => ({
          ...counts,
          [f.category]: (counts[f.category] ?? 0) + 1,
        }),
        {},
      ),
      seconds: (Date.now() - start) / 1000,
    };
    rows.push(row);
    await writeFile(join(out, file + ".json"), JSON.stringify(r));
    console.log(JSON.stringify(row));
  } catch (e) {
    rows.push({ file, error: String(e) });
    console.error(file, e);
  }
  await writeFile(join(out, "summary.json"), JSON.stringify(rows, null, 2));
}
if (rows.some((r) => "error" in r)) process.exitCode = 1;
