import { readFile, writeFile } from "node:fs/promises";
import { alignRhythm } from "../src/index.ts";
const root = new URL("./", import.meta.url);
const clips = JSON.parse(await readFile(new URL("clips.json", root), "utf8"));
for (const c of clips.filter(
  (c: any) => c.split === (process.argv[2] ?? "development"),
)) {
  const score = JSON.parse(await readFile(new URL(c.score, root), "utf8"));
  const detected = JSON.parse(
    await readFile(new URL(`data/${c.id}.detection.json`, root), "utf8"),
  ).notes;
  const result = alignRhythm(score, detected, c.endSec);
  await writeFile(
    new URL(`results/${c.id}.alignment.json`, root),
    JSON.stringify(result, null, 2),
  );
  console.log(
    c.id,
    JSON.stringify(result.alignment),
    "findings",
    result.findings.length,
  );
}
