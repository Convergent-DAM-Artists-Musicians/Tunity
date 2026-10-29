import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseMusicXml, referenceForScorePassage } from '../src/score-xml.ts';
import { importSheetMusic, readMusicXmlFile } from '../src/score-import.ts';
import { analyzeFixture } from './helpers.ts';
import { synthesize } from '../src/fixtures.ts';
const JSZip = createRequire(import.meta.url)('jszip');
const note = (step = 'A', duration = 4, extra = '', pitchExtra = '') => `<note>${extra}<pitch><step>${step}</step>${pitchExtra}<octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;
const attrs = '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const score = (body: string, additionalPart = '') => `<score-partwise><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">${body}</part>${additionalPart}</score-partwise>`;
const measure = (body: string, implicit = false) => `<measure number="1"${implicit ? ' implicit="yes"' : ''}>${body}</measure>`;
const tempo = (bpm: number) => `<direction><sound tempo="${bpm}"/></direction>`;

test('imports printed pitches, accidental, rest, and quarter-note tempo', () => {
  const imported = parseMusicXml(score(measure(attrs + tempo(120) + note() + '<note><rest/><duration>4</duration></note>' + note('C', 8, '', '<alter>1</alter>'))));
  assert.deepEqual(imported.notes.map(n => [n.midi, n.startSec, n.endSec]), [[69, 0, 0.5], [61, 1, 2]]);
  assert.equal(imported.durationSec, 2);
  assert.ok(imported.notes.every(n => n.dynamicsDb === undefined));
});

test('integrates tempo changes inside notes instead of using one BPM', () => {
  const body = attrs + tempo(120) + note('A', 8) + tempo(60) + note('B', 8);
  const imported = parseMusicXml(score(measure(body)));
  assert.deepEqual(imported.notes.map(n => [n.startSec, n.endSec]), [[0, 1], [1, 3]]);
  const override = parseMusicXml(score(measure(body)), { tempoBpm: 120 });
  assert.equal(override.notes[1].endSec, 2);
});

test('requires an explicit tempo when the sheet has none', () => {
  const xml = score(measure(attrs + note()));
  assert.throws(() => parseMusicXml(xml), /No initial tempo/);
  assert.equal(parseMusicXml(xml, { tempoBpm: 100 }).notes[0].endSec, 0.6);
});

test('dotted metronome units convert to quarter-note BPM', () => {
  const xml = score(measure(attrs + '<direction><direction-type><metronome><beat-unit>eighth</beat-unit><beat-unit-dot/><per-minute>80</per-minute></metronome></direction-type></direction>' + note()));
  assert.equal(parseMusicXml(xml).tempoMap[0].bpm, 60);
});

test('ties across measures merge and transposing instruments use sounding pitch', () => {
  const xml = score(measure(attrs + '<attributes><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>' + tempo(120)
    + note('A', 4, '<tie type="start"/>'), true) + measure(note('A', 4, '<tie type="stop"/>'), true));
  const imported = parseMusicXml(xml);
  assert.equal(imported.notes.length, 1);
  assert.equal(imported.notes[0].midi, 67);
  assert.equal(imported.notes[0].endSec, 1);
});

test('voice selection honors backups and retains full measure spacing', () => {
  const xml = score(measure(attrs + tempo(120) + note('A', 16)
    + '<backup><duration>16</duration></backup>' + note('C', 16).replace('<voice>1</voice>', '<voice>2</voice>')));
  assert.throws(() => parseMusicXml(xml), /Choose voice/);
  assert.equal(parseMusicXml(xml, { voice: '2' }).notes[0].midi, 60);
});

test('part selection uses the top part tempo when needed', () => {
  const xml = score(measure(attrs + tempo(80) + note()), `<part id="P2">${measure(attrs + note('D'))}</part>`);
  assert.throws(() => parseMusicXml(xml), /Choose partId/);
  const imported = parseMusicXml(xml, { partId: 'P2' });
  assert.equal(imported.notes[0].midi, 62);
  assert.equal(imported.notes[0].endSec, 0.75);
});

test('printed dynamics only produce targets with an explicit mapping', () => {
  const xml = score(measure(attrs + tempo(120)
    + '<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>' + note()));
  assert.equal(parseMusicXml(xml).notes[0].dynamicsDb, undefined);
  assert.equal(parseMusicXml(xml, { dynamicsDbByMark: { p: -8 } }).notes[0].dynamicsDb, -8);
});

