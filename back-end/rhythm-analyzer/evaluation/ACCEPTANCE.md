# Rhythm evaluation protocol

Set before inspecting held-out detector output. Development: URMP 05 and 09.
Held-out: 10, 15, 33. These are different pieces/takes, not evidence of unseen
players, rooms, or recording devices. No optimization on their results.

* Acoustic onsets: one-to-one assignment, absolute error <=50 ms, micro precision
  and recall >=0.90 and F1 >=0.90 across held-out takes; each take F1 >=0.85.
  Also report 25 ms and 100 ms. Count all false positives and misses.
* Alignment independently: >=95% correct note-ID correspondences on verified
  real excerpts, both with oracle event times and with detected events. Evaluate
  source score (not a score quantized from the audio), leading silence, slower
  and faster performances. Do not measure alignment by total matches alone.
* Error identification separately: >=90% precision and recall for deliberately
  injected onset errors, deletions and insertions on controlled waveforms;
  duration/rest cases must each be detected. <=5% incorrectly flagged notes in
  clean controls. Use fixed cue for absolute timing and automatic mode for
  relative timing. Report each kind separately, including wrong-kind findings.
* Manual review: inspect waveform and spectrogram windows with source annotations
  and no detector marks. Store chosen timings, uncertainty, and review notes.
  Distinguish these visually checked labels from independent human listening.
* Full unedited real takes use the dataset's original annotations in primary
  onset metrics. Report annotation defects separately; do not silently repair
  the test labels to raise scores.
* Synthetic and time-edited real audio are supplementary. They never replace
  unedited real-recording evaluation.

Confidence values are heuristic evidence scores, not empirical probabilities.
Meeting these gates supports an isolated-trumpet prototype, not universal
reliability or correctness of optical score recognition.
