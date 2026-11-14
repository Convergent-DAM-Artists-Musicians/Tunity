import test from "node:test";
import assert from "node:assert/strict";
import { alignRhythm, rhythmFromTimedNotes } from "../src/index.ts";
import { rhythmLabel } from "../src/notation.ts";
import type { RhythmScore, RhythmNote } from "../src/types.ts";
const base: RhythmScore = {
  events: [],
  tempoMap: [{ beat: 0, bpm: 120 }],
  meterMap: [{ beat: 0, numerator: 4, denominator: 4 }],
};
const event = (durationBeats: number) => ({
  id: "n",
  kind: "note" as const,
  startBeat: 0,
  durationBeats,
  measure: "1",
  beat: 1,
});
test("written labels cover ordinary, dotted and tied values, independent of tempo", () => {
  for (const [beats, label] of [
    [4, "Whole note"],
    [2, "Half note"],
    [1, "Quarter note"],
    [0.5, "Eighth note"],
    [0.25, "Sixteenth note"],
    [1.5, "Dotted quarter note"],
  ] as const) {
    assert.equal(rhythmLabel(event(beats), base).label, label);
    assert.equal(
      rhythmLabel(event(beats), { ...base, tempoMap: [{ beat: 0, bpm: 60 }] })
        .label,
      label,
    );
  }
  assert.match(
    rhythmLabel({ ...event(2), tiedIds: ["a", "b"] }, base).label,
    /Tied notes/,
  );
  assert.equal(
    rhythmLabel({ ...event(0.5), kind: "rest" }, base).label,
    "Eighth rest",
  );
});
test("timed legacy reference does not invent written rhythm", () => {
  const s = rhythmFromTimedNotes([
    { id: "n", midi: 60, startSec: 0, endSec: 1 },
  ]);
  assert.equal(rhythmLabel(s.events[0], s).source, "unavailable");
});
function tuplet(count: number, normal: number) {
  const duration = (0.5 * normal) / count;
  const score: RhythmScore = {
    ...base,
    events: Array.from({ length: count }, (_, i) => ({
      ...event(duration),
      id: `n${i}`,
      startBeat: i * duration,
      beat: 1 + i * duration,
      midi: 60 + i,
      notation: { type: "eighth", actualNotes: count, normalNotes: normal },
    })),
  };
  const notes: RhythmNote[] = score.events.map((e) => ({
    startSec: 1 + e.startBeat * 0.5,
    endSec: 1 + (e.startBeat + e.durationBeats) * 0.5,
    midi: e.midi!,
    frequencyHz: 440,
    rmsDb: -20,
    confidence: 0.95,
    offsetConfidence: 0.9,
    boundary: "attack",
    boundaryUncertaintyMs: 25,
  }));
  return { score, notes };
}
test("triplet and quadruplet labels and uneven subdivisions are reported", () => {
  for (const [count, normal, label] of [
    [3, 2, "Triplet"],
    [4, 6, "Quadruplet"],
  ] as const) {
    const { score, notes } = tuplet(count, normal);
    const options = { alignmentMode: "fixed" as const, referenceOffsetSec: 1 };
    const clean = alignRhythm(score, notes, 5, 0, options);
    assert.equal(clean.rhythmGroups[0].label, label);
    assert.equal(clean.rhythmGroups[0].status, "within_tolerance");
    assert.match(clean.matches[0].rhythmLabel, new RegExp(label.toLowerCase()));
    // Opposing 50ms deviations: neither note alone exceeds 70ms, spacing does.
    notes[0].startSec -= 0.05;
    notes[1].startSec += 0.05;
    const wrong = alignRhythm(score, notes, 5, 0, options);
    assert.equal(wrong.rhythmGroups[0].status, "uneven");
    assert.ok(wrong.findings.some((f) => f.kind === "uneven_tuplet"));
    assert.ok(Math.abs(wrong.rhythmGroups[0].maxSpacingErrorMs! - 100) < 0.01);
  }
});
test("uniform group displacement is late, not uneven; missing attack is incomplete", () => {
  const { score, notes } = tuplet(3, 2);
  for (const n of notes) {
    n.startSec += 0.1;
    n.endSec += 0.1;
  }
  const options = { alignmentMode: "fixed" as const, referenceOffsetSec: 1 };
  assert.equal(
    alignRhythm(score, notes, 5, 0, options).rhythmGroups[0].status,
    "shifted",
  );
  notes.splice(1, 1);
  assert.equal(
    alignRhythm(score, notes, 5, 0, options).rhythmGroups[0].status,
    "incomplete",
  );
});
