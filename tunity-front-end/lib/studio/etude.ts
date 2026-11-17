/** Practice-etude model contract and deterministic MusicXML writer. */

export type Instrument = {
  name: string;
  clef: "G" | "F";
  /** Written-to-sounding interval, as MusicXML <transpose>. */
  chromatic: number;
  diatonic: number;
  /** Comfortable written range, MIDI numbers. */
  low: number;
  high: number;
};

export const INSTRUMENTS: Instrument[] = [
  { name: "Trumpet in B♭", clef: "G", chromatic: -2, diatonic: -1, low: 54, high: 82 },
  { name: "Trumpet in C", clef: "G", chromatic: 0, diatonic: 0, low: 54, high: 82 },
  { name: "Trombone", clef: "F", chromatic: 0, diatonic: 0, low: 40, high: 72 },
  { name: "French horn in F", clef: "G", chromatic: -7, diatonic: -4, low: 55, high: 79 },
  { name: "Tuba", clef: "F", chromatic: 0, diatonic: 0, low: 28, high: 58 },
  { name: "Flute", clef: "G", chromatic: 0, diatonic: 0, low: 60, high: 93 },
  { name: "Clarinet in B♭", clef: "G", chromatic: -2, diatonic: -1, low: 52, high: 86 },
  { name: "Alto saxophone in E♭", clef: "G", chromatic: -9, diatonic: -5, low: 58, high: 89 },
  { name: "Violin", clef: "G", chromatic: 0, diatonic: 0, low: 55, high: 88 },
  { name: "Voice", clef: "G", chromatic: 0, diatonic: 0, low: 57, high: 77 },
];

const PROFILE_INSTRUMENTS: Record<string, string> = {
  Trumpet: "Trumpet in B♭", Trombone: "Trombone", "French horn": "French horn in F", Tuba: "Tuba",
  Flute: "Flute", Clarinet: "Clarinet in B♭", Saxophone: "Alto saxophone in E♭", Violin: "Violin", Voice: "Voice",
};
export const instrumentForProfile = (profileInstrument?: string) =>
  PROFILE_INSTRUMENTS[profileInstrument ?? ""] ?? INSTRUMENTS[0].name;

export const KEYS: { name: string; fifths: number; mode: "major" | "minor" }[] = [
  ["C major", 0], ["G major", 1], ["D major", 2], ["A major", 3], ["E major", 4],
  ["F major", -1], ["B♭ major", -2], ["E♭ major", -3], ["A♭ major", -4],
  ["A minor", 0], ["E minor", 1], ["B minor", 2], ["D minor", -1], ["G minor", -2], ["C minor", -3],
].map(([name, fifths]) => ({ name: name as string, fifths: fifths as number, mode: (name as string).endsWith("minor") ? "minor" : "major" }));

export const TIME_SIGNATURES = ["4/4", "3/4", "2/4", "6/8"] as const;
const NOTE_TYPES = ["whole", "half", "quarter", "eighth", "16th"] as const;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type NoteType = (typeof NOTE_TYPES)[number];
type Step = (typeof STEPS)[number];

export type EtudeNote = {
  rest: boolean;
  step: Step;
  /** "key" follows the key signature and any earlier accidental in the measure. */
  accidental: "key" | "sharp" | "flat" | "natural";
  octave: number;
  type: NoteType;
  dotted: boolean;
  triplet: boolean;
  tieToNext: boolean;
  articulation: "none" | "staccato" | "accent" | "tenuto";
  slur: "none" | "start" | "stop";
};

export type EtudeDraft = {
  title: string;
  description: string;
  focus: string;
  tempoBpm: number;
  beats: number;
  beatType: number;
  keyFifths: number;
  mode: "major" | "minor";
  measures: { notes: EtudeNote[] }[];
  practiceTips: string[];
};

export type EtudeRequest = {
  prompt: string;
  instrument: string;
  key: string;
  measures: number;
  timeSignature: string;
  tempoBpm: number | null;
  difficulty: "beginner" | "intermediate" | "advanced";
  weaknesses: string[];
  context: string;
};

/** OpenAI strict JSON schema for an etude draft. */
export const ETUDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "focus", "tempoBpm", "beats", "beatType", "keyFifths", "mode", "measures", "practiceTips"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    focus: { type: "string" },
    tempoBpm: { type: "integer", description: "Quarter-note beats per minute." },
    beats: { type: "integer", enum: [2, 3, 4, 6] },
    beatType: { type: "integer", enum: [4, 8] },
    keyFifths: { type: "integer", description: "Written key signature: sharps positive, flats negative." },
    mode: { type: "string", enum: ["major", "minor"] },
    measures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["notes"],
        properties: {
          notes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rest", "step", "accidental", "octave", "type", "dotted", "triplet", "tieToNext", "articulation", "slur"],
              properties: {
                rest: { type: "boolean" },
                step: { type: "string", enum: [...STEPS] },
                accidental: { type: "string", enum: ["key", "sharp", "flat", "natural"] },
                octave: { type: "integer", description: "Scientific pitch octave of the written note; C4 is middle C." },
                type: { type: "string", enum: [...NOTE_TYPES] },
                dotted: { type: "boolean" },
                triplet: { type: "boolean" },
                tieToNext: { type: "boolean" },
                articulation: { type: "string", enum: ["none", "staccato", "accent", "tenuto"] },
                slur: { type: "string", enum: ["none", "start", "stop"] },
              },
            },
          },
        },
      },
    },
    practiceTips: { type: "array", items: { type: "string" } },
  },
} as const;

