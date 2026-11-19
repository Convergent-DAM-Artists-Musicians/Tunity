import { practiceAccess } from "./practice-access";
import { AiError } from "./openai";

let inFlight = 0;
const MAX_IN_FLIGHT = 4;

/** Shared guard for AI routes: account access, server-side key, concurrency and error mapping. */
export async function aiRoute(request: Request, label: string, handler: () => Promise<unknown>) {
  const denied = await practiceAccess(request, { allowUnstartedTrial: true });
  if (denied) return denied;
  if (!process.env.OPENAI_API_KEY)
    return Response.json({ error: "AI features need OPENAI_API_KEY in tunity-front-end/.env.local. Restart Next.js after adding it." }, { status: 503 });
  if (inFlight >= MAX_IN_FLIGHT)
    return Response.json({ error: "The AI studio is busy. Try again in a moment." }, { status: 429 });
  inFlight++;
  try {
    return Response.json(await handler());
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.status });
    console.error(`Tunity AI ${label}:`, error instanceof Error ? error.message : error);
    return Response.json({ error: "The AI studio could not complete this request." }, { status: 500 });
  } finally {
    inFlight--;
  }
}

export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AiError("Request is too large.", 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new AiError("Request is too large.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("Request body must be JSON.", 400);
  }
}

export const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
