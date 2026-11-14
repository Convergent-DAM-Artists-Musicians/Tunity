import { readFile, writeFile } from "node:fs/promises";
const request = JSON.parse(
  await readFile(process.argv[process.argv.indexOf("--request") + 1], "utf8"),
);
const pcm = await readFile(request.pcmPath);
if (pcm.readFloatLE(0) === 0.5)
  await new Promise((resolve) => setTimeout(resolve, 10000));
await writeFile(
  request.outputPath,
  JSON.stringify({
    engine: "spectral-yin-v1",
    hopSec: 0.005,
    notes: [],
    silenceThresholdDb: pcm.readFloatLE(0) === 1 ? null : -55,
    warnings: [],
  }),
);
