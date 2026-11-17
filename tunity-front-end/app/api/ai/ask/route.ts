import { aiRoute, readJson, text } from "@/lib/server/ai-route";
import { digestMessage, GROUNDING_RULES, resolveRefs } from "@/lib/server/grounding";
import { AiError, structured, type ChatMessage } from "@/lib/server/openai";
import { readResult } from "@/lib/studio/analysis";

export const maxDuration = 120;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "findingIds", "measures"],
  properties: {
    answer: { type: "string", description: "Under 120 words. Mention measures and times from the data." },
    findingIds: { type: "array", items: { type: "string" } },
    measures: { type: "array", items: { type: "string" } },
  },
};

export async function POST(request: Request) {
  return aiRoute(request, "ask", async () => {
    const body = await readJson<{ result?: unknown; title?: unknown; messages?: unknown }>(request, 1_500_000);
    let result;
    try { result = readResult(body.result); } catch (e) { throw new AiError((e as Error).message, 400); }
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m): m is ChatMessage => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? 600 : 1200) }));
    if (history.at(-1)?.role !== "user" || !history.at(-1)!.content.trim()) throw new AiError("Ask a question about this take.", 400);
    const reply = await structured<{ answer: string; findingIds: string[]; measures: string[] }>({
      name: "take_answer",
      schema,
      maxTokens: 3000,
      messages: [
        { role: "system", content: `You answer a student's questions about one analyzed recording.\n${GROUNDING_RULES}
Use pitchByNote and rhythmByEvent to compare every measured note or event, even when none crossed the threshold for a finding. Clearly distinguish the largest measured deviation from an actual flagged mistake.
For questions about the hardest written passage or what looks hardest in the sheet music, compare scoreByMeasure using note density, shortest values, leaps, range, tuplets, rhythms, rests, and tempo. Call this score-derived difficulty, not proof of what felt hardest to the player.
For questions about the hardest performed passage, use the per-note and per-event performance measurements instead. If both meanings are plausible, briefly answer both.
Do not cite an unrelated finding merely because it is the only finding. If the data cannot answer the question, say so and say what would be needed. Politely steer off-topic questions back to this take.` },
        { role: "user", content: digestMessage(result, text(body.title, 100) || "Untitled take") },
        { role: "assistant", content: "I have the analysis. What would you like to know about this take?" },
        ...history,
      ],
    });
    return { answer: text(reply.answer, 1500), evidence: resolveRefs(result, reply.findingIds, reply.measures) };
  });
}
