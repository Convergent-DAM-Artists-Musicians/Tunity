# Relative dynamics checks

The existing analyzer is unchanged. The builder uses the already generated `practice/timing/correct.wav`, retaining its C5–D5–E5–C5 pitches and timing. It calibrates each note to a stable recorded level of -26 dBFS before making controlled changes. This calibration is only test-fixture preparation; normalizing each note in a real performance would erase the dynamics you want to assess.

From your project root in the working VS Code PowerShell terminal, with `FFMPEG_PATH` still set:

```powershell
node scripts/build-trumpet-dynamics-tests.ts
$env:PYTHON_PATH = (Resolve-Path .\.venv\Scripts\python.exe).Path
node scripts/run-trumpet-dynamics-tests.ts
```

Files are written under `practice/dynamics`. Rerunning the builder regenerates its WAV/reference/manifest files; rerunning the analyzer overwrites its result/summary JSON files. If the timing baseline is missing, regenerate it with `node scripts/build-trumpet-timing-tests.ts "<your-sample-folder>"` first.

| Case | Audio change | Reference | Expected dynamics result |
| --- | --- | --- | --- |
| `even` | All notes have equal stable levels | All relative targets 0 dB | No findings |
| `quieter-note` | Third note 10 dB quieter | All targets 0 dB | Third note about -10 dB from target |
| `louder-note` | Third note 8 dB louder | All targets 0 dB | Third note about +8 dB from target |
| `intentional-quiet` | Same recording as `quieter-note` | Third-note target -10 dB | No findings |
| `uniform-gain` | Every note 6 dB quieter | All targets 0 dB | No findings; constant gain is removed |

Use each case's matching `*.reference.json`. The intentionally quiet case changes the reference on purpose; this checks that correct expressive dynamics are accepted. The quieter/louder error cases keep all targets zero.

The runner writes `summary.json` and each `*.result.json`. It checks expected note IDs, error signs/magnitudes within 1 dB, four detected/matched notes, no clipping, and that dynamics were actually assessed. Pitch/timing findings are listed separately; these recordings retain their natural tuning. Inspect those findings even if the dynamics checklist passes.

These checks establish relative recorded-level behavior only. They do not measure calibrated acoustic loudness, prove trumpet technique, or establish universal dB equivalents for printed p/f markings. Raw sample amplitude alone does not establish whether a performer intended an accent. The reference provides that intention.

`test/dynamics-fixtures.test.ts` checks fixture calibration and scoring with explicit oracle pitch frames. Real CREPE results come from running the script in your working Python environment, not from that unit test. Keep sample audio and generated WAVs out of public source repositories.
