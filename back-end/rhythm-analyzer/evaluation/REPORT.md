# Rhythm evaluation results

All gates in [ACCEPTANCE.md](ACCEPTANCE.md) pass. Machine-readable results and implementation hashes are in [results/summary.json](results/summary.json). Run `python rhythm-analyzer/evaluation/run.py --acquire` from the backend using the installed evaluation environment to reproduce them. This is evidence for an isolated-trumpet prototype; it is not a claim of universal reliability.

## Failure reproduction and baseline

The original rhythm behavior depended on CREPE pitch segmentation, sustained pitch changes and an instantaneous 8 dB energy increase. Weak tonguing/repeated pitches could merge; changing pitch estimates could create false boundaries. Absolute expected seconds did not accommodate unknown lead-in or tempo. Rests and written rhythmic values were not preserved in the comparison. The original npm test glob pointed to `test/` while tests lived in `tests/`, allowing a successful command with zero executed tests; several moved-file imports and missing worker fixtures also prevented meaningful verification. Those integration faults are repaired.

The original detector was run on the two development recordings with actual CREPE inference, not simulated pitch frames. Event matching uses one-to-one minimum-cost assignment and a 50 ms maximum absolute onset difference. A prediction cannot match multiple labels.

| Development take | Annotated events | Original TP / FP / FN | Original F1 | New TP / FP / FN | New F1 |
|---|---:|---:|---:|---:|---:|
| 05 Entertainer | 181 | 177 / 0 / 4 | 0.989 | 178 / 2 / 3 | 0.986 |
| 09 Jesus | 56 | 36 / 21 / 20 | 0.637 | 53 / 2 / 3 | 0.955 |

The improvement is substantial on the problematic second take; the first take has a small precision regression. The new detector was iterated using development waveforms/labels, including overly early backtracking, false transitions during attack instability, repeated-note energy valleys, and soft transitions. Its acoustic parameters were frozen before the three held-out takes were evaluated. The additional tuplet recording was acquired afterward without acoustic retuning. Later feedback-layer fixes were driven by controlled errors: whole-note shifts must not create spurious duration errors, and brief notes inside long rests must still count as occupancy.

## Data and reference procedure

