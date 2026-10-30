import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";

// Node.js is the default runtime.
// Explicit runtime config conflicts with this repo's Cache Components setting.
export const maxDuration = 240;

const run = promisify(execFile);
const MAX_UPLOAD = 25 * 1024 * 1024;
let busy = false;

export async function POST(request: Request) {
  if (busy) {
    return Response.json(
      { error: "The analyzer is busy. Please try again shortly." },
      { status: 429 },
    );
  }

  if (Number(request.headers.get("content-length")) > MAX_UPLOAD + 1024 * 1024) {
    return Response.json(
      { error: "Please choose a recording under 25 MB." },
      { status: 413 },
    );
  }

  let folder: string | undefined;
  busy = true;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const reference = form.get("reference");

    if (!(audio instanceof File) || !audio.size || audio.size > MAX_UPLOAD) {
      return Response.json(
        { error: "Choose a nonempty audio recording under 25 MB." },
        { status: 400 },
      );
    }

    if (reference && (!(reference instanceof File) || reference.size > 256 * 1024)) {
      return Response.json(
        { error: "Reference JSON must be under 256 KB." },
        { status: 400 },
      );
    }

    if (reference instanceof File) {
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
      resolve(process.env.TUNITY_BACKEND_DIR || "../back-end", "src/cli/web-demo.ts"),
      input,
    ];

    if (reference instanceof File) {
      const refPath = join(folder, "reference.json");
      await writeFile(refPath, await reference.text());
      args.push(refPath);
    }

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
    return Response.json({
      error: "Analysis could not complete. Check the recording and reference, and confirm that Node 24+, FFmpeg and the Python CREPE environment are configured. See the server log for details.",
    }, { status: 422 });
  } finally {
    try {
      if (folder) await rm(folder, { recursive: true, force: true });
    } finally {
      busy = false;
    }
  }
}
