import { practiceAccess } from "@/lib/server/practice-access";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { promisify } from "node:util";
import { MAX_AUDIO_BYTES, prepareAudio } from "@/lib/audio-model";

// Node.js is the default runtime.
// Explicit runtime config conflicts with this repo's Cache Components setting.
export const maxDuration = 240;

const run = promisify(execFile);
const MAX_UPLOAD = MAX_AUDIO_BYTES;
let busy = false;

export async function POST(request: Request) {
  const denied = await practiceAccess(request);
  if (denied) return denied;
  if (busy) {
    return Response.json(
      { error: "The analyzer is busy. Please try again shortly." },
      { status: 429 },
    );
  }

  if (
    Number(request.headers.get("content-length")) >
    MAX_UPLOAD + 3 * 1024 * 1024
  ) {
    return Response.json(
      { error: "Please choose a recording up to 500 KiB." },
      { status: 413 },
    );
  }

  let folder: string | undefined;
  busy = true;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const reference = form.get("reference");
    // All uploads receive the same analysis. Legacy mode fields are ignored.

    if (!(audio instanceof File) || !audio.size || audio.size > MAX_UPLOAD) {
      return Response.json(
        { error: "Choose a nonempty audio recording up to 500 KiB." },
        { status: 400 },
      );
    }

    try {
      const prepared = await prepareAudio(audio);
      if (prepared.info.contentType.startsWith("video/")) throw new Error("Video uploads are supported for playback; analysis currently accepts audio only.");
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Invalid audio file.",
        },
        { status: 400 },
      );
    }

    if (
      reference &&
      (!(reference instanceof File) || reference.size > 2 * 1024 * 1024)
    ) {
      return Response.json(
        { error: "Reference score must be under 2 MB." },
        { status: 400 },
      );
    }

    const referenceExtension = reference instanceof File ? extname(reference.name).toLowerCase() : "";
    if (reference && ![".json", ".xml", ".musicxml", ".mxl"].includes(referenceExtension)) return Response.json({error:"Use a reviewed JSON or MusicXML/MXL score. PDFs are stored separately."},{status:400});
    if (reference instanceof File && referenceExtension === ".json") {
      try {
        JSON.parse(await reference.text());
      } catch {
        return Response.json(
          { error: "The reference file is not valid JSON." },
          { status: 400 },
        );
      }
    }

    folder = await mkdtemp(join(tmpdir(), "tunity-upload-"));
    const input = join(folder, "recording");
    await writeFile(input, Buffer.from(await audio.arrayBuffer()));

    const args = [
      resolve(
        process.env.TUNITY_BACKEND_DIR || "../back-end",
        "src/cli/web-demo.ts",
      ),
      input,
    ];

    if (reference instanceof File) {
      const refPath = join(folder, `reference${referenceExtension}`);
      await writeFile(refPath, Buffer.from(await reference.arrayBuffer()));
      args.push(refPath);
    } else args.push("");
    args.push("performance");

    await access(args[0]);

    const { stdout } = await run(process.env.TUNITY_NODE_PATH || "node", args, {
      timeout: 230_000,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
      windowsHide: true,
    });

    return Response.json(JSON.parse(stdout));
  } catch (error) {
    console.error("Tunity analysis:", error);
    return Response.json(
      {
        error:
          "Analysis could not complete. Check the recording and reference, and confirm that Node 24+, FFmpeg and the Python environment for analysis are configured. See the server log for details.",
      },
      { status: 422 },
    );
  } finally {
    try {
      if (folder) await rm(folder, { recursive: true, force: true });
    } finally {
      busy = false;
    }
  }
}
