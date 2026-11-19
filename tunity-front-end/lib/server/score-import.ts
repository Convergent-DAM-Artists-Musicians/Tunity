import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ImportedScore } from "../studio/score";
import { AiError } from "./openai";

const run = promisify(execFile);
export const SCORE_EXTENSIONS = [".xml", ".musicxml", ".mxl"];

/** Imports MusicXML/MXL with the backend analyzer's own parser, so studio scores match analysis. */
export async function importScore(bytes: Uint8Array, extension: string, options: { partId?: string; tempoBpm?: number } = {}): Promise<ImportedScore> {
  if (!SCORE_EXTENSIONS.includes(extension)) throw new AiError("Use a MusicXML (.musicxml, .xml) or MXL score.", 400);
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new AiError("Score must be a nonempty file under 2 MB.", 400);
  const folder = await mkdtemp(join(tmpdir(), "tunity-score-"));
  try {
    const path = join(folder, `score${extension}`);
    await writeFile(path, bytes);
    const cli = resolve(process.env.TUNITY_BACKEND_DIR || "../back-end", "src/score-json.ts");
    try {
      const { stdout } = await run(process.env.TUNITY_NODE_PATH || "node", [cli, path, JSON.stringify(options)], {
        timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      });
      return JSON.parse(stdout) as ImportedScore;
    } catch (error) {
      const message = (error as { stderr?: string }).stderr?.trim().split("\n").at(-1);
      throw new AiError(message ? `This score could not be read: ${message}` : "This score could not be read.", 422);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