[URMP, University of Rochester](https://labsites.rochester.edu/air/projects/URMP.html) supplies isolated instrument recordings, note timing annotations, MIDI and score PDFs. See the [dataset documentation](https://labsites.rochester.edu/air/projects/URMP/URMP_doc.pdf). Acquisition uses the pinned mirror revision and checksums in [acquisition.json](acquisition.json); the script downloads only first-trumpet WAVs and their references. Audio is ignored by git and not redistributed. Downloading remains subject to the source's terms and availability.

Development takes: 05 and 09. Held-out takes: 10, 15 and 33. Fixed excerpts retain the original beginning and all intervening rests, ending between whole annotated notes before 59 seconds. They are different pieces/takes, not established unseen musicians or microphones. The original audio is resampled to 16 kHz without retiming. `clips.json` specifies exact endpoints.

The score reference is derived from the independent MIDI, with small playback-gate shortening snapped to nearby standard notated durations. It is not a rhythm quantized from performed onset times. Full MIDI/annotation sequences diverge through missing/merged labels and score/performance differences, so full-take automatic score outputs are exploratory, not alignment ground truth. For alignment evaluation, 87 initial events across the five recordings were separately checked against source score order and visible waveform/spectrogram boundaries. Selection and review notes are in [manual-review.json](manual-review.json), with the timing table in [verified-timings.json](verified-timings.json). This was agent visual inspection with source annotations visible and detector predictions hidden; it is not independent human listening. Typical review uncertainty is 25 ms, 35 ms in the supplementary tuplet excerpt.

Original annotations remain unchanged in primary onset metrics, including identified defects: two breath/noise labels and a merged repeated D in take 09, plus an ambiguous slur boundary in 05. The soft 09 onset near 19.1 seconds has a visibly earlier acoustic beginning. These are disclosed rather than silently corrected to improve scores.

## Onsets on unedited held-out recordings

| Take | Truth / predictions | TP | FP | Missed | Precision | Recall | F1 | Matched mean absolute error |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 March | 169 / 167 | 165 | 2 | 4 | 0.988 | 0.976 | 0.982 | 5.7 ms |
| 15 Surprise | 122 / 123 | 119 | 4 | 3 | 0.967 | 0.975 | 0.971 | 5.7 ms |
| 33 Elise | 69 / 71 | 68 | 3 | 1 | 0.958 | 0.986 | 0.971 | 10.8 ms |
| Combined | 360 / 361 | 352 | 9 | 8 | **0.975** | **0.978** | **0.976** | — |

Sensitivity to matching tolerance (combined held-out takes):

| Tolerance | TP / FP / missed | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| 25 ms | 333 / 28 / 27 | 0.922 | 0.925 | 0.924 |
| 50 ms | 352 / 9 / 8 | 0.975 | 0.978 | 0.976 |
| 100 ms | 357 / 4 / 3 | 0.989 | 0.992 | 0.990 |

Matched timing error excludes missed events; it must not be read as average accuracy over every note. Multiple notes from the same recording are correlated, and this small sample does not support population-wide confidence intervals.

## Score alignment, separately from onset detection

A correct correspondence requires the right score note ID **and** an onset within 50 ms of that note's reference timing. Counting total matches alone would conceal shifts to the wrong repeated phrase.

| Checked subset | Reference-time events | Detected events |
|---|---:|---:|
| Development: 36 notes | 36/36 | 35/36 |
| Held-out: 51 notes | **51/51 (100%)** | **49/51 (96.1%)** |

The oracle case supplies source event times to the same aligner, isolating alignment from the acoustic detector. These percentages describe only the verified passages, not all 360 held-out onsets. Full-take outputs are retained as `results/{id}.alignment.json` for inspection and integration, but their IDs do not constitute independently verified ground truth. Local curve outputs preserve tempo and onset residuals for other features.

Synthetic alignment tests additionally cover leading silence and duration multipliers 0.65, 1 and 1.6, deletion/insertion without shifting later IDs, and fixed-cue source timestamps. The controlled waveform suite runs patterns at 72, 120 and 180 quarter-notes/minute. It includes quarters, eighths, sixteenths, dotted values, rests, tied durations, eighth triplets, and a separate 6/8 quadruplet case (4:6 eighths). Notation is preserved from the reference; it is never guessed uniquely from elapsed time.

## Error identification

The detector runs on each controlled waveform before score comparison. A finding must have the expected kind and score ID; duplicate or wrong-kind findings count as false positives. Synthetic controls use automatic synchronization. Edited-real controls use a fixed cue and verified original acoustic timings to isolate error identification; that reference is explicitly audio-timed, not an independent notated score.

| Finding kind | Synthetic TP / FP / FN | Edited-real TP / FP / FN |
|---|---:|---:|
| Early | 1 / 0 / 0 | 1 / 0 / 0 |
| Late | 1 / 0 / 0 | 1 / 0 / 0 |
| Incorrect duration | 1 / 0 / 0 | 1 / 0 / 0 |
| Missing note | 1 / 0 / 0 | 1 / 0 / 0 |
| Extra note | 2 / 0 / 0 | 1 / 0 / 0 |
| Misplaced rest | 2 / 0 / 0 | 2 / 0 / 0 |
| Uneven tuplet group | 2 / 0 / 0 | Not tested |

Thus 10/10 synthetic and 7/7 edited-real expected findings were identified, with no additional findings. This is a small deterministic suite, not an estimate of mistake-detection accuracy in natural student performances. Editing cases reuse one real development passage; they are not additional independently played recordings. Insertion inside a rest intentionally produces both extra-note and rest-occupancy findings. Clean waveform controls had **0 false findings across 94 notes**. Continuous no-gap synthetic slurs produced all three boundaries; crescendo and changing harmonic-balance controls produced one note each, without false splits. Quadruplets produced 12/12 onsets and correspondences. There is no separate unedited real quadruplet example.

Original real recordings do not have musician-adjudicated mistake labels. Their reported findings may represent expressive articulation, true departures, detector errors or reference problems; they are not counted as confirmed mistakes or clean false positives.

## Supplementary real tuplets and soft transitions

Take 42 Arioso, source 124.91–129.12 seconds, contains the preceding eighth, two sextuplet groups in measure 39, and an eighth-note triplet in measure 40 (PDF page 6). Both tuplet forms occupy one third of a quarter-note beat, but their 6:4 versus 3:2 notation remains distinct. The performance is approximately 80 quarter-notes/minute. This is an unedited recording, with continuous harmonic transitions and shallow rearticulations.

Result: **15/16 onsets and note-ID correspondences within 50 ms**, 1 false positive and 1 missed event, F1 0.938; matched mean absolute error 19.3 ms. The first trial crop cut a preceding note; the final crop includes it whole, with no detector parameter changes. This supplementary passage falls below 95% correspondence accuracy and exposes the remaining soft/tuplet boundary limitation. Acoustic transition labels cannot prove whether a player tongued or slurred.

## Implementation choice, integration and verification

The detector uses CPU signal processing: frequency-max-filtered positive spectral flux inspired by [SuperFlux](https://www.dafx.de/paper-archive/2013/papers/09.dafx2013_submission_12.pdf), adaptive energy/valley checks and persistent YIN transitions. The [librosa example](https://librosa.org/doc/0.11.0/auto_examples/plot_superflux.html) documents the harmonic/vibrato suppression idea. This is a measured combination of cues, not an LLM or a claim to reproduce the published SuperFlux system exactly. The old pitch engine is retained for its separate feature.

Verification completed locally:

- 49 Node tests passed, including actual FFmpeg decoding and optional real CREPE inference; 6 Python tests passed.
- Frontend TypeScript and targeted ESLint checks passed.
- Real multipart HTTP upload returned 200 with `spectral-yin-v1`, detected events, score matches, findings and alignment data.
- CLI and web use the same rhythm module; worker errors, malformed responses, invalid inputs and process timeouts are tested.
- All reproducible evaluation gates passed; `results/summary.json` stores implementation SHA-256 fingerprints.

Optical score recognition was not validated with a real Audiveris run. Score parsing has tests for dotted notes, tuplets, ties, rests, tempo changes and meter, but PDF/image recognition still needs external setup and manual review. Long-form repeats, ambiguous same-pitch legato, noisy/accompanied recordings and broad device/player generalization remain outside the demonstrated scope. See [rhythm guide](../README.md) for setup, input format, reusable output contracts and operating limits.

### Written rhythm UI follow-up

Added score-derived labels and per-group feedback. Two additional waveform controls apply opposing 50 ms onset shifts inside a triplet and a 6/8 quadruplet. Both yield the expected `uneven_tuplet` finding with no extra findings (all 3 and 4 onsets detected within 50 ms). Eight whole-through-sixteenth/dotted control notes are detected and labeled with no findings. Unit tests also distinguish uniform group lateness from uneven spacing and missing attacks from complete groups. A browser upload of the quadruplet control displayed “quadruplet spacing is uneven” with a 100 ms maximum interval error and the note-by-note table.

The unedited real tuplet passage still matches 15/16 within 50 ms. Its two sextuplet groups and one triplet group are retained; one sextuplet group receives an uneven-spacing review. No human error label exists for that group, so this is not counted as a confirmed performance mistake. The acoustic detector and its held-out onset metrics are unchanged.
