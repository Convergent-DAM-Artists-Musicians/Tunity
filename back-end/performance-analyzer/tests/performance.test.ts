import test from "node:test";
import assert from "node:assert/strict";
import { measurePerformance, referenceScore } from "../src/index.ts";
import { alignRhythm } from "../../rhythm-analyzer/src/index.ts";
import { parseMusicXml } from "../../src/score/score-xml.ts";
import type {
  RhythmScore,
  RhythmNote,
} from "../../rhythm-analyzer/src/types.ts";
import type { AudioClip, PitchTrack } from "../../src/types.ts";
function fixture() {
  const score: RhythmScore = {
    events: Array.from({ length: 4 }, (_, i) => ({
      id: `n${i}`,
      kind: "note",
      startBeat: i,
      durationBeats: 1,
      measure: "1",
      beat: i + 1,
      midi: 69,
    })),
    tempoMap: [{ beat: 0, bpm: 60 }],
    meterMap: [{ beat: 0, numerator: 4, denominator: 4 }],
  };
  const notes: RhythmNote[] = score.events.map((e, i) => ({
    startSec: i + 0.2,
    endSec: i + 1.15,
    midi: 69,
    frequencyHz: 440,
    confidence: 0.95,
    offsetConfidence: 0.95,
    boundary: "attack",
    boundaryUncertaintyMs: 10,
    rmsDb: -23,
  }));
  const clip: AudioClip = {
    sampleRate: 16000,
    sourceStartSec: 0,
    samples: new Float32Array(16000 * 5),
  };
  for (const n of notes)
    for (
      let i = Math.round(n.startSec * 16000);
      i < Math.round(n.endSec * 16000);
      i++
    )
      clip.samples[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / 16000);
  const track: PitchTrack = {
    engine: "torchcrepe",
    model: "full",
    hopSec: 0.01,
    frames: Array.from({ length: 500 }, (_, i) => ({
      timeSec: i / 100,
      frequencyHz: 440,
      periodicity: 0.99,
    })),
  };
  const run = () =>
    measurePerformance(
      clip,
      alignRhythm(score, notes, 5, 0, {
        alignmentMode: "fixed",
        referenceOffsetSec: 0.2,
      }),
      score,
      track,
    );
  return { score, notes, clip, track, run };
}
test("clean aligned performance has no new findings and all features share IDs", () => {
  const f = fixture(),
    r = f.run();
  assert.equal(r.findings.length, 0);
  assert.deepEqual(
    r.insights.notes.map((n) => n.expectedId),
    f.score.events.map((n) => n.id),
  );
  assert.equal(Math.round(r.insights.tempo[0].bpm), 60);
});
test("pitch and drift attach to matched score note, ignore uncertain frames", () => {
  const f = fixture();
  for (const frame of f.track.frames)
    if (frame.timeSec >= 1.2 && frame.timeSec < 2.15)
      frame.frequencyHz = 466.16;
  assert.equal(
    f.run().findings.find((x) => x.kind === "wrong_note")?.expectedId,
    "n1",
  );
  for (const frame of f.track.frames)
    if (frame.timeSec >= 1.2 && frame.timeSec < 2.15) frame.periodicity = 0.1;
  assert.equal(f.run().findings.length, 0);
  for (const frame of f.track.frames)
    if (frame.timeSec >= 2.2 && frame.timeSec < 3.15)
      frame.frequencyHz = 440 * 2 ** (((frame.timeSec - 2.2) * 80) / 1200);
  assert.equal(
    f.run().findings.find((x) => x.kind === "pitch_drift")?.expectedId,
    "n2",
  );
});
test("articulation respects explicit slur direction and ignores unmarked gaps", () => {
  const f = fixture();
  f.notes[0].endSec = 0.9;
  assert.equal(f.run().findings.length, 0);
  f.score.events[0].notation = { slurToNext: true };
  assert.equal(
    f.run().findings.find((x) => x.kind === "slur_gap")?.expectedId,
    "n0",
  );
  f.score.events[0].notation = { slur: true };
  assert.equal(f.run().findings.length, 0);
  f.score.events[1].notation = { staccato: true } as never;
  f.score.events[1].notation = { articulation: ["staccato"] };
  assert.equal(
    f.run().findings.find((x) => x.kind === "staccato_length")?.expectedId,
    "n1",
  );
  f.score.events[0].notation = { articulation: ["tenuto"] };
  f.notes[0].endSec = 0.7;
  assert.equal(
    f.run().findings.find((x) => x.kind === "tenuto_length")?.expectedId,
    "n0",
  );
});
test("relative dynamics are gain invariant; explicit accents and hairpins evaluated", () => {
  const f = fixture();
  for (const e of f.score.events) e.dynamicsDb = 0;
  for (let i = 0; i < f.clip.samples.length; i++) f.clip.samples[i] *= 0.5;
  assert.equal(f.run().findings.length, 0);
  for (let i = 19200; i < 34400; i++) f.clip.samples[i] *= 3;
  assert.equal(
    f.run().findings.find((x) => x.kind === "relative_dynamics")?.expectedId,
    "n1",
  );
  const g = fixture();
  g.score.events[1].notation = { articulation: ["accent"] };
  g.score.hairpins = [{ startBeat: 0, endBeat: 4, kind: "crescendo" }];
  assert.ok(g.run().findings.some((x) => x.kind === "accent_contrast"));
  assert.ok(g.run().findings.some((x) => x.kind === "hairpin_contrast"));
});
test("quiet and clipped recordings suppress additional correctness findings", () => {
  const f = fixture();
  f.score.events[0].notation = { articulation: ["staccato"] };
  f.clip.samples.fill(1);
  assert.equal(f.run().insights.recording.usable, false);
  assert.equal(f.run().findings.length, 0);
  f.clip.samples.fill(0);
  assert.equal(f.run().findings.length, 0);
});
test("no score produces observations without inventing written values", () => {
  const f = fixture(),
    base = alignRhythm(f.score, f.notes, 5, 0, {
      alignmentMode: "fixed",
      referenceOffsetSec: 0.2,
    });
  const r = measurePerformance(f.clip, base, undefined, f.track);
  assert.equal(r.insights.categories[0].status, "observed");
  assert.equal(r.insights.notes[0].expectedMidi, undefined);
  assert.equal(r.insights.scoreKey, undefined);
});
test("malformed expression annotations are rejected", () => {
  const f = fixture();
  f.score.hairpins = [{ startBeat: 2, endBeat: 1, kind: "crescendo" }];
  assert.throws(() => referenceScore(f.score), /hairpin/);
  delete f.score.hairpins;
  f.score.events[0].notation = { articulation: "bad" } as never;
  assert.throws(() => referenceScore(f.score), /articulation/);
});
test("MusicXML preserves slur spans, articulation and hairpin endpoints", () => {
  const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Trumpet</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="60"/><direction-type><wedge type="crescendo" number="1"/></direction-type></direction><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><notations><slur type="start" number="1"/></notations></note><note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><notations><slur type="stop" number="1"/></notations></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><notations><articulations><staccato/></articulations></notations></note><direction><direction-type><wedge type="stop" number="1"/></direction-type></direction></measure></part></score-partwise>`;
  const score = parseMusicXml(xml).rhythm;
  assert.deepEqual(
    score.events.map((e) => e.notation?.slurToNext),
    [true, true, false, false],
  );
  assert.deepEqual(score.hairpins, [
    { startBeat: 0, endBeat: 4, kind: "crescendo" },
  ]);
  assert.ok(score.events[3].notation?.articulation?.includes("staccato"));
});
