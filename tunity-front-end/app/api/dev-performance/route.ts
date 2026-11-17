import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const RESULTS = resolve("../back-end/performance-analyzer/evaluation/results");
const AUDIO_DIRS = [
  resolve("../back-end/performance-analyzer/evaluation/data"),
  resolve("../back-end/rhythm-analyzer/evaluation/data"),
];

async function audioPath(name: string) {
  for (const dir of AUDIO_DIRS) {
    const path = resolve(dir, `${name}.wav`);
    try { await access(path); return path; } catch { /* try next */ }
  }
  return null;
}

const FEATURED = [
  "05-verified",
  "09-verified",
  "10-verified",
  "15-verified",
  "33-verified",
  "42-triplets",
  "control-uneven-quadruplet",
  "accent-absent",
  "accent-present",
  "staccato-clean",
  "staccato-long",
  "slur-connected",
  "slur-gap",
  "clean",
  "pitch-drift",
  "dynamics-even",
  "dynamics-loud",
];

/** Local fixture viewer only. No auth bypass for uploads or production analysis. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const url = new URL(request.url);

  if (url.searchParams.get("catalog") === "1") {
    try {
      const files = (await readdir(RESULTS)).filter((f) => f.endsWith(".wav.json"));
      const catalog = await Promise.all(files.map(async (file) => {
        const name = file.replace(/\.wav\.json$/, "");
        const raw = JSON.parse(await readFile(resolve(RESULTS, file), "utf8")) as {
          hasReference?: boolean;
          findings?: unknown[];
          durationSec?: number;
          insights?: { scoreKey?: string };
        };
        return {
          id: name,
          scoreKey: raw.insights?.scoreKey ?? null,
          findings: Array.isArray(raw.findings) ? raw.findings.length : 0,
          durationSec: raw.durationSec ?? 0,
          hasReference: !!raw.hasReference,
          hasAudio: !!(await audioPath(name)),
          featured: FEATURED.includes(name),
        };
      }));
      return Response.json(catalog.sort((a, b) => Number(b.featured) - Number(a.featured) || a.id.localeCompare(b.id)), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ error: "Run the performance evaluation to generate fixtures." }, { status: 404 });
    }
  }

  const name = url.searchParams.get("sample") ?? "05-verified";
  if (!/^[a-z0-9._-]+$/i.test(name)) return new Response(null, { status: 404 });
  const audio = url.searchParams.get("audio") === "1";
  const path = audio ? await audioPath(name) : resolve(RESULTS, `${name}.wav.json`);
  if (!path) return Response.json({ error: "Audio fixture missing for this sample." }, { status: 404 });
  try {
    return new Response(await readFile(path), {
      headers: {
        "Content-Type": audio ? "audio/wav" : "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Run the performance evaluation to generate this fixture." },
      { status: 404 },
    );
  }
}
