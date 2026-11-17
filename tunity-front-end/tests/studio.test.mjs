import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEtude, fitEtudeMeter, etudeXml, findInstrument, duration, measureDivisions } from '../lib/studio/etude.ts';
import { compareTakes, comparable } from '../lib/studio/compare.ts';
import { analysisDigest, findingRef, compactResult, sessionPractice, scoreStructure } from '../lib/studio/analysis.ts';
import { scoreDigest, compactScore } from '../lib/studio/score.ts';

const backend = fileURLToPath(new URL('../../back-end/', import.meta.url));
function importXml(xml) {
  const folder = mkdtempSync(join(tmpdir(), 'studio-test-'));
  try {
    const path = join(folder, 'etude.musicxml');
    writeFileSync(path, xml);
    return JSON.parse(execFileSync(process.execPath, [join(backend, 'src/cli/score-json.ts'), path, '{}'], { encoding: 'utf8' }));
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
const note = (step, type, extra = {}) => ({ rest: false, step, accidental: 'key', octave: 4, type, dotted: false, triplet: false,
  tieToNext: false, articulation: 'none', slur: 'none', ...extra });
const draft = (measures, extra = {}) => ({ title: 'Sixteenth study', description: '', focus: 'rhythm', tempoBpm: 80, beats: 4, beatType: 4,
  keyFifths: 1, mode: 'major', practiceTips: ['Count aloud.'], measures: measures.map(notes => ({ notes })), ...extra });

test('etude checks pad short bars, reject overfull bars and enforce range and measure count', () => {
  const trumpet = findInstrument('Trumpet in B♭');
  const short = checkEtude(draft([[note('G', 'half')]]), trumpet, 1);
  assert.deepEqual(short.errors, []);
  assert.equal(short.draft.measures[0].notes.length, 2);
  assert.equal(short.draft.measures[0].notes[1].rest, true);
  const over = checkEtude(draft([[note('G', 'whole'), note('A', 'quarter')]]), trumpet);
  assert.match(over.errors.join(' '), /allows 4/);
  assert.match(checkEtude(draft([[note('C', 'whole', { octave: 7 })]]), trumpet).errors.join(' '), /outside/);
  assert.match(checkEtude(draft([[note('G', 'whole')]]), trumpet, 8).errors.join(' '), /exactly 8/);
  assert.match(checkEtude(draft([[note('G', 'eighth', { triplet: true }), note('A', 'eighth', { triplet: true }), note('B', 'half', { dotted: true })]]), trumpet).errors.join(' '), /triplet/);
});

test('generated overfull bars fit the meter without splitting triplets or mutating the source', () => {
  const trumpet = findInstrument('Trumpet in B♭');
  const triplet = ['C', 'D', 'E'].map(s => note(s, 'eighth', { triplet: true }));
  const original = draft([
    [note('G', 'whole'), note('A', 'eighth')], // Screenshot: 4.5 beats in 4/4.
    [note('G', 'half', { dotted: true }), note('A', 'half')],
    [...triplet, note('G', 'half', { dotted: true }), ...triplet],
  ]);
  const before = structuredClone(original);
  const checked = checkEtude(fitEtudeMeter(original), trumpet, 3);
  assert.deepEqual(original, before);
  assert.deepEqual(checked.errors, []);
  for (const m of checked.draft.measures)
    assert.equal(m.notes.reduce((sum, n) => sum + duration(n), 0), measureDivisions(checked.draft));
  assert.equal(checked.draft.measures[2].notes.filter(n => n.triplet).length, 3);
  assert.ok(importXml(etudeXml(checked.draft, trumpet)).notes.length > 0);
  const broken = draft([[...triplet.slice(0, 2), note('G', 'whole')]]);
  assert.match(checkEtude(fitEtudeMeter(broken), trumpet).errors.join(' '), /triplet/);
});

test('generated etude MusicXML imports through the analyzer with key, accidentals, triplets, ties and transposition', () => {
  const trumpet = findInstrument('Trumpet in B♭');
  const sixteenths = ['G', 'A', 'B', 'C'].map((s, i) => note(s, '16th', { octave: s === 'C' ? 5 : 4, articulation: i === 0 ? 'accent' : 'none' }));
  const { draft: d, errors } = checkEtude(draft([
    [...sixteenths, ...sixteenths, note('F', 'quarter', { slur: 'start' }), note('F', 'quarter', { accidental: 'natural', slur: 'stop' })],
    [note('E', 'eighth', { triplet: true }), note('F', 'eighth', { triplet: true }), note('G', 'eighth', { triplet: true }),
      note('G', 'quarter', { tieToNext: true }), note('G', 'half')],
  ]), trumpet, 2);
  assert.deepEqual(errors, []);
  const xml = etudeXml(d, trumpet);
  assert.match(xml, /<accidental>natural<\/accidental>/);
  assert.match(xml, /<transpose><diatonic>-1<\/diatonic><chromatic>-2<\/chromatic><\/transpose>/);
  const imported = importXml(xml);
  assert.equal(imported.title, 'Sixteenth study');
  assert.equal(imported.tempoMap[0].bpm, 80);
  // F# in G major sounds E4 (64) on B-flat trumpet; the natural sounds E-flat (63). The tie joins two Gs.
  assert.equal(imported.notes[8].midi, 64);
  assert.equal(imported.notes[9].midi, 63);
  assert.equal(imported.notes.length, 14);
  const rhythm = imported.rhythm.events.filter(e => e.kind === 'note');
  assert.equal(rhythm.at(-2).notation.actualNotes, 3);
  const compact = compactScore(imported);
  assert.deepEqual(compact.measures, ['1', '2']);
  assert.equal(compact.notes[0].measure, '1');
  const digest = scoreDigest(imported);
  assert.equal(digest.measureCount, 2);
  assert.ok(digest.measures[0].notesPerSecond > digest.measures[1].notesPerSecond);
});

const event = (id, measure, error, matched = true) => ({ expectedId: id, kind: 'note', measure, beat: 1, rhythmLabel: 'Quarter note',
  targetStartSec: Number(measure), targetEndSec: Number(measure) + 0.5, ...(matched ? { actualStartSec: Number(measure), actualEndSec: Number(measure) + 0.5, timingErrorMs: error } : {}) });
const take = (findings, events) => ({ hasReference: true, durationSec: 4, detectedNotes: [], quality: { voicedConfidenceFraction: 1, warnings: [] },
  rhythmEvents: events, findings,
  insights: { scoreKey: 'abc', categories: [{ id: 'rhythm', label: 'Rhythm', status: 'assessed', detail: '' }], notes: [], scoreNotes: [], loudness: [{ timeSec: 0, db: -20 }], tempo: [],
    recording: { rmsDb: -20, peakDb: -3, clippedSampleFraction: 0, usable: true } } });

test('take comparison classifies resolved, persisting and new findings with per-note metrics', () => {
  const late = (id, measure) => ({ category: 'rhythm', kind: 'late', expectedId: id, measure, message: 'Late', startSec: Number(measure), confidence: 0.9, status: 'likely' });
  const before = take([late('a', '1'), late('b', '2')], [event('a', '1', 80), event('b', '2', 90), event('c', '3', 5)]);
  const after = take([late('b', '2'), late('c', '3')], [event('a', '1', 10), event('b', '2', 70), event('c', '3', 60)]);
  assert.equal(comparable(before, after), null);
  assert.match(comparable(before, { ...after, insights: { ...after.insights, scoreKey: 'other' } }), /different scores/);
  const c = compareTakes(before, after);
  assert.deepEqual(c.resolved.map(f => f.expectedId), ['a']);
  assert.deepEqual(c.persisting.map(p => p.after.expectedId), ['b']);
  assert.deepEqual(c.added.map(f => f.expectedId), ['c']);
  assert.equal(c.metrics.find(m => m.id === 'timing').before, 58);
  assert.equal(c.metrics.find(m => m.id === 'timing').after, 47);
  assert.equal(c.metrics.find(m => m.id === 'clean').after, 33.3);
});

test('analysis digest cites finding ids that resolve back to measured locations', () => {
  const result = take([{ category: 'rhythm', kind: 'late', expectedId: 'b', message: 'Late by 90 ms', startSec: 2, endSec: 2.5, confidence: 0.8, status: 'likely' }],
    [event('a', '1', 0), event('b', '2', 90)]);
  const digest = analysisDigest(result, 'Take 1');
  assert.equal(digest.findings[0].id, 'F1');
  assert.equal(digest.findings[0].measure, '2');
  assert.equal(digest.notes.meanAbsTimingMs, 45);
  const ref = findingRef(result, 'F1');
  assert.equal(ref.measure, '2');
  assert.equal(ref.startSec, 2);
  assert.equal(findingRef(result, 'F9'), undefined);
  assert.equal(compactResult(result).insights.loudness.length, 0);
});

test('analysis digest includes unflagged pitch, rhythm and score difficulty evidence', () => {
  const result = take([], [
    { ...event('a', '1', 12), beat: 1, rhythmLabel: 'Quarter note', targetStartSec: 0, targetEndSec: 0.5 },
    { ...event('b', '1', -34), beat: 2, rhythmLabel: 'Eighth note', targetStartSec: 0.5, targetEndSec: 0.75 },
    { ...event('c', '2', 8), beat: 1, rhythmLabel: 'Half note', targetStartSec: 1, targetEndSec: 2 },
  ]);
  result.insights.scoreNotes = [
    { expectedId: 'a', midi: 60, startSec: 0, endSec: 0.5 },
    { expectedId: 'b', midi: 67, startSec: 0.5, endSec: 0.75 },
    { expectedId: 'c', midi: 62, startSec: 1, endSec: 2 },
  ];
  result.insights.notes = [
    { expectedId: 'a', measure: '1', beat: 1, startSec: 0, endSec: 0.5, expectedMidi: 60, midi: 60, cents: 9, pitchCoverage: 1, pitchCurve: [], loudnessDb: -20 },
    { expectedId: 'b', measure: '1', beat: 2, startSec: 0.5, endSec: 0.75, expectedMidi: 67, midi: 67, cents: -18, pitchCoverage: .9, pitchCurve: [], loudnessDb: -20 },
    { expectedId: 'c', measure: '2', beat: 1, startSec: 1, endSec: 2, expectedMidi: 62, midi: 62, cents: 4, pitchCoverage: 1, pitchCurve: [], loudnessDb: -20 },
  ];
  const digest = analysisDigest(result, 'Unflagged take');
  assert.equal(digest.findingTotal, 0);
  assert.equal(digest.pitchByNote[1].absCents, 18);
  assert.equal(digest.rhythmByEvent[1].absTimingErrorMs, 34);
  assert.equal(digest.scoreByMeasure[0].largestLeapSemitones, 7);
  assert.equal(digest.scoreByMeasure[0].shortestNoteSec, .25);
  assert.ok(digest.scoreByMeasure[0].notesPerSecond > digest.scoreByMeasure[1].notesPerSecond);
});

test('session practice seeds mistakes and broad structure without source notes or motifs', () => {
  const late = (id, measure) => ({ category: 'rhythm', kind: 'late', expectedId: id, message: 'Late', startSec: Number(measure) });
  const result = take([late('a', '1'), late('b', '2'), { category: 'pitch', kind: 'sharp', expectedId: 'b', message: 'Sharp', startSec: 2 }],
    [event('a', '1', 80), event('b', '2', 90)]);
  result.insights.scoreNotes = [{ expectedId: 'a', midi: 65 }, { expectedId: 'b', midi: 58 }];
  result.insights.tempo = [{ measure: '1', bpm: 150, targetBpm: 160, deviationPercent: -6, intervals: 3 }];
  const s = sessionPractice(result, 'Entertainer');
  assert.deepEqual(s.weaknesses, ['Rhythm: late (2×, m. 1, 2)', 'Pitch: sharp (1×, m. 2)']);
  assert.equal(s.scoreBpm, 160);
  const context = JSON.parse(s.context);
  assert.equal(context.range, undefined);
  assert.deepEqual(context.rhythmValues, ['quarter']);
  assert.equal(context.melodyByMeasure, undefined);
  assert.equal(context.recurringMotifs, undefined);
  assert.equal(context.estimatedKey, undefined);
  assert.match(context.purpose, /Target the mistakes/);
  assert.ok(!s.context.includes('F4'));
});

test('score structure finds meter, phrases, repeated motifs and key from the reference', () => {
  const spb = 0.5;
  const bars = [[60, 62, 64, 65], [67, 65, 64, 62], [60, 62, 64, 65], [67, 64, 60]];
  const events = [], notes = [];
  bars.forEach((bar, m) => bar.forEach((midi, b) => {
    const id = `m${m}b${b}`, last = m === 3 && b === 2;
    const start = (m * 4 + b) * spb;
    events.push({ expectedId: id, kind: 'note', measure: String(m + 1), beat: b + 1, rhythmLabel: last ? 'Half note' : 'Quarter note',
      targetStartSec: start, targetEndSec: start + (last ? 2 : 1) * spb });
    notes.push({ expectedId: id, midi, startSec: start, endSec: start + spb });
  }));
  const result = take([], events);
  result.insights.scoreNotes = notes;
  const s = scoreStructure(result);
  assert.equal(s.meter, '4/4');
  assert.equal(s.key, 'C major');
  assert.equal(s.measureCount, 4);
  assert.deepEqual(s.phrases, ['m. 1–4']);
  assert.equal(s.motifs[0], 'melody C4 quarter, D4 quarter, E4 quarter, F4 quarter (m. 1, 3)');
});
