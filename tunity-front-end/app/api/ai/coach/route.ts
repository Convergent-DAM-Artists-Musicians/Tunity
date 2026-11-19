import { aiRoute, readJson, text } from "@/lib/server/ai-route";
import { digestMessage, GROUNDING_RULES, resolveRefs } from "@/lib/server/grounding";
import { AiError, structured } from "@/lib/server/openai";
import { readResult } from "@/lib/studio/analysis";

export const maxDuration = 120;

const CATEGORIES = ["rhythm", "pitch", "articulation", "dynamics", "tempo", "recording", "setup"];
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "reliability", "targets", "encouragement"],
  properties: {
    summary: { type: "string", description: "One concise sentence on the take overall." },
    reliability: { type: "string", description: "Empty string, or why the measurements should be treated with caution." },
    targets: {
      type: "array",
      description: "Zero to two genuine weaknesses, most important first. Never add filler targets.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "category", "observation", "practice", "findingIds", "measures"],
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          observation: { type: "string", description: "One short sentence describing what the data shows." },
          practice: { type: "string", description: "One short sentence giving a concrete drill." },
          findingIds: { type: "array", items: { type: "string" } },
          measures: { type: "array", items: { type: "string" } },
        },
      },
    },
    encouragement: { type: "string", description: "One sentence naming something measured that went well, or empty." },
  },
};

type Coach = {
  summary: string;
  reliability: string;
  encouragement: string;
  targets: { title: string; category: string; observation: string; practice: string; findingIds: string[]; measures: string[] }[];
};

export async function POST(request: Request) {
  return aiRoute(request, "coach", async () => {
    const body = await readJson<{ result?: unknown; title?: unknown }>(request, 1_500_000);
    let result;
    try { result = readResult(body.result); } catch (e) { throw new AiError((e as Error).message, 400); }
    const title = text(body.title, 100) || "Untitled take";
    const coach = await structured<Coach>({
      name: "practice_coach",
      schema,
      maxTokens: 6000,
      messages: [
        { role: "system", content: `You are Tunity's practice coach for a solo instrumentalist.\n${GROUNDING_RULES}
Return zero, one, or two practice targets ranked by musical impact and evidence. Include only genuine weaknesses; never invent a target to fill a quota. A strong take may have one target or none.
Each practice drill must be specific: the measures to loop, a slower practice tempo as a percentage of the score tempo, and what to listen for.
Keep the observation and practice fields to one sentence each and under 25 words.` },
        { role: "user", content: digestMessage(result, title) },
      ],
    });
    return {
      summary: text(coach.summary, 600),
      reliability: text(coach.reliability, 400),
      encouragement: text(coach.encouragement, 300),
      targets: coach.targets.slice(0, 2).map((t) => ({
        title: text(t.title, 120),
        category: CATEGORIES.includes(t.category) ? t.category : "setup",
        observation: text(t.observation, 500),
        practice: text(t.practice, 500),
        evidence: resolveRefs(result, t.findingIds, t.measures),
      })),
      createdAt: new Date().toISOString(),
    };
  });
}
