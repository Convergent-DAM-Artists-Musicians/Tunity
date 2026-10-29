import { createRequire } from 'node:module';
import type { ExpectedNote } from './types.ts';

const require = createRequire(import.meta.url);
const { xml2js } = require('xml-js') as { xml2js(xml: string, options: object): XmlNode };
export type XmlNode = { type?: string; name?: string; text?: string; attributes?: Record<string, string>; elements?: XmlNode[] };
const name = (n: XmlNode) => n.name?.split(':').at(-1);
export const children = (n: XmlNode, tag?: string) => (n.elements ?? []).filter(e => e.type === 'element' && (!tag || name(e) === tag));
const child = (n: XmlNode, tag: string) => children(n, tag)[0];
const text = (n?: XmlNode): string => n?.elements?.map(e => e.text ?? '').join('').trim() ?? '';
const value = (n: XmlNode, tag: string) => text(child(n, tag));
function number(raw: string | undefined, label: string): number {
  if (raw === undefined || !raw.trim() || !Number.isFinite(Number(raw))) throw new Error(`Invalid or missing ${label}.`);
  return Number(raw);
}
function positive(raw: string | undefined, label: string): number {
  const n = number(raw, label);
  if (n <= 0) throw new Error(`${label} must be positive.`);
  return n;
}
function walk(n: XmlNode, fn: (n: XmlNode) => void, depth = 0): void {
  if (depth > 80) throw new Error('XML nesting exceeds the limit.');
  fn(n); for (const c of children(n)) walk(c, fn, depth + 1);
}

