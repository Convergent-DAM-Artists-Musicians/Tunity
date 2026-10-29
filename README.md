# Solo trumpet analyzer — CREPE edition

An independent copy of the original music analyzer. The original `music-analyzer` folder is preserved. This edition replaces its basic YIN pitch estimator with **torchcrepe**, the PyTorch implementation of CREPE. It retains audio extraction, sheet-music import, note alignment, and the same seven requested feedback categories, plus missing/extra notes.

**Scope:** one player, one pitched melodic line, offline clips up to 120 seconds. No accompaniment, band transcription, or timbre-quality grading. This is a working integration baseline, not a trumpet-accuracy claim.

## Setup

Requirements:

- Node.js 24+ (native TypeScript execution).
- A Python version supported by your chosen PyTorch distribution.
- Matching `torch` and `torchaudio` installations for CPU or CUDA, using the [official PyTorch installation selector](https://pytorch.org/get-started/locally/).
- FFmpeg on PATH, or its executable path in `FFMPEG_PATH`.
- Audiveris only if importing PDF/image scores; MusicXML does not need it.

From this folder, on Windows PowerShell:

```powershell
npm install
python -m venv .venv

# Install a matching CPU pair, or use the command from the PyTorch selector for CUDA.
.\.venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r python/requirements.txt

$env:PYTHON_PATH = (Resolve-Path .\.venv\Scripts\python.exe).Path
# Only if FFmpeg isn't already on PATH:
# $env:FFMPEG_PATH = 'C:\your-installation\ffmpeg.exe'

npm test
& $env:PYTHON_PATH -m unittest discover -s python -p 'test_*.py'
$env:RUN_CREPE_INTEGRATION = '1'
npm test
npm run demo
```

On Linux/macOS, the environment's interpreter is `.venv/bin/python`; set `PYTHON_PATH` to its absolute path and use the appropriate PyTorch installation command. Save the resolved Python dependency versions after validating your deployment; `requirements.txt` pins torchcrepe but leaves platform-specific PyTorch selection to you.

`npm run demo` generates synthetic audio and runs the real model. It fails clearly if dependencies are missing; it does not fall back to YIN. `npm run demo:fixture` needs no Python ML packages and exercises scoring using explicitly labeled oracle pitch frames. It is not model inference. `analysis.example.json` is likewise labeled as a fixture.

## Analyze an uploaded recording

Download the authenticated user's Storage object into a worker-owned local directory, then run:

```powershell
npm run analyze -- performance.wav reference.example.json 10 15 analysis.json
```

Audio and video supported by your FFmpeg build are accepted. The numeric arguments select original-file seconds `[10, 15)`. Expected note times are relative to that selected clip. Use the reference corresponding to the exercise the user actually played.

## TypeScript backend API

```ts
import { analyzeFile } from './src/index.ts';

const result = await analyzeFile(
  downloadedRecordingPath,
  { startSec: 10, endSec: 15 },
  reference.notes,
  {
    tuningHz: 440,
    pitchToleranceCents: 25,
    timingToleranceMs: 70,
    minConfidence: 0.3, // CREPE periodicity; calibrate on your recordings.
  },
  {
    pythonPath: serverPythonExecutable,
    model: 'full',    // 'tiny' is also available; benchmark both.
    device: 'cpu',    // Or 'cuda:0' with a compatible installation.
    batchSize: 256,
    threads: 2,
    timeoutMs: 180000,
  },
);
```

Both `analyzeFile` and `analyzeClip` are now **asynchronous**. `analyzeClip` accepts finite mono 16 kHz Float32 PCM. `extractAudioClip` now defaults to 16 kHz; keep that sample rate for this pipeline. If you supply already-decoded audio at another rate, resample it before calling `analyzeClip`. No changes to React or your database are needed to store the structured result.

Run this in your background worker, not on the request event loop. The process currently loads the model once per analysis job. For higher throughput, a persistent Python service could reuse loaded models; benchmark before adding that complexity. Authorize Storage ownership before downloading, use idempotent job keys, and delete downloaded source files in your job's `finally` block.

## How this edition works

```text
Recording → FFmpeg → mono 16 kHz unnormalized PCM
                              │
                 Python torchcrepe worker
                              │
               Pitch + periodicity every 10 ms
                              │
       Raw-audio energy gate + note segmentation
                              │
          Reference alignment → structured feedback
```

- `src/crepe.ts` writes little-endian float PCM and a request into a per-job temporary folder, launches Python without a shell, bounds the response, validates every returned timestamp/value, and cleans up. Executable and worker paths are server configuration, never HTTP input.
- `python/crepe_worker.py` calls `torchcrepe.predict` with centered frames, Viterbi decoding, a 160-sample hop, and full/tiny model selection. It preserves continuous frequency estimates for cents-level scoring and returns periodicity. It trims an optional frame at EOF to avoid a timestamp beyond the clip.
- `src/notes.ts` measures onset energy and relative levels from the original waveform. Energy gating suppresses pitches in silence, even if CREPE reports high confidence. Pitch changes must persist for three frames; strong energy reattacks can separate repeated notes. When enough frames exist, pitch/dynamics aggregation excludes the first 30 ms and final 20 ms.
- `src/analyzer.ts` aligns events against the reference and computes deterministic findings. `analyzePitchTrack` is a synchronous entry point for scoring a validated cached track, separate from running inference.

The default frequency range is 65–1800 Hz; torchcrepe options here are restricted to 50–2006 Hz. That range must cover the player's actual **sounding** pitches. Do not narrowly constrain the detector around each expected note, because that can conceal wrong notes. The 0.3 periodicity threshold is a starting configuration, not a calibrated probability or a validated trumpet threshold.

## Trumpet reference and transposition

All numeric MIDI pitches passed to the analyzer are **concert/sounding pitches**. For a B-flat trumpet, the importer applies a MusicXML `<transpose><chromatic>-2</chromatic></transpose>` declaration. Do not subtract two semitones a second time. If a scan's recognition output omits or misreads transposition, correct it during score review. A C trumpet requires different reference metadata.

```powershell
npm run import-score -- examples/trumpet-bb.musicxml reference.trumpet.json
```

The example is written C5–D5–E5, sounding B-flat4–C5–D5, at quarter = 90. Its imported notes can be selected and shifted for a count-in:

```ts
import { importSheetMusic, referenceForScorePassage, analyzeFile } from './src/index.ts';

const score = await importSheetMusic(downloadedScorePath, {
  partId: 'P1', voice: '1', staff: '1',
  // tempoBpm: 90, // Overrides all score tempos when explicitly set.
  // omr: serverAudiverisConfiguration, // Required for PDFs/images.
});

// Show score.notes / score.warnings for review and correction first.
// After review, select a complete score passage; do not cut notes or ties.
const reference = referenceForScorePassage(score, 0, score.durationSec, 1);
const result = await analyzeFile(downloadedAudioPath,
  { startSec: 0, endSec: score.durationSec + 1 }, reference);
```

The count-in establishes expected onset times. Do not also apply the same lead-in with `referenceOffsetSec`. No automatic alignment step removes a globally late entrance. The API's feedback currently reports concert MIDI numbers; the frontend should display written trumpet names using the score's transposition.

## Sheet-music input retained from the original

MusicXML (`.musicxml`/`.xml`) and compressed `.mxl` import directly. PDF/PNG/JPEG/TIFF require [Audiveris](https://github.com/Audiveris/audiveris), configured via the server-owned `omr` command. Its [documented CLI](https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/) is invoked with batch/transcribe/export flags. The adapter accepts a native executable or direct Java invocation, not Windows `.bat`/`.cmd` launchers.

Example server settings JSON:

```json
{
  "omr": {
    "executable": "/opt/audiveris/bin/Audiveris",
    "timeoutMs": 180000
  },
  "partId": "P1",
  "voice": "1",
  "tempoBpm": 90
}
```

Replace that executable path with your actual installation. Then use:

```sh
npm run import-score -- uploaded-sheet.pdf reference.json score-settings.json
```

Recognition is fallible, so imported scores include `requiresReview: true`. The importer handles rests, explicit accidentals, ties, divisions/durations, tempo changes and transposition. Select one part/voice/staff. It rejects chords, repeats/alternate endings, navigation signs, grace notes, and some advanced notation instead of inventing a playback reference. Use an unfolded, simplified score for those cases. Text/expressive notation may require manual review. No React upload or score-correction UI is included.

Printed dynamics are not automatically converted into acoustic levels. Supply explicit `dynamicsDb` targets, or a teacher-defined `dynamicsDbByMark` mapping at import, when grading relative dynamics. At least three matched target-bearing notes are required.

## Feedback and practical limits

The same categories are retained: `wrong_note`, `sharp`, `flat`, `early`, `late`, `missed_entrance`, `uneven_dynamics`, plus `missing_note` and `extra_note`. Findings include clip-relative and original-upload timestamps. Unmatched notes have confidence zero and request review. Audible low-confidence passages produce uncertainty warnings. Confidence is periodicity, not the probability that an error judgment is correct.

Segmentation and alignment remain baseline methods. Tonguing without a clear energy dip, fast/slurred passages, breath noise, vibrato, microphone gain processing, clipping, and large tempo deviations can cause errors. In particular, CREPE's 10 ms output spacing does not guarantee 10 ms onset accuracy. The alignment pairs onsets within an 800 ms window and may otherwise report omissions/extras. Validate on musician-annotated trumpet recordings before grading players.

## Verification

- `npm test`: deterministic pitch-track postprocessing, all feedback categories, silence gating, score import, subprocess contract/failure handling. Stub/oracle tests explicitly do not perform ML inference.
- `python -m unittest discover -s python -p 'test_*.py'`: worker input/serialization tests using only the standard library.
- `RUN_CREPE_INTEGRATION=1 npm test` (set the environment appropriately for your shell): real model test on generated A4. Opt-in so a missing ML installation is not mistaken for a model failure.
- The real FFmpeg test runs automatically when FFmpeg is available. Actual Audiveris recognition also needs validation against real sheets.

At creation, TypeScript tests passed 31 checks with the real CREPE and FFmpeg tests skipped because those dependencies were not installed in the authoring environment. Three Python protocol/validation tests passed. No improvement in real trumpet accuracy is claimed from these tests.

Sources: [torchcrepe usage/decoding](https://github.com/maxrmorrison/torchcrepe), [CREPE](https://github.com/marl/crepe), [MusicXML duration semantics](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/duration/).
