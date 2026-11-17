import { aiRoute, readJson, text } from "@/lib/server/ai-route";
import { AiError, structured, type ChatMessage } from "@/lib/server/openai";
import { importScore } from "@/lib/server/score-import";
import {
  checkEtude, ETUDE_SCHEMA, etudeXml, findInstrument, INSTRUMENTS, KEYS, TIME_SIGNATURES,
  type EtudeDraft, type EtudeRequest,
} from "@/lib/studio/etude";
import { compactScore, pitchName } from "@/lib/studio/score";

export const maxDuration = 240;

function readRequest(value: Partial<EtudeRequest>): EtudeRequest {
  const prompt = text(value.prompt, 600);
  const weaknesses = (Array.isArray(value.weaknesses) ? value.weaknesses : []).map((w) => text(w, 200)).filter(Boolean).slice(0, 6);
  if (!prompt && !weaknesses.length) throw new AiError("Describe the exercise you want, or start from coach feedback.", 400);
  const measures = Number(value.measures);
  return {
    prompt,
    weaknesses,
    context: text(value.context, 4000),
    instrument: INSTRUMENTS.some((i) => i.name === value.instrument) ? value.instrument! : INSTRUMENTS[0].name,
    key: KEYS.some((k) => k.name === value.key) ? value.key! : "auto",
    measures: Number.isInteger(measures) && measures >= 2 && measures <= 16 ? measures : 8,
    timeSignature: (TIME_SIGNATURES as readonly string[]).includes(value.timeSignature ?? "") ? value.timeSignature! : "auto",
    tempoBpm: Number.isInteger(value.tempoBpm) && value.tempoBpm! >= 40 && value.tempoBpm! <= 208 ? value.tempoBpm! : null,
    difficulty: (["beginner", "intermediate", "advanced"] as const).includes(value.difficulty as "beginner") ? value.difficulty! : "intermediate",
  };
}

export async function POST(request: Request) {
  return aiRoute(request, "etude", async () => {
    const req = readRequest(await readJson<Partial<EtudeRequest>>(request, 20_000));
    const instrument = findInstrument(req.instrument);
    const key = KEYS.find((k) => k.name === req.key);
    const [beats, beatType] = req.timeSignature === "auto" ? [] : req.timeSignature.split("/").map(Number);
    const messages: ChatMessage[] = [
      { role: "system", content: `You compose short, idiomatic practice etudes for a single melodic instrument, written as structured notes.
Rules:
- Every pitch is a WRITTEN pitch for ${instrument.name} (transposing instruments read written pitch). Keep every note between ${pitchName(instrument.low)} and ${pitchName(instrument.high)} written.
- accidental "key" follows the key signature (and any accidental earlier in the same measure). Use sharp/flat/natural only for chromatic notes.
- Each measure's durations must add up exactly to the time signature. Quarter=1 beat, eighth=0.5, 16th=0.25, dotted adds half. A triplet group is exactly three triplet notes of the same value.
- tempoBpm is quarter notes per minute, even in 6/8.
- Write musical phrases with clear 2- or 4-bar shape, rests or long notes for breathing, and a cadence on the tonic at the end.
- Target the student's focus and weaknesses directly; repeat the challenging figure with small variations rather than adding unrelated difficulty.
- If a practice session is given, it describes the sheet music the student is learning, in concert pitch. Build the etude on that piece's structure: its key and scale (transposed to written pitch for the instrument), meter, phrase lengths, recurring rhythms, melodic motion and range. Develop its motifs (sequence, fragment, vary, slow down or augment them) so the skill transfers back to the piece, and give the weaknesses extra repetitions inside that framework. Never copy whole measures of the piece.
- practiceTips: 2-4 short, concrete instructions (tempo steps, what to listen for). Do not claim the exercise fixes anything.` },
      { role: "user", content: JSON.stringify({
        request: req.prompt || "Write an etude targeting the weaknesses below.",
        weaknessesFromAnalysis: req.weaknesses,
        ...(req.context ? { practiceSession: req.context } : {}),
        instrument: instrument.name,
        difficulty: req.difficulty,
        measures: req.measures,
        writtenKey: key ? { name: key.name, fifths: key.fifths, mode: key.mode } : "choose a key that suits the request",
        timeSignature: beats ? { beats, beatType } : "choose one of 4/4, 3/4, 2/4, 6/8 that suits the request",
        tempoBpm: req.tempoBpm ?? "choose a practice tempo for the difficulty",
      }) },
    ];
    let checked: ReturnType<typeof checkEtude> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const draft = await structured<EtudeDraft>({ name: "practice_etude", schema: ETUDE_SCHEMA, messages, maxTokens: 16000, effort: "low" });
      if (key) { draft.keyFifths = key.fifths; draft.mode = key.mode; }
      if (beats) { draft.beats = beats; draft.beatType = beatType; }
      if (req.tempoBpm) draft.tempoBpm = req.tempoBpm;
      checked = checkEtude(draft, instrument, req.measures);
      if (!checked.errors.length) break;
      messages.push(
        { role: "assistant", content: JSON.stringify(draft) },
        { role: "user", content: `Fix these problems and return the complete etude again:\n- ${checked.errors.join("\n- ")}` },
      );
    }
    if (!checked || checked.errors.length)
      throw new AiError(`The etude did not pass notation checks (${checked?.errors[0] ?? "unknown error"}). Try again or simplify the request.`, 422);
    const xml = etudeXml(checked.draft, instrument);
    const imported = await importScore(new TextEncoder().encode(xml), ".musicxml");
    const d = checked.draft;
    return {
      title: d.title,
      description: d.description,
      focus: d.focus,
      tips: d.practiceTips,
      instrument: instrument.name,
      keyName: KEYS.find((k) => k.fifths === d.keyFifths && k.mode === d.mode)?.name ?? `${d.keyFifths} ${d.mode}`,
      meter: `${d.beats}/${d.beatType}`,
      tempoBpm: d.tempoBpm,
      measures: d.measures.length,
      xml,
      reference: compactScore(imported),
    };
  });
}