export function parseXml(xml: string): XmlNode {
  if (Buffer.byteLength(xml) > 5 * 1024 * 1024) throw new Error('MusicXML exceeds 5 MiB.');
  // Normal MusicXML exports often include an external DTD. It is never fetched.
  // Reject internal subsets and entities before parsing, then strip the DTD.
  if (/<!ENTITY/i.test(xml) || /<!DOCTYPE[^>]*\[/i.test(xml)) throw new Error('XML entity declarations and internal DTDs are not supported.');
  const doc = xml2js(xml.replace(/<!DOCTYPE[^>]*>/gi, ''), { compact: false, trim: true });
  let count = 0;
  walk(doc, () => { if (++count > 100000) throw new Error('XML has too many elements.'); });
  return doc;
}

export type ScoreImportOptions = {
  partId?: string;
  voice?: string;
  staff?: string;
  /** Explicit practice tempo in quarter notes/minute, overriding all score tempos. */
  tempoBpm?: number;
  /** Optional teacher-specified relative levels. Not inferred from printed markings. */
  dynamicsDbByMark?: Record<string, number>;
};
export type ImportedScore = {
  title: string;
  parts: { id: string; name: string }[];
  selectedPartId: string;
  notes: ExpectedNote[];
  tempoMap: { beat: number; bpm: number }[];
  durationSec: number;
  warnings: string[];
  source: 'musicxml' | 'omr';
  requiresReview: boolean;
};
type BeatNote = { id: string; midi: number; start: number; end: number; voice: string; staff: string; tieStart: boolean; tieStop: boolean };
type ParsedPart = { notes: BeatNote[]; tempos: { beat: number; bpm: number }[]; dynamics: { beat: number; mark: string }[]; duration: number; warnings: Set<string> };

function parsePart(part: XmlNode): ParsedPart {
  const result: ParsedPart = { notes: [], tempos: [], dynamics: [], duration: 0, warnings: new Set() };
  let divisions = 0, timeBeats = 0, transpose = 0, measureStart = 0;
  let noteNumber = 0;
  for (const measure of children(part, 'measure')) {
    let cursor = 0, furthest = 0, chordStart: number | undefined;
    for (const e of children(measure)) {
      const tag = name(e);
      if (tag === 'attributes') {
        if (child(e, 'divisions')) divisions = positive(value(e, 'divisions'), 'divisions');
        const time = child(e, 'time');
        if (time) {
          const beats = children(time, 'beats'), units = children(time, 'beat-type');
          if (!beats.length || beats.length !== units.length) throw new Error('Unsupported time signature.');
          timeBeats = beats.reduce((sum, b, i) => sum + text(b).split('+').reduce((n, v) => n + positive(v, 'beats'), 0)
            * 4 / positive(text(units[i]), 'beat-type'), 0);
        }
        const transposes = children(e, 'transpose');
        if (transposes.length > 1 || transposes.some(t => t.attributes?.number)) throw new Error('Staff-specific transposition is not supported.');
        if (transposes[0]) {
          if (child(transposes[0], 'double')) throw new Error('Double transposition is not supported.');
          transpose = number(value(transposes[0], 'chromatic'), 'chromatic transposition')
            + 12 * Number(value(transposes[0], 'octave-change') || 0);
          if (!Number.isInteger(transpose)) throw new Error('Microtonal transposition is not supported.');
        }
        if (child(e, 'measure-style')) throw new Error('Expand measure-repeat / multiple-rest notation before importing.');
      } else if (tag === 'backup' || tag === 'forward') {
        if (!divisions) throw new Error('MusicXML must declare divisions before durations.');
        cursor += (tag === 'backup' ? -1 : 1) * positive(value(e, 'duration'), 'duration') / divisions;
        if (cursor < -1e-7) throw new Error('MusicXML backup moves before the measure start.');
        furthest = Math.max(furthest, cursor); chordStart = undefined;
      } else if (tag === 'direction' || tag === 'sound') {
        const offset = child(e, 'offset') ? number(value(e, 'offset'), 'direction offset') / positive(String(divisions), 'divisions') : 0;
        const beat = measureStart + cursor + offset;
        if (beat < 0) throw new Error('Direction occurs before score start.');
        walk(e, n => {
          if (name(n) === 'sound') {
            for (const key of ['dacapo', 'dalsegno', 'tocoda', 'fine', 'segno', 'coda']) {
              if (n.attributes?.[key] !== undefined) throw new Error('Unfold D.C., D.S., coda and fine navigation before importing.');
            }
            if (n.attributes?.tempo) result.tempos.push({ beat, bpm: positive(n.attributes.tempo, 'tempo') });
          }
          if (name(n) === 'metronome') {
            const bpm = value(n, 'per-minute');
            if (!bpm) throw new Error('Metric modulation requires an explicit practice tempo.');
            const unit = ({ whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 } as Record<string, number>)[value(n, 'beat-unit')];
            if (!unit) throw new Error('Unsupported metronome beat unit.');
            const dots = children(n, 'beat-unit-dot').length;
            result.tempos.push({ beat, bpm: positive(bpm, 'metronome tempo') * unit * (2 - 2 ** -dots) });
          }
          if (name(n) === 'dynamics') {
            const marks = children(n);
            if (marks.length === 1) result.dynamics.push({ beat, mark: name(marks[0])! });
          }
          if (['wedge', 'words', 'pedal', 'octave-shift'].includes(name(n) ?? '')) {
            if (name(n) === 'octave-shift') throw new Error('Resolve octave-shift directions into explicit pitches before importing.');
            result.warnings.add('Text, pedal, and crescendo/diminuendo directions need manual performance review.');
          }
        });
      } else if (tag === 'note') {
        if (!divisions) throw new Error('MusicXML must declare divisions before notes.');
        if (child(e, 'grace')) throw new Error('Grace-note timing is not supported; provide a simplified practice score.');
        const duration = positive(value(e, 'duration'), 'note duration') / divisions;
        const chord = !!child(e, 'chord');
        if (chord && chordStart === undefined) throw new Error('Chord has no preceding note.');
        const start = chord ? chordStart! : cursor;
        if (!chord) { chordStart = start; cursor += duration; }
        furthest = Math.max(furthest, start + duration, cursor);
        if (child(e, 'rest')) continue;
        const p = child(e, 'pitch');
        if (!p) throw new Error('Only pitched notes are supported.');
        const semitone = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[value(p, 'step')];
        const octave = number(value(p, 'octave'), 'pitch octave');
        const midi = (octave + 1) * 12 + semitone + Number(value(p, 'alter') || 0) + transpose;
        if (!Number.isInteger(octave) || !Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error('Invalid or microtonal pitch.');
        if (e.attributes?.attack || e.attributes?.release) throw new Error('Custom note attack/release timing is not supported.');
        const ties = children(e, 'tie').map(t => t.attributes?.type);
        if (ties.some(t => t !== 'start' && t !== 'stop')) throw new Error('Unsupported tie type.');
        result.notes.push({ id: `${part.attributes?.id ?? 'part'}-m${measure.attributes?.number ?? measureStart}-n${++noteNumber}`,
          midi, start: measureStart + start, end: measureStart + start + duration,
          voice: value(e, 'voice') || '1', staff: value(e, 'staff') || '1',
          tieStart: ties.includes('start'), tieStop: ties.includes('stop') });
        const notation = child(e, 'notations');
        if (notation && children(notation).some(n => ['fermata', 'articulations', 'ornaments', 'technical'].includes(name(n)!))) {
          result.warnings.add('Fermatas, articulations, ornaments, and technique markings use nominal durations only; review them before grading.');
        }
      } else if (tag === 'barline') {
        if (child(e, 'repeat') || child(e, 'ending')) throw new Error('Unfold repeats and alternate endings before importing.');
      }
    }
    // Pickup / implicit measures use their actual duration; regular bars retain rests in other voices.
    measureStart += measure.attributes?.implicit === 'yes' ? furthest : Math.max(timeBeats, furthest);
  }
  result.duration = measureStart;
  return result;
}

export function parseMusicXml(xml: string, options: ScoreImportOptions = {}): ImportedScore {
  const doc = parseXml(xml);
  const root = children(doc)[0];
  if (!root || name(root) !== 'score-partwise') throw new Error('Upload score-partwise MusicXML (timewise scores are not supported).');
  const parts = children(root, 'part');
  const list = child(root, 'part-list');
  if (!parts.length) throw new Error('Score contains no parts.');
  const metadata = parts.map(p => {
    const id = p.attributes?.id ?? '';
    const info = list && children(list, 'score-part').find(s => s.attributes?.id === id);
    return { id, name: info ? value(info, 'part-name') || id : id };
  });
  if (metadata.some(p => !p.id) || new Set(metadata.map(p => p.id)).size !== metadata.length) throw new Error('Part IDs must be present and unique.');
  if (parts.length > 1 && !options.partId) throw new Error(`Choose partId: ${metadata.map(p => `${p.id} (${p.name})`).join(', ')}.`);
  const part = options.partId ? parts.find(p => p.attributes?.id === options.partId) : parts[0];
  if (!part) throw new Error('Selected partId does not exist.');
  const parsed = parsePart(part);
  let selected = parsed.notes.filter(n => (options.voice === undefined || n.voice === options.voice)
    && (options.staff === undefined || n.staff === options.staff));
  if (!selected.length) throw new Error('Selected part/voice/staff has no pitched notes.');
  const streams = new Set(selected.map(n => `${n.staff}:${n.voice}`));
  if (streams.size > 1) throw new Error('Choose voice and staff to isolate one melodic line.');
  selected = selected.sort((a, b) => a.start - b.start);
  const joined: BeatNote[] = [];
  for (const n of selected) {
    const previous = joined.at(-1);
    if (n.tieStop) {
      if (!previous?.tieStart || previous.midi !== n.midi || Math.abs(previous.end - n.start) > 1e-7) throw new Error('Broken tie in selected melody.');
      previous.end = n.end; previous.tieStart = n.tieStart;
    } else {
      if (previous?.tieStart) throw new Error('Unresolved tie in selected melody.');
      if (previous && n.start < previous.end - 1e-7) throw new Error('Selected melody contains chords or overlapping notes. Choose a monophonic part.');
      joined.push({ ...n });
    }
  }
  if (joined.at(-1)?.tieStart) throw new Error('Unresolved tie at the end of the score.');
  let tempos = parsed.tempos;
  // Many ensemble exports put tempo directions only in the conductor/top part.
  if (part !== parts[0] && options.tempoBpm === undefined) {
    tempos = [...parsePart(parts[0]).tempos, ...tempos];
  }
  if (options.tempoBpm !== undefined) tempos = [{ beat: 0, bpm: positive(String(options.tempoBpm), 'practice tempo') }];
  tempos.sort((a, b) => a.beat - b.beat);
  const byBeat = new Map<number, number>();
  for (const t of tempos) {
    if (byBeat.has(t.beat) && Math.abs(byBeat.get(t.beat)! - t.bpm) > 1e-5) throw new Error('Conflicting tempo directions; specify tempoBpm explicitly.');
    byBeat.set(t.beat, t.bpm);
  }
  const tempoMap = [...byBeat].map(([beat, bpm]) => ({ beat, bpm }));
  if (tempoMap[0]?.beat !== 0) throw new Error('No initial tempo found. Supply tempoBpm in quarter notes per minute.');
  const seconds = (beat: number) => {
    let elapsed = 0;
    for (let i = 0; i < tempoMap.length && tempoMap[i].beat < beat; i++) {
      elapsed += (Math.min(beat, tempoMap[i + 1]?.beat ?? beat) - tempoMap[i].beat) * 60 / tempoMap[i].bpm;
    }
    return elapsed;
  };
  parsed.dynamics.sort((a, b) => a.beat - b.beat);
  if (options.dynamicsDbByMark && Object.values(options.dynamicsDbByMark).some(db => !Number.isFinite(db))) throw new Error('Dynamics targets must be finite dB values.');
  const notes = joined.map(n => {
    const mark = parsed.dynamics.filter(d => d.beat <= n.start).at(-1)?.mark;
    const dynamicsDb = mark === undefined ? undefined : options.dynamicsDbByMark?.[mark];
    return { id: n.id, midi: n.midi, startSec: seconds(n.start), endSec: seconds(n.end),
      ...(dynamicsDb === undefined ? {} : { dynamicsDb }) };
  });
  if (notes.length > 20000) throw new Error('Score has too many notes.');
  parsed.warnings.add('Review the imported melody, tempo and synchronization cue before using it to grade a performance.');
  if (!options.dynamicsDbByMark) parsed.warnings.add('Printed dynamics have no universal dB mapping; dynamics scoring is disabled until relative targets are supplied.');
  return { title: value(root, 'movement-title') || (child(root, 'work') ? value(child(root, 'work')!, 'work-title') : '') || 'Untitled score',
    parts: metadata, selectedPartId: part.attributes!.id, notes, tempoMap,
    durationSec: seconds(parsed.duration), warnings: [...parsed.warnings], source: 'musicxml', requiresReview: true };
}

/** Score time is independent of the location of the uploaded audio clip. */
export function referenceForScorePassage(score: ImportedScore, startSec: number, endSec: number, countInSec = 0): ExpectedNote[] {
  if (![startSec, endSec, countInSec].every(Number.isFinite) || startSec < 0 || endSec <= startSec || countInSec < 0
      || endSec > score.durationSec + 1e-7 || endSec - startSec + countInSec > 120) throw new Error('Invalid score passage or count-in.');
  const overlap = score.notes.filter(n => n.startSec < endSec - 1e-7 && n.endSec > startSec + 1e-7);
  if (!overlap.length) throw new Error('Passage contains no notes.');
  if (overlap.some(n => n.startSec < startSec - 1e-7 || n.endSec > endSec + 1e-7)) throw new Error('Choose passage boundaries between complete notes; do not cut a note or tie.');
  if (overlap.length > 2000) throw new Error('Passage exceeds 2000 notes.');
  return overlap.map(n => ({ ...n, startSec: Math.max(0, n.startSec - startSec) + countInSec, endSec: n.endSec - startSec + countInSec }));
}