export const DIVISIONS = 24;
const BASE: Record<NoteType, number> = { whole: 96, half: 48, quarter: 24, eighth: 12, "16th": 6 };
const SHARP_ORDER: Step[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: Step[] = ["B", "E", "A", "D", "G", "C", "F"];
const SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const REST_FILL = [96, 72, 48, 36, 24, 18, 12, 9, 6];
const REST_TYPE: Record<number, [NoteType, boolean]> = {
  96: ["whole", false], 72: ["half", true], 48: ["half", false], 36: ["quarter", true],
  24: ["quarter", false], 18: ["eighth", true], 12: ["eighth", false], 9: ["16th", true], 6: ["16th", false],
};

export const findInstrument = (name: string) => INSTRUMENTS.find((i) => i.name === name) ?? INSTRUMENTS[0];
export const measureDivisions = (draft: Pick<EtudeDraft, "beats" | "beatType">) => (draft.beats * DIVISIONS * 4) / draft.beatType;

function keyAlter(step: Step, fifths: number) {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) return 1;
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) return -1;
  return 0;
}

export function duration(n: Pick<EtudeNote, "type" | "dotted" | "triplet">) {
  return (BASE[n.type] * (n.dotted ? 1.5 : 1) * (n.triplet ? 2 : 3)) / 3;
}

/** Written pitches with the alteration each note actually sounds, accounting for measure accidentals. */
function spell(draft: EtudeDraft) {
  return draft.measures.map((m) => {
    const carried = new Map<string, number>();
    return m.notes.map((n) => {
      if (n.rest) return { alter: 0, midi: undefined as number | undefined, printed: undefined as string | undefined };
      const key = `${n.step}${n.octave}`;
      const current = carried.get(key) ?? keyAlter(n.step, draft.keyFifths);
      const alter = n.accidental === "key" ? current : n.accidental === "sharp" ? 1 : n.accidental === "flat" ? -1 : 0;
      const printed = alter !== current ? (alter === 1 ? "sharp" : alter === -1 ? "flat" : "natural") : undefined;
      carried.set(key, alter);
      return { alter, midi: (n.octave + 1) * 12 + SEMITONE[n.step] + alter, printed };
    });
  });
}

