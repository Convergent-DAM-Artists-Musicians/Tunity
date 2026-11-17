import { aiRoute, readJson, text } from "@/lib/server/ai-route";
import { AiError, structured } from "@/lib/server/openai";
import { readResult } from "@/lib/studio/analysis";
import { comparable, compareTakes, comparisonDigest, type ComparedFinding } from "@/lib/studio/compare";
import type { ComparisonRef } from "@/lib/studio/types";

export const maxDuration = 120;

const point = {
  type: "object",
  additionalProperties: false,
  required: ["text", "refs"],
  properties: { text: { type: "string" }, refs: { type: "array", items: { type: "string" } } },
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "improvements", "remaining", "nextFocus"],
  properties: {
    headline: { type: "string", description: "One sentence on the overall change." },
    improvements: { type: "array", items: point },
    remaining: { type: "array", items: point },
    nextFocus: { type: "string", description: "What to practice before the next take." },
  },
};
type Point = { text: string; refs: string[] };

export async function POST(request: Request) {
  return aiRoute(request, "compare", async () => {
    const body = await readJson<{ before?: { name?: unknown; result?: unknown }; after?: { name?: unknown; result?: unknown } }>(request, 3_000_000);
    let before, after;
    try { before = readResult(body.before?.result); after = readResult(body.after?.result); }
    catch (e) { throw new AiError((e as Error).message, 400); }
    const problem = comparable(before, after);
    if (problem) throw new AiError(problem, 400);
    const comparison = compareTakes(before, after);
    const beforeName = text(body.before?.name, 100) || "Earlier take", afterName = text(body.after?.name, 100) || "Later take";
    const reply = await structured<{ headline: string; improvements: Point[]; remaining: Point[]; nextFocus: string }>({
      name: "take_comparison",
      schema,
      maxTokens: 5000,
      messages: [
        { role: "system", content: `You compare two analyzed recordings of the same score for a student musician.
Use only the supplied comparison JSON. Never invent numbers or measures; quote metrics exactly as given.
Cite refs exactly as given: R# (resolved since the earlier take), P# (still present), N# (new in the later take), M:<id> (metrics).
Finding counts can change with tempo and detection confidence; prefer per-note metrics and repeated measures over single flags.
Give at most four improvements and four remaining issues, each under 35 words.` },
        { role: "user", content: JSON.stringify(comparisonDigest(comparison, beforeName, afterName)) },
      ],
    });
    const lookup = new Map<string, ComparedFinding & { side: "before" | "after" }>();
    comparison.resolved.forEach((f) => lookup.set(f.ref, { ...f, side: "before" }));
    comparison.persisting.forEach((p) => lookup.set(p.after.ref, { ...p.after, side: "after" }));
    comparison.added.forEach((f) => lookup.set(f.ref, { ...f, side: "after" }));
    const metricIds = new Set(comparison.metrics.map((m) => `M:${m.id}`));
    const refs = (ids: string[]) => [...new Set(ids)].flatMap((id): ComparisonRef[] => {
      const f = lookup.get(id);
      if (f) return [{
        id, side: f.side, category: f.category, measure: f.measure, beat: f.beat, expectedId: f.expectedId,
        startSec: f.startSec, endSec: f.endSec, message: f.message,
        label: `${f.measure ? `M${f.measure}` : `${f.startSec.toFixed(2)}s`} · ${f.kind.replaceAll("_", " ")}`,
      }];
      return metricIds.has(id) ? [{ id, side: "after", label: comparison.metrics.find((m) => `M:${m.id}` === id)!.label }] : [];
    }).slice(0, 6);
    const points = (list: Point[]) => list.slice(0, 4).map((p) => ({ text: text(p.text, 300), evidence: refs(p.refs) }));
    return {
      headline: text(reply.headline, 300),
      improvements: points(reply.improvements),
      remaining: points(reply.remaining),
      nextFocus: text(reply.nextFocus, 400),
    };
  });
}
