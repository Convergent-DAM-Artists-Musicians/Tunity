import { readFile, writeFile } from "node:fs/promises";
import { alignRhythm } from "../src/index.ts";
const root = new URL("./", import.meta.url);
const read = async (path: string) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const truth = await read("data/42-triplets.truth.json");
const score = await read("data/42-triplets.score.json");
const detection = await read("data/42-triplets.detection.json");
const summary = await read("results/triplets.json");
const result = alignRhythm(score, detection.notes, summary.durationSec);
let correct = 0;
for (const m of result.matches) {
  const ref = truth.find((n: any) => n.id === m.expectedId);
  if (
    Math.abs(ref.startSec - detection.notes[m.detectedIndex].startSec) <= 0.05
  )
    correct++;
}
summary.alignment = {
  correct,
  total: truth.length,
  accuracy: correct / truth.length,
};
await writeFile(
  new URL("results/triplets.json", root),
  JSON.stringify(summary, null, 2) + "\n",
);
await writeFile(
  new URL("results/triplets.alignment.json", root),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(summary);
