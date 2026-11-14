# Rhythm analyzer

This feature lives in `back-end/rhythm-analyzer/`: `src/` contains detection orchestration, alignment, notation and the CLI; `python/` contains the audio worker; `tests/` holds regression tests; `evaluation/` holds acquisition scripts and measured results; `examples/` holds sample structured input. Shared extraction, score import and the public API remain in `back-end/src/`.

The workspace defaults to **Rhythm**. Upload an isolated solo recording and a reviewed score JSON to get note/measure/beat timing, duration, missing/extra-note and rest feedback. Without a reference it detects acoustic events only. Pitch grading remains on its existing separate path.

This implementation passed the evaluation gates in [the report](evaluation/REPORT.md). Its demonstrated scope is isolated trumpet, with score alignment validated on short checked passages. Confidence is heuristic; a high value does not certify a score import or an entire long performance.

## Install and run

From the repository root, use Node 24+, Python 3.11–3.13 (tested with 3.13), and FFmpeg:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r back-end/rhythm-analyzer/requirements.txt
npm ci --prefix back-end
npm ci --prefix tunity-front-end
export PYTHON_PATH="$PWD/.venv/bin/python"
export FFMPEG_PATH="$(command -v ffmpeg)"
cd tunity-front-end
npm run dev
```

Open `/workspace`, choose Rhythm, then select audio and reference JSON. The API accepts `audio`, optional `reference`, and `mode=rhythm` as multipart fields at `/api/analyze`. The UI analyzes the first 120 seconds, limits audio uploads to 25 MB and references to 256 KB, and offers a full JSON download. The local server needs Python and FFmpeg; a static-only host cannot run this pipeline. `TUNITY_BACKEND_DIR` and `TUNITY_NODE_PATH` can override the backend folder and Node executable. Torch/CREPE are **not required for rhythm**.

For a specific recording excerpt (times in seconds):

```sh
cd back-end
npm run analyze:rhythm -- recording.wav reference.json 0 30 result.json
```

The reference must describe that excerpt, starting at score beat zero. Audio source time is preserved in finding `sourceStartSec`; detected boundaries, target times and anchors are relative to the selected audio clip. `sourceStartSec` in the public API supplies the clip origin.

## Get a structured score

```sh
cd back-end
npm run import-score -- score.musicxml reference.json
```

MusicXML and compressed MXL are supported. Optional import settings select `partId`, `voice`, `staff`, and `tempoBpm` when the file lacks tempo (see `ScoreImportOptions` in `../src/score/score-xml.ts`). For a passage use a settings JSON such as:

```json
{"rhythmPassage":{"startBeat":0,"endBeat":8}}
```

Passage boundaries must not cut notes, ties or rests. Keep the original printed measure/beat labels. The old seconds-based `passage` option exports a legacy timed reference without rich rhythm metadata; use `rhythmPassage` for this feature.

The importer now preserves selected-voice rests, meter/tempo changes, dotted values, tuplets, slur/articulation metadata, and ties (one sounding event with all tied note IDs). It does not infer written values from elapsed time. Quarter-note beat units permit arbitrary valid tuplet ratios, including quadruplets in compound meter. A nominal quarter at 120 BPM and an eighth at 60 BPM can have the same elapsed duration; the score resolves the notation.

PDF/images still require a separately configured Audiveris executable through the existing `omr` import option. Its exports need review. No real optical-recognition accuracy is claimed here: the PDF subprocess contract is tested using a fixture, and the audio evaluation uses checked structured references. The web form currently accepts JSON, not raw score PDFs. Repeat/ending expansion, grace notes, polyphonic selection ambiguity and additive meters require explicit preprocessing or are rejected. Implicit gaps from MusicXML forward movements are not automatically labeled as explicit rests. Review those when preparing a reference.

A minimal standalone reference:

```json
{
  "events":[
    {"id":"m1-n1","kind":"note","startBeat":0,"durationBeats":1,
     "measure":"1","beat":1,"midi":60,"notation":{"type":"quarter"}},
    {"id":"m1-r1","kind":"rest","startBeat":1,"durationBeats":1,
     "measure":"1","beat":2}
  ],
  "tempoMap":[{"beat":0,"bpm":120}],
  "meterMap":[{"beat":0,"numerator":4,"denominator":4}],
  "rhythmOptions":{"alignmentMode":"fixed","referenceOffsetSec":1}
}
```

`startBeat` and `durationBeats` always use quarter-note units. `beat` is the one-based printed position in the meter denominator (e.g. eighth-note units in 6/8). `midi` is optional sounding pitch used only as a correspondence hint. `notation` may include `type`, `dots`, `actualNotes`, `normalNotes`, `slur`, and `articulation`; `tiedIds` retains the printed IDs behind a merged tie. A complete imported object with `.rhythm`, or the older `{notes:[{id,midi,startSec,endSec}]}` format, also works. Legacy timed references cannot supply trustworthy written values or measure locations.

## Pipeline and reusable outputs

1. Existing FFmpeg extraction produces mono 16 kHz PCM. The bounded Python worker uses a 5 ms hop, frequency-max-filtered positive spectral flux, adaptive energy gating, energy valleys and stable YIN pitch transitions. Harmonic movement/crescendos are suppressed as attack cues. Repeated pitches need acoustic rearticulation evidence; stable pitch changes can mark soft boundaries without an amplitude attack.
2. Beat positions are converted using the reference tempo map. Coarse tempo/offset search and sequence alignment handle insertions/deletions. Robust fitting and a slow local timing curve handle leading silence and moderate expressive timing. A stable pitch contour can initialize correspondence without producing pitch grades.
3. Matched events are compared to the mapped score. Early/late timing uses a default 70 ms tolerance plus boundary uncertainty. Duration uses sounding length (not absolute release displacement), allowing the greater of 120 ms or 30% for articulation. Marked staccato/staccatissimo/fermata durations are not graded as exact holds. Rest occupancy and unexpected internal silence are evaluated separately.

Public exports from `back-end/src/index.ts`: `detectRhythm`, `analyzeRhythmClip`, `alignRhythm`, `beatToSeconds`, `validateRhythmScore`, and `rhythmForScorePassage`, plus rhythm types. `detectRhythm` can feed other features without invoking alignment. `alignRhythm` accepts already detected events, allowing independent evaluation or future detectors.

The JSON preserves `detectedNotes` (onsets, releases, attack/transition evidence, uncertainty and offset confidence), `matches` (score IDs, original notation/tie IDs, measure/beat, target times, signed timing/duration differences), `alignment` (tempo multiplier, offset, local anchors, missing IDs, extra indices, ambiguity/confidence), `rests`, `findings`, and quality warnings. Positive timing error means late. `tempoScale` multiplies score seconds: 1.5 means the performance takes 1.5 times as long. The final anchor curve, rather than that global factor alone, gives expressive target timing.

Options: `alignmentMode` defaults to `automatic`; `expressiveTiming:false` disables local adaptation. `fixed` uses `referenceOffsetSec` and `tempoScale` as a known synchronization cue. Automatic mode estimates them and therefore cannot grade absolute entrance lateness or a consistent global tempo error. Automatic tempo search spans 0.5–2 times score duration. `timingToleranceMs` and `durationToleranceMs` can be set explicitly. Put these in `rhythmOptions` for the CLI/web reference, or pass them to the public function.

## Reproduce the evaluation

```sh
# From repository root; downloads roughly six isolated trumpet takes plus references.
.venv/bin/python -m pip install -r back-end/rhythm-analyzer/evaluation/requirements.txt
.venv/bin/python back-end/rhythm-analyzer/evaluation/run.py --acquire
npm test --prefix back-end
.venv/bin/python -m unittest discover -s back-end/rhythm-analyzer/python -p 'test_*.py'
```

`run.py` exits nonzero if an acceptance gate fails. Omit `--acquire` for subsequent local runs. Source audio stays in ignored `rhythm-analyzer/evaluation/data/`; the pinned URLs and SHA-256 checksums are in `acquisition.json`. Observe URMP's usage terms; audio is not redistributed in this repository. To re-run the original CREPE baseline, install its separate `back-end/requirements.txt` dependencies and add `--baseline`; delete `data/*.crepe.json` first to force fresh inference. Saved baseline results are included for comparison.

The runner produces full alignments, event detections, controlled WAVs, checked excerpt WAVs/scores and `results/summary.json`. For an actual trumpet demo after acquisition:

```sh
export PYTHON_PATH="$PWD/.venv/bin/python"
export FFMPEG_PATH="$(command -v ffmpeg)"
cd back-end
npm run analyze:rhythm -- rhythm-analyzer/evaluation/data/05-verified.wav rhythm-analyzer/evaluation/data/05-verified.score.json 0 8 /tmp/tunity-rhythm.json
```

Use those same two files in the web form. The recording ends before 8 seconds; extraction uses its available audio. `inspect_audio.py` regenerates waveform/spectrogram review images; `manual-review.json` and `verified-timings.json` preserve inspection decisions and timing uncertainty.

## Remaining failure cases

Very soft attacks, breath noise, fast/weak repeated notes, pitch slides and ambiguous slurs can split or merge events. Boundary type is acoustic evidence, not proof of tonguing technique. Same-pitch legato without a distinguishable attack is acoustically ambiguous. Release timing is less reliable than attacks in reverberation; duration findings explicitly ask for articulation review. Dense tuplets have less timing margin; the additional real tuplet passage scored 15/16 within 50 ms, below the short-passage alignment gate used on the main held-out set.

Noisy phones, accompaniment, different rooms/players, extreme tempos, extensive repeats/skips, and long rubato passages have not been established reliable by this test set. Full-take MIDI-to-annotation event lists contain omissions/merges; exploratory full-take alignment outputs are retained, but only checked passages support the reported alignment accuracy. Original unedited real performances do not have independently adjudicated mistake labels, so error-identification precision is measured on synthetic and edited-real controls. The checked timings are agent visual waveform/spectrogram review, not an independent musician listening study. Do not use a numerical confidence as an automatic correctness guarantee.

## Written values and tuplet feedback

The results include a **Your rhythm, note by note** table: whole, half, quarter, eighth, sixteenth, dotted and tied values, explicit tuplet ratios, mapped target length, actual sounding length and signed onset error. `rhythmEvents` includes rests and unmatched score notes; `matches` also includes `rhythmLabel` and `labelSource`. Labels are from notation or structured score beat durations, never guesses from acoustic seconds. Legacy timed references explicitly say “Written value unavailable.”

`rhythmGroups` evaluates complete contiguous runs of equal-value tuplets within one measure. It distinguishes uneven spacing, uniformly early/late groups, unmatched attacks, and spacing within tolerance. Uneven intervals also produce an `uneven_tuplet` finding. Adjacent onset differences are compared with the tempo-adjusted score, with a threshold at least the timing tolerance and twice boundary uncertainty. This can catch opposing small deviations even when neither note individually exceeds the early/late threshold. It does not grade the last note's release as a subdivision boundary; normal duration feedback covers releases. Mixed-value, nested, tied, cross-measure and incomplete *notated* tuplet groups remain individual events without a group-level verdict. Group boundaries in uninterrupted equal-value runs are chunked using the score's actual-note count; explicit bracket IDs are not currently retained.

After running the evaluation, upload `rhythm-analyzer/evaluation/data/control-uneven-triplet.wav` with its adjacent `.score.json`, or `control-uneven-quadruplet.wav` with its `.score.json`, to see deliberate unevenness. These are synthetic controls. `control-whole-through-sixteenth.wav` and its `.score.json` demonstrate ordinary and dotted value labels. The real `42-triplets.wav` and `42-triplets.score.json` demonstrate sextuplets and triplets; soft acoustic boundaries can still need review. Re-analyze older recordings to populate the new fields in the UI.
