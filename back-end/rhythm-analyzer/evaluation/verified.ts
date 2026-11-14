import { readFile, writeFile } from "node:fs/promises";
import { alignRhythm } from "../src/index.ts";
const root = new URL("./", import.meta.url),
  cases = JSON.parse(
    await readFile(new URL("data/verified.json", root), "utf8"),
  );
const rows = [];
for (const c of cases) {
  for (const engine of ["oracle", "detected"]) {
    const notes =
      engine === "oracle"
        ? c.truth.map((n: any) => ({
            ...n,
            frequencyHz: 440,
            rmsDb: -20,
            confidence: 1,
            offsetConfidence: 1,
            boundary: "attack",
            boundaryUncertaintyMs: 20,
          }))
        : c.detected;
    const r = alignRhythm(c.score, notes, c.durationSec);
    let correct = 0,
      wrong = 0;
    for (const m of r.matches) {
      const d = notes[m.detectedIndex];
      const truth = c.truth.reduce(
        (best: any, n: any) =>
          Math.abs(n.startSec - d.startSec) <
          Math.abs(best.startSec - d.startSec)
            ? n
            : best,
        c.truth[0],
      );
      if (
        Math.abs(truth.startSec - d.startSec) <= 0.05 &&
        truth.id === m.expectedId
      )
        correct++;
      else wrong++;
    }
    const row = {
      id: c.id,
      split: c.split,
      engine,
      total: c.truth.length,
      correct,
      wrong,
      missing: c.truth.length - correct,
      accuracy: correct / c.truth.length,
      confidence: r.alignment.confidence,
      findings: r.findings.map((f) => ({
        kind: f.kind,
        expectedId: f.expectedId,
        timingErrorMs: f.timingErrorMs,
        durationErrorMs: f.durationErrorMs,
      })),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
await writeFile(
  new URL("results/verified-alignment.json", root),
  JSON.stringify(rows, null, 2),
);
