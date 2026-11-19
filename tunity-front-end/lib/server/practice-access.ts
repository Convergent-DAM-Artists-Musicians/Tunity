import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { TRIAL_MS } from "../account-model";
// Token verification needs the public Firebase signing keys, not a service-account key file.
export async function practiceAccess(
  request: Request,
  { allowUnstartedTrial = false }: { allowUnstartedTrial?: boolean } = {},
): Promise<Response | null> {
  const match = request.headers.get("authorization")?.match(/^Bearer (\S+)$/);
  if (!match) return Response.json({error:"Sign in to use the analyzer."},{status:401});
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tunity-e6b39";
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL)
    process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL).host;
  const app = getApps().find(a=>a.name === "tunity-token-verifier") || initializeApp({projectId},"tunity-token-verifier");
  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(match[1]);
    if (decoded.firebase.sign_in_provider === "anonymous") throw new Error("Account required.");
    uid = decoded.uid;
  }
  catch { return Response.json({error:"Your sign-in could not be verified. Sign in again."},{status:401}); }
  try {
    const emulator = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
    const base = emulator ? `http://${emulator}` : "https://firestore.googleapis.com";
    const response = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/accounts/${encodeURIComponent(uid)}`,{
      headers:{authorization:`Bearer ${match[1]}`},cache:"no-store",signal:AbortSignal.timeout(10000),
    });
    if (!response.ok) return Response.json({error:"Your band account could not be loaded."},{status:403});
    const data = (await response.json()).fields;
    const plan = data?.plan?.stringValue;
    const start = Date.parse(data?.trialStartedAt?.timestampValue || "");
    const unstartedTrial =
      plan === "trial" &&
      data?.trialStartedAt?.nullValue === null &&
      allowUnstartedTrial;
    const activeTrial =
      plan === "trial" &&
      Number.isFinite(start) &&
      Date.now() < start + TRIAL_MS;
    if (plan !== "demo" && !unstartedTrial && !activeTrial)
      return Response.json({error:"Start your trial with an upload, or upgrade if your trial has ended."},{status:403});
    return null;
  } catch { return Response.json({error:"Account verification is temporarily unavailable. Try again."},{status:503}); }
}
