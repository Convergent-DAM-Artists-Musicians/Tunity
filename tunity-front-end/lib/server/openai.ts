export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const model = () => process.env.OPENAI_MODEL || "gpt-5.4-mini";

/** Calls the Chat Completions API with a strict JSON schema and returns the parsed object. */
export async function structured<T>({ name, schema, messages, maxTokens = 4000, effort = "low" }: {
  name: string;
  schema: object;
  messages: ChatMessage[];
  maxTokens?: number;
  effort?: "minimal" | "low" | "medium";
}): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiError("AI features need OPENAI_API_KEY in tunity-front-end/.env.local. Restart Next.js after adding it.", 503);
  const reasoning = /^(gpt-5|gpt-6|o\d)/.test(model());
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model(),
        messages,
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        max_completion_tokens: maxTokens,
        ...(reasoning ? { reasoning_effort: process.env.OPENAI_REASONING_EFFORT || effort } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  } catch {
    throw new AiError("The AI service did not respond. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Tunity AI: OpenAI request failed", response.status, body?.error?.code ?? body?.error?.type);
    if (response.status === 401) throw new AiError("The OpenAI API key was rejected. Update OPENAI_API_KEY and restart Next.js.", 503);
    if (response.status === 429) throw new AiError("The AI service is rate limited or out of credit. Try again shortly.", 429);
    throw new AiError("The AI service could not complete this request.");
  }
  const choice = body.choices?.[0];
  if (choice?.message?.refusal) throw new AiError("The AI declined this request. Rephrase it as a practice question.", 422);
  if (choice?.finish_reason === "length") throw new AiError("The AI response was cut off. Try a shorter request.");
  try {
    return JSON.parse(choice.message.content) as T;
  } catch {
    throw new AiError("The AI returned an unreadable response. Try again.");
  }
}
