import { analysisDigest, findingRef, measureRef, measures, type AnalysisResult, type EvidenceRef } from "../studio/analysis";

export const GROUNDING_RULES = `Ground every statement in the supplied analysis JSON, which was measured by signal-processing analyzers.
- Never invent pitches, timings, cents, tempos, measures, scores or findings. Quote a number only if it appears in the data.
- Cite supporting finding ids (F1, F2, ...) exactly as given. Only cite measures that appear in the data.
- Findings with status "review" are uncertain; say "may" for them. "likely" findings are stronger evidence.
- If recording.usable is false or alignment is ambiguous, say the measurements are unreliable and recommend re-recording first.
- If hasReference is false, written rhythm and pitch correctness cannot be judged; suggest attaching a reviewed MusicXML score.
- Do not judge tone quality, embouchure, breath support or posture; the analyzers do not measure them.
- Write for a student musician in plain language.`;

export function digestMessage(result: AnalysisResult, title: string) {
  return `Analysis JSON for the take "${title}":\n${JSON.stringify(analysisDigest(result, title))}`;
}

/** Keep only citations that exist in this result; resolve their location from the data. */
export function resolveRefs(result: AnalysisResult, findingIds: unknown, measureLabels: unknown = []): EvidenceRef[] {
  const known = new Set(measures(result));
  const refs: EvidenceRef[] = [];
  for (const id of Array.isArray(findingIds) ? findingIds : []) {
    const ref = typeof id === "string" ? findingRef(result, id.trim()) : undefined;
    if (ref && !refs.some((r) => r.id === ref.id)) refs.push(ref);
  }
  for (const m of Array.isArray(measureLabels) ? measureLabels : []) {
    const label = typeof m === "string" ? m.replace(/^(measure|m)\s*/i, "").trim() : "";
    const ref = known.has(label) && !refs.some((r) => r.measure === label) ? measureRef(result, label) : undefined;
    if (ref) refs.push(ref);
  }
  return refs.slice(0, 8);
}
