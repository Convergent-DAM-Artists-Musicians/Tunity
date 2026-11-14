import test from "node:test";
import assert from "node:assert/strict";
import { alignRhythm, validateRhythmScore } from "../src/index.ts";
import type { RhythmScore, RhythmNote } from "../src/types.ts";
import { parseMusicXml } from "../../src/score/score-xml.ts";
const durations = [
  1,
  0.5,
  0.5,
  0.25,
  0.25,
  0.25,
  0.25,
  1.5,
  0.5,
  1 / 3,
  1 / 3,
  1 / 3,
  1,
  1,
  1,
  1,
];
function fixture(scale = 1, offset = 0) {
  let beat = 0;
  const score: RhythmScore = {
    events: durations.map((durationBeats, i) => {
      const e = {
        id: `n${i}`,
        kind: "note" as const,
        startBeat: beat,
        durationBeats,
        measure: String(1 + Math.floor(beat / 4)),
        beat: (beat % 4) + 1,
        midi: 60 + (i % 5),
      };
      beat += durationBeats;
      return e;
    }),
    tempoMap: [{ beat: 0, bpm: 120 }],
    meterMap: [{ beat: 0, numerator: 4, denominator: 4 }],
  };
  const notes: RhythmNote[] = score.events.map((e) => ({
    startSec: offset + e.startBeat * 0.5 * scale,
    endSec: offset + (e.startBeat + e.durationBeats) * 0.5 * scale,
    midi: e.midi!,
    frequencyHz: 440,
    confidence: 0.95,
    rmsDb: -20,
    boundary: "attack",
    boundaryUncertaintyMs: 20,
    offsetConfidence: 0.9,
  }));
  return { score, notes };
}
test("score rhythm survives leading silence and faster/slower performance", () => {
  for (const scale of [0.65, 1, 1.6]) {
    const { score, notes } = fixture(scale, 2.3);
    const r = alignRhythm(score, notes, 15);
    assert.equal(r.matches.length, notes.length);
    assert.ok(Math.abs(r.alignment.tempoScale - scale) < 0.01);
    assert.ok(Math.abs(r.alignment.offsetSec - 2.3) < 0.02);
    assert.deepEqual(r.findings, []);
  }
});
test("early, late, shortened, missing and extra notes do not shift later IDs", () => {
  const { score, notes } = fixture();
  notes[1].startSec -= 0.1;
  notes[8].startSec += 0.1;
  notes[14].endSec -= 0.25;
  notes.splice(12, 1);
  notes.push({ ...notes[0], startSec: 6.2, endSec: 6.3 });
  notes.sort((a, b) => a.startSec - b.startSec);
  const r = alignRhythm(score, notes, 8, 12, { alignmentMode: "fixed" });
  assert.ok(
    r.findings.some((f) => f.kind === "early" && f.expectedId === "n1"),
  );
  assert.ok(r.findings.some((f) => f.kind === "late" && f.expectedId === "n8"));
  assert.ok(
    r.findings.some(
      (f) => f.kind === "incorrect_duration" && f.expectedId === "n14",
    ),
  );
  assert.deepEqual(r.alignment.missingIds, ["n12"]);
  assert.equal(r.alignment.extraIndices.length, 1);
  assert.equal(r.matches.at(-1)?.expectedId, "n15");
  assert.ok(r.findings.every((f) => f.sourceStartSec >= 12));
});
test("a score rest is evaluated for occupancy, not treated as a note", () => {
  const { score, notes } = fixture();
  score.events[4].kind = "rest";
  const r = alignRhythm(score, notes, 10, 0, {
    alignmentMode: "fixed",
    timingToleranceMs: 30,
  });
  assert.ok(
    r.findings.some(
      (f) => f.kind === "misplaced_rest" && f.expectedId === "n4",
    ),
  );
  assert.ok(!r.matches.some((m) => m.expectedId === "n4"));
});
test("empty detection yields finite low confidence and review findings", () => {
  const { score } = fixture();
  const r = alignRhythm(score, [], 10);
  assert.equal(r.alignment.confidence, 0);
  assert.equal(r.matches.length, 0);
  assert.ok(r.findings.every((f) => f.status === "review"));
});
test("reject invalid references before analysis", () => {
  const { score } = fixture();
  score.events[1].startBeat = 0;
  assert.throws(() => validateRhythmScore(score), /non-overlapping/);
});
test("MusicXML retains dotted notes, ties, triplets, quadruplets, rests and meter", () => {
  const note = (pitch: string, dur: number, extra = "") =>
    `<note><pitch><step>${pitch}</step><octave>4</octave></pitch><duration>${dur}</duration>${extra}</note>`;
  const xml = `<score-partwise><part-list><score-part id="P"><part-name>Trumpet</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>24</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes><direction><sound tempo="120"/></direction>${note("C", 36, "<type>quarter</type><dot/>")}<note><rest/><duration>12</duration><type>eighth</type></note>${note("D", 8, "<type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>")}${note("E", 8)}${note("F", 8)}</measure><measure number="2">${note("G", 18, "<type>eighth</type><time-modification><actual-notes>4</actual-notes><normal-notes>6</normal-notes></time-modification>")}${note("A", 18)}${note("B", 18)}${note("C", 18, '<tie type="start"/>')}</measure><measure number="3">${note("C", 24, '<tie type="stop"/>')}</measure></part></score-partwise>`;
  const s = parseMusicXml(xml);
  validateRhythmScore(s.rhythm);
  assert.deepEqual(s.rhythm.meterMap, [
    { beat: 0, numerator: 6, denominator: 8 },
  ]);
  assert.equal(s.rhythm.events[0].durationBeats, 1.5);
  assert.equal(s.rhythm.events[0].notation?.dots, 1);
  assert.equal(s.rhythm.events[1].kind, "rest");
  assert.equal(s.rhythm.events[2].notation?.actualNotes, 3);
  assert.equal(s.rhythm.events[5].notation?.actualNotes, 4);
  assert.equal(s.rhythm.events.at(-1)?.tiedIds?.length, 2);
  assert.equal(s.rhythm.events.at(-1)?.durationBeats, 1.75);
});

