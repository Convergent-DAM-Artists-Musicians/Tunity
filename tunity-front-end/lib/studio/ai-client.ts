import { getFirebaseAuth } from "../firebase";

/** POST to a Tunity AI route with the signed-in user's token. The OpenAI key never leaves the server. */
export async function aiPost<T>(path: string, body: object | FormData): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in to use the AI studio.");
  const form = body instanceof FormData;
  const response = await fetch(path, {
    method: "POST",
    headers: { authorization: `Bearer ${await user.getIdToken()}`, ...(form ? {} : { "content-type": "application/json" }) },
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The AI studio could not complete this request.");
  return data as T;
}
