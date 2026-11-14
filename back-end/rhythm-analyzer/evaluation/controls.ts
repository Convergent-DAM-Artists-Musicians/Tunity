import { readFile, writeFile } from "node:fs/promises";
import { alignRhythm } from "../src/index.ts";
const root = new URL("./", import.meta.url);
const name = process.argv[2] ?? "controls";
const cases = JSON.parse(
  await readFile(new URL(`data/${name}.json`, root), "utf8"),
);
const output = [];
for (const c of cases) {
  if (!c.score) {
    output.push(c);
    continue;
  }
  const r = alignRhythm(c.score, c.notes, c.durationSec, 0, c.options);
  const actual = r.findings.map((f) => ({
    kind: f.kind,
    expectedId: f.expectedId ?? null,
  }));
  const has = (list: any[], e: any) =>
    list.some((x) => x.kind === e.kind && x.expectedId === e.expectedId);
  const tp = c.expected.filter((e: any) => has(actual, e)).length;
  const fp = actual.filter((e: any) => !has(c.expected, e)).length;
  const row = {
    id: c.id,
    onsets: c.onsets,
    expected: c.expected,
    actual,
    tp,
    fp,
    fn: c.expected.length - tp,
    correctMatches: r.matches.filter(
      (m) => c.truth[m.detectedIndex]?.id === m.expectedId,
    ).length,
    matches: r.matches.length,
    alignment: r.alignment,
    rhythmEvents: r.rhythmEvents,
    rhythmGroups: r.rhythmGroups,
  };
  output.push(row);
  console.log(
    c.id,
    JSON.stringify({
      actual,
      tp,
      fp,
      fn: row.fn,
      alignment: r.alignment.confidence,
    }),
  );
}
await writeFile(
  new URL(`results/${name}.json`, root),
  JSON.stringify(output, null, 2),
);
