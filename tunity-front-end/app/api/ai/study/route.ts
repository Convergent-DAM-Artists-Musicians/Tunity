import { extname } from "node:path";
import { aiRoute, text } from "@/lib/server/ai-route";
import { AiError, structured } from "@/lib/server/openai";
import { importScore } from "@/lib/server/score-import";
import { compactScore, scoreDigest } from "@/lib/studio/score";

export const maxDuration = 120;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "difficultPassages", "breathingPoints", "startingTempo", "tempoSteps", "warmUps", "checklist"],
  properties: {
    overview: { type: "string" },
    difficultPassages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startMeasure", "endMeasure", "title", "why", "practice"],
        properties: {
          startMeasure: { type: "string" }, endMeasure: { type: "string" },
          title: { type: "string" }, why: { type: "string" }, practice: { type: "string" },
        },
      },
    },
    breathingPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "advice"],
        properties: { candidateId: { type: "string" }, advice: { type: "string" } },
      },
    },
    startingTempo: {
      type: "object",
      additionalProperties: false,
      required: ["bpm", "why"],
      properties: { bpm: { type: "integer" }, why: { type: "string" } },
    },
    tempoSteps: { type: "array", items: { type: "integer" } },
    warmUps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "minutes", "instructions"],
        properties: { title: { type: "string" }, minutes: { type: "integer" }, instructions: { type: "string" } },
      },
    },
    checklist: { type: "array", items: { type: "string" } },
  },
};

type Guide = {
  overview: string;
  difficultPassages: { startMeasure: string; endMeasure: string; title: string; why: string; practice: string }[];
  breathingPoints: { candidateId: string; advice: string }[];
  startingTempo: { bpm: number; why: string };
  tempoSteps: number[];
  warmUps: { title: string; minutes: number; instructions: string }[];
  checklist: string[];
};

export async function POST(request: Request) {
  return aiRoute(request, "study", async () => {
    let form: FormData;
    try { form = await request.formData(); } catch { throw new AiError("Upload a MusicXML or MXL score.", 400); }
    const file = form.get("score");
    if (!(file instanceof File)) throw new AiError("Upload a MusicXML or MXL score.", 400);
    const partId = text(form.get("partId"), 40) || undefined;
    const instrument = text(form.get("instrument"), 60);
    const imported = await importScore(new Uint8Array(await file.arrayBuffer()), extname(file.name).toLowerCase(), { partId });
    const digest = scoreDigest(imported);
    const guide = await structured<Guide>({
      name: "study_guide",
      schema,
      maxTokens: 6000,
      messages: [
        { role: "system", content: `You prepare a student to record a piece for the first time. You receive measurements computed from the notation.
- Only reference measures that appear in the data, using their exact labels. Base difficulty on the measured signals (notes per second, shortest values, leaps, high notes, tuplets, articulations).
- Choose breathing points only from breathCandidates, citing candidateId exactly.
- startingTempo.bpm must be at most the score tempo; tempoSteps climb from it to the score tempo.
- Give 2-4 difficult passages (1-4 measures each), up to 6 breathing points, and 2-3 warm-ups (2-10 minutes) aimed at this piece's specific challenges.
- Pitches in the data are concert pitch. Keep every field under 45 words. Do not invent markings that are not in the data.` },
        { role: "user", content: JSON.stringify({ instrument: instrument || digest.partName, ...digest }) },
      ],
    });
    const order = digest.measures.map((m) => m.measure);
    const passages = guide.difficultPassages.flatMap((p) => {
      let a = order.indexOf(p.startMeasure.trim()), b = order.indexOf(p.endMeasure.trim());
      if (a < 0 && b < 0) return [];
      if (a < 0) a = b; if (b < 0) b = a;
      if (b < a) [a, b] = [b, a];
      return [{ startMeasure: order[a], endMeasure: order[Math.min(b, a + 7)], title: text(p.title, 100), why: text(p.why, 400), practice: text(p.practice, 400) }];
    }).slice(0, 4);
    const breaths = guide.breathingPoints.flatMap((b) => {
      const candidate = digest.breathCandidates.find((c) => c.id === b.candidateId.trim());
      return candidate ? [{ ...candidate, advice: text(b.advice, 240) }] : [];
    }).filter((b, i, all) => all.findIndex((x) => x.id === b.id) === i).slice(0, 8);
    const scoreTempo = digest.tempoBpm;
    const start = Math.round(Math.min(scoreTempo, Math.max(30, Number(guide.startingTempo.bpm) || scoreTempo * 0.7)));
    const steps = [...new Set([...guide.tempoSteps.map(Math.round).filter((t) => t > start && t < scoreTempo), scoreTempo])]
      .sort((a, b) => a - b).slice(-5);
    return {
      overview: text(guide.overview, 600),
      passages,
      breaths,
      startingTempo: { bpm: start, why: text(guide.startingTempo.why, 300) },
      tempoSteps: start < scoreTempo ? [start, ...steps] : [scoreTempo],
      warmUps: guide.warmUps.slice(0, 3).map((w) => ({ title: text(w.title, 100), minutes: Math.min(15, Math.max(1, Math.round(w.minutes))), instructions: text(w.instructions, 400) })),
      checklist: guide.checklist.map((c) => text(c, 160)).filter(Boolean).slice(0, 5),
      facts: {
        title: digest.title, partName: digest.partName, tempoBpm: scoreTempo, meter: digest.meter,
        measureCount: digest.measureCount, durationSec: digest.durationSec, concertRange: digest.concertRange,
        longestStretch: digest.longestStretchWithoutBreath,
      },
      reference: compactScore(imported),
      createdAt: new Date().toISOString(),
    };
  });
}