const pitchLabel = (midi: number) =>
  `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Check an etude draft, repairing safe issues in place. Returns problems the model must fix. */
export function checkEtude(input: EtudeDraft, instrument: Instrument, requestedMeasures?: number) {
  const draft: EtudeDraft = structuredClone(input);
  const errors: string[] = [];
  if (![2, 3, 4, 6].includes(draft.beats) || ![4, 8].includes(draft.beatType)) errors.push("Use 2/4, 3/4, 4/4 or 6/8.");
  if (!Number.isInteger(draft.keyFifths) || Math.abs(draft.keyFifths) > 7) errors.push("keyFifths must be between -7 and 7.");
  draft.tempoBpm = Math.round(Math.min(208, Math.max(40, Number(draft.tempoBpm) || 80)));
  if (!draft.measures.length || draft.measures.length > 32) errors.push("Write between 1 and 32 measures.");
  if (requestedMeasures && draft.measures.length !== requestedMeasures)
    errors.push(`Write exactly ${requestedMeasures} measures; you wrote ${draft.measures.length}.`);
  const capacity = measureDivisions(draft);
  draft.measures.forEach((m, mi) => {
    const label = `Measure ${mi + 1}`;
    if (m.notes.length > 48) errors.push(`${label} has too many notes.`);
    let run = 0, runType: NoteType | undefined;
    for (const n of m.notes) {
      if (n.rest) { n.tieToNext = false; n.articulation = "none"; n.slur = "none"; }
      if (n.triplet && n.dotted) errors.push(`${label}: dotted triplets are not supported.`);
      if (n.triplet) {
        if (runType && runType !== n.type) errors.push(`${label}: a triplet group mixes note values.`);
        runType = runType ?? n.type;
        run += duration(n);
        if (run === 2 * BASE[runType]) { run = 0; runType = undefined; }
      } else if (runType) {
        errors.push(`${label}: each triplet group needs three notes of the same value.`);
        run = 0; runType = undefined;
      }
    }
    if (runType) errors.push(`${label}: each triplet group needs three notes of the same value.`);
    const total = m.notes.reduce((sum, n) => sum + duration(n), 0);
    if (total > capacity) errors.push(`${label} has ${total / DIVISIONS} quarter beats but the meter allows ${capacity / DIVISIONS}.`);
    else if (total < capacity) {
      let remaining = capacity - total;
      while (remaining > 0) {
        const fill = REST_FILL.find((d) => d <= remaining);
        if (!fill) { errors.push(`${label} does not fill the meter.`); break; }
        const [type, dotted] = REST_TYPE[fill];
        m.notes.push({ ...restNote(type), dotted });
        remaining -= fill;
      }
    }
  });
  const spelled = spell(draft);
  const flat = draft.measures.flatMap((m, mi) => m.notes.map((n, ni) => ({ n, mi, midi: spelled[mi][ni].midi })));
  flat.forEach(({ n, mi, midi }, i) => {
    if (midi !== undefined && (midi < instrument.low || midi > instrument.high))
      errors.push(`Measure ${mi + 1}: written ${pitchLabel(midi)} is outside ${pitchLabel(instrument.low)}–${pitchLabel(instrument.high)}.`);
    const next = flat[i + 1];
    if (n.tieToNext && (!next || next.n.rest || next.midi !== midi)) n.tieToNext = false;
  });
  let open: EtudeNote | undefined;
  for (const { n } of flat) {
    if (n.slur === "start") { if (open) open.slur = "none"; open = n; }
    else if (n.slur === "stop") { if (open) open = undefined; else n.slur = "none"; }
  }
  if (open) open.slur = "none";
  draft.title = draft.title.trim().slice(0, 80) || "Practice etude";
  draft.description = draft.description.trim().slice(0, 400);
  draft.focus = draft.focus.trim().slice(0, 120);
  draft.practiceTips = draft.practiceTips.map((t) => t.trim().slice(0, 240)).filter(Boolean).slice(0, 5);
  return { draft, errors: [...new Set(errors)].slice(0, 12) };
}

function restNote(type: NoteType): EtudeNote {
  return { rest: true, step: "C", accidental: "key", octave: 4, type, dotted: false, triplet: false, tieToNext: false, articulation: "none", slur: "none" };
}

const escape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Score-partwise MusicXML that the backend importer accepts. Call after checkEtude. */
export function etudeXml(draft: EtudeDraft, instrument: Instrument) {
  const spelled = spell(draft);
  let tripletRun = 0, tied = false;
  const measures = draft.measures.map((m, mi) => {
    const parts: string[] = [`<measure number="${mi + 1}">`];
    if (mi === 0) {
      parts.push(
        `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${draft.keyFifths}</fifths><mode>${draft.mode}</mode></key>`
        + `<time><beats>${draft.beats}</beats><beat-type>${draft.beatType}</beat-type></time>`
        + (instrument.clef === "G" ? "<clef><sign>G</sign><line>2</line></clef>" : "<clef><sign>F</sign><line>4</line></clef>")
        + (instrument.chromatic ? `<transpose><diatonic>${instrument.diatonic}</diatonic><chromatic>${instrument.chromatic}</chromatic></transpose>` : "")
        + "</attributes>",
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${draft.tempoBpm}</per-minute></metronome></direction-type><sound tempo="${draft.tempoBpm}"/></direction>`,
      );
    }
    m.notes.forEach((n, ni) => {
      const { alter, printed } = spelled[mi][ni];
      const notations: string[] = [];
      const tieStop = tied, tieStart = n.tieToNext;
      tied = tieStart;
      if (tieStop) notations.push('<tied type="stop"/>');
      if (tieStart) notations.push('<tied type="start"/>');
      if (n.slur !== "none") notations.push(`<slur type="${n.slur}" number="1"/>`);
      if (n.triplet) {
        if (tripletRun === 0) notations.push('<tuplet type="start" bracket="yes"/>');
        tripletRun += duration(n);
        if (tripletRun >= 2 * BASE[n.type]) { notations.push('<tuplet type="stop"/>'); tripletRun = 0; }
      }
      if (n.articulation !== "none") notations.push(`<articulations><${n.articulation}/></articulations>`);
      parts.push(
        "<note>"
        + (n.rest ? "<rest/>" : `<pitch><step>${n.step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${n.octave}</octave></pitch>`)
        + `<duration>${duration(n)}</duration>`
        + (tieStop ? '<tie type="stop"/>' : "") + (tieStart ? '<tie type="start"/>' : "")
        + `<voice>1</voice><type>${n.type}</type>${n.dotted ? "<dot/>" : ""}`
        + (printed ? `<accidental>${printed}</accidental>` : "")
        + (n.triplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "")
        + "<staff>1</staff>"
        + (notations.length ? `<notations>${notations.join("")}</notations>` : "")
        + "</note>",
      );
    });
    if (mi === draft.measures.length - 1) parts.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    parts.push("</measure>");
    return parts.join("");
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<score-partwise version="4.0">'
    + `<work><work-title>${escape(draft.title)}</work-title></work>`
    + `<identification><encoding><software>Tunity etude writer</software></encoding></identification>`
    + `<part-list><score-part id="P1"><part-name>${escape(instrument.name)}</part-name></score-part></part-list>`
    + `<part id="P1">${measures.join("")}</part></score-partwise>\n`;
}