test("shifting a whole note does not invent a duration error", () => {
  const { score, notes } = fixture();
  notes[15].startSec += 0.15;
  notes[15].endSec += 0.15;
  const r = alignRhythm(score, notes, 10, 0, { alignmentMode: "fixed" });
  assert.ok(
    r.findings.some((f) => f.kind === "late" && f.expectedId === "n15"),
  );
  assert.ok(
    !r.findings.some(
      (f) => f.kind === "incorrect_duration" && f.expectedId === "n15",
    ),
  );
});
test("short extra notes inside long rests are still misplaced rests", () => {
  const { score, notes } = fixture();
  score.events.push({
    id: "rest",
    kind: "rest",
    startBeat: 12,
    durationBeats: 8,
    measure: "4",
    beat: 1,
  });
  notes.push({ ...notes[0], startSec: 7, endSec: 7.2 });
  const r = alignRhythm(score, notes, 11, 0, { alignmentMode: "fixed" });
  assert.ok(
    r.findings.some(
      (f) => f.kind === "misplaced_rest" && f.expectedId === "rest",
    ),
  );
});
test("silence inside a sustained note is mapped to that score note", () => {
  const { score, notes } = fixture();
  const original = notes[0];
  notes.splice(
    0,
    1,
    { ...original, endSec: 0.15 },
    { ...original, startSec: 0.32 },
  );
  const r = alignRhythm(score, notes, 10, 0, { alignmentMode: "fixed" });
  assert.ok(
    r.findings.some(
      (f) => f.kind === "misplaced_rest" && f.expectedId === "n0",
    ),
  );
});