test('unsupported structures and unsafe XML fail explicitly', () => {
  const base = attrs + tempo(120);
  for (const body of [
    base + note() + '<barline><repeat direction="backward"/></barline>',
    base + note() + note('C', 4, '<chord/>'),
    base + note('A', 4, '<grace/>'),
    base + note('A', 4, '<tie type="stop"/>'),
    base + '<direction><sound dacapo="yes"/></direction>' + note(),
    base + note('A', 4, '', '<alter>0.5</alter>'),
  ]) assert.throws(() => parseMusicXml(score(measure(body))));
  assert.throws(() => parseMusicXml('<!DOCTYPE score-partwise [<!ENTITY x "bad">]>' + score(measure(base + note()))), /entity|DTD/);
  assert.throws(() => parseMusicXml('<score-partwise><part></score-partwise>'));
});

test('passage references shift score time and preserve count-in without cutting notes', () => {
  const imported = parseMusicXml(score(measure(attrs + tempo(120) + note() + note('B') + note('C'))));
  const notes = referenceForScorePassage(imported, 0.5, 1.5, 0.25);
  assert.deepEqual(notes.map(n => [n.startSec, n.endSec]), [[0.25, 0.75], [0.75, 1.25]]);
  assert.throws(() => referenceForScorePassage(imported, 0.6, 1.5), /complete notes/);
});

test('imported MusicXML feeds the existing audio analyzer', () => {
  const xml = score(measure(attrs + tempo(120) + note('A', 2) + '<note><rest/><duration>2</duration></note>' + note('B', 2)));
  const imported = parseMusicXml(xml);
  const audio = synthesize(imported.notes, 2);
  assert.deepEqual(analyzeFixture(audio, imported.notes, imported.notes).findings, []);
  const wrong = imported.notes.map((n, i) => ({ ...n, midi: n.midi + (i === 1 ? 1 : 0) }));
  assert.ok(analyzeFixture(synthesize(wrong, 2), imported.notes, wrong).findings.some(f => f.kind === 'wrong_note'));
});

test('compressed MXL reads its container manifest and bounds decompression', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'score-test-'));
  try {
    const archive = new JSZip();
    archive.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="scores/main.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>');
    archive.file('scores/main.xml', score(measure(attrs + tempo(120) + note())));
    const path = join(folder, 'score.mxl');
    await writeFile(path, await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    assert.equal((await importSheetMusic(path)).notes[0].midi, 69);
    archive.file('scores/main.xml', ' '.repeat(5 * 1024 * 1024 + 1));
    await writeFile(path, await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    await assert.rejects(readMusicXmlFile(path), /Uncompressed MusicXML/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('PDF OMR subprocess contract, error handling, and review flag', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'omr-test-'));
  try {
    const input = join(folder, 'sheet music.pdf');
    await writeFile(input, '%PDF-1.4\nmock document; subprocess fixture only');
    await assert.rejects(importSheetMusic(input), /require Audiveris/);
    const fixture = fileURLToPath(new URL('./fixtures/fake-omr.ts', import.meta.url));
    const omr = { executable: process.execPath, args: [fixture] };
    const imported = await importSheetMusic(input, { omr });
    assert.equal(imported.source, 'omr');
    assert.equal(imported.requiresReview, true);
    assert.equal(imported.notes.length, 3);
    await assert.rejects(importSheetMusic(input, { omr: { ...omr, args: [fixture, '--fail'] } }), /Audiveris failed/);
    await assert.rejects(importSheetMusic(input, { omr: { ...omr, args: [fixture, '--empty'] } }), /0 score exports/);
    await assert.rejects(importSheetMusic(input, { omr: { ...omr, args: [fixture, '--wait'], timeoutMs: 50 } }), /timed out/);
    await writeFile(input, 'not a PDF');
    await assert.rejects(importSheetMusic(input, { omr }), /contents do not match/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('example MusicXML with a standard external DTD imports without fetching it', async () => {
  const xml = await readFile(new URL('../examples/scale.musicxml', import.meta.url), 'utf8');
  assert.equal(parseMusicXml(xml).notes.length, 3);
});

test('trumpet example converts written C5 D5 E5 to sounding Bb4 C5 D5 exactly once', async () => {
  const imported = await importSheetMusic(fileURLToPath(new URL('../examples/trumpet-bb.musicxml', import.meta.url)));
  assert.deepEqual(imported.notes.map(n => n.midi), [70, 72, 74]);
  const reference = referenceForScorePassage(imported, 0, imported.durationSec, 0.3);
  assert.deepEqual(reference.map(n => n.midi), [70, 72, 74]);
  assert.deepEqual(analyzeFixture(synthesize(reference, 3), reference, reference).findings, []);
});
