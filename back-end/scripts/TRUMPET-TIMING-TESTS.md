# Controlled timing tests using your trumpet samples

The analyzer source is unchanged. Three new TypeScript scripts generate and analyze six test clips using your real trumpet samples. The builder writes only its fixed WAV/reference/manifest files; rerunning it regenerates those files. The runner overwrites its named result/summary JSON files.

From the project root in your existing VS Code PowerShell terminal:

```powershell
# Requires the FFMPEG_PATH you set earlier (or ffmpeg available on PATH).
node scripts/build-trumpet-timing-tests.ts "$env:LOCALAPPDATA\Temp"

$env:PYTHON_PATH = (Resolve-Path .\.venv\Scripts\python.exe).Path
node scripts/run-trumpet-timing-tests.ts
```

If samples are elsewhere, replace the builder's argument with that folder. It requires:

- `trumpet_C5_long_forte_normal (1).mp3` or `trumpet_C5_long_forte_normal.mp3`
- `trumpet_D5_15_forte_normal.mp3`
- `trumpet_E5_15_forte_normal.mp3`

It takes seconds 0.3–0.7 of each sample, fades the boundaries over 5 ms to prevent edit clicks, and creates five-second 16 kHz PCM WAV recordings. Only note placement/omissions change. Source pitch/dynamics are retained. The note labels are sounding/concert pitches, matching the tested C5 sample convention.

The desired sequence is C5–D5–E5–C5 (MIDI 72, 74, 76, 72). Each note lasts 0.4 seconds. Expected starts are 0.5, 1.5, 2.5, and 3.5 seconds. All cases use exactly the same `practice/timing/reference.json`; do not change its timestamps to follow an introduced error.

| WAV file | Deliberate change | Expected timing finding |
| --- | --- | --- |
| `correct.wav` | None | No timing findings |
| `early.wav` | E5 begins 150 ms early | `early` on note-3 |
| `late.wav` | E5 begins 150 ms late | `late` on note-3 |
| `missing-note.wav` | E5 omitted; later C5 stays on time | `missing_note` on note-3 |
| `late-entrance.wav` | First C5 begins 320 ms late; later notes stay on time | `missed_entrance` on note-1 |
| `missing-entrance.wav` | First C5 omitted | `missed_entrance` on note-1 |

The runner writes each `*.result.json` and `summary.json` under `practice/timing`. It compares all timing/omission/extra-note findings with the known edits. Pitch findings are reported separately, since a recording can be naturally sharp/flat even when its placement is correct. The dynamics warning is expected: this reference deliberately has no dynamics targets.

Listen to the WAVs to compare the baseline with each edit. A failed case is an observation to investigate, not a reason to change the reference to match the output. Send `summary.json` and the affected `*.result.json` for review. `npm.cmd test` checks the builder/scoring with oracle frames; it does not substitute for running these actual clips through CREPE.

These constructed sequences isolate timing behavior. They do not validate real tonguing, slurs, room noise or microphone conditions. Keep the Philharmonia sample audio and generated WAVs out of a public GitHub repository; the source library restricts redistributing samples as-is.
