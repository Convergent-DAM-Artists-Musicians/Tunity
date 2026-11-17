# Music analysis platforms and Tunity opportunities

Research date: November 16, 2026. Based on official public product/help pages, not hands-on benchmarking. Documented features are vendor claims, not independently measured accuracy. Soundslice is included as a practice-interface benchmark, not as an automatic performance grader. Recommendations below are proposed work, not a claim that Tunity already implements them.

## Platform feature inventory

| Platform | Documented analysis | Practice and visualization features | Relevant lesson for Tunity |
| --- | --- | --- | --- |
| MakeMusic Cloud (formerly SmartMusic) | Pitch, onset and duration assessment; configurable tolerances in cents, milliseconds and duration percentage. | Score annotations, per-note explanations, original-versus-take playback, assignments and teacher review. | Give measurable explanations and adjustable tolerances; let users hear the evidence. |
| tonestro | Live note and rhythm feedback; expert mode highlights smaller intonation/timing deviations. | Courses, song library, tuner, slower tempos, fingering charts and challenges. | Instrument-specific feedback and guided practice matter alongside detection. |
| Metronaut | Real-time pitch and rhythmic-placement feedback, performance scoring and XP. | Sight-read mode, fixed-tempo practice, AI tempo following, accompaniment, loops, recording and score annotations; availability varies by platform. | Separate strict timing practice from expressive performance. |
| Yousician (singing) | Real-time pitch and timing feedback. | Practice/play modes, lessons, songs, progress rewards; record-and-review described in a historical product announcement. | Feedback should lead to another focused attempt. Teaching tone or breath support does not establish automatic grading of those skills. |
| Soundslice | The reviewed pages describe synchronized notation and recordings rather than automatic error grading. | Click-to-seek notation, precise loops, pitch-preserving slowdown, speed training, waveform navigation, clips, practice history, score import/scanning. | Make detected problems easy to find, hear, repeat and compare. |

Sources:

- [MakeMusic visual assessment](https://help.makemusic.com/hc/en-us/articles/360026214894-Understanding-Visual-Assessment-Students-Performers)
- [MakeMusic assessment configuration](https://help.makemusic.com/hc/en-us/articles/360026371253-Creating-an-Assignment-Performance-Assessment)
- [tonestro product overview](https://www.tonestro.com/)
- [tonestro feedback help](https://www.tonestro.com/it/assistenza/come-tonestro-ti-ascolta/)
- [Metronaut feedback](https://community.metronautapp.com/hc/en-us/articles/39023343511442-How-to-use-AI-Feedback-pitch-rhythm-scoring-and-XP)
- [Metronaut practice modes](https://community.metronautapp.com/hc/en-us/articles/360002662792-How-Metronaut-Helps-You-Practice-Sheet-Music-with-AI-An-Overview)
- [Yousician singing](https://yousician.com/Singing)
- [Yousician practice/play modes](https://support.yousician.com/hc/en-us/articles/360000553289-Practice-and-Play-modes-in-singing)
- [Yousician record/review announcement, 2020](https://yousician.com/blog/new-feature-yousician-singing-record-review)
- [Soundslice features](https://www.soundslice.com/features/)

Evidence caveats: tonestro's [2019 algorithm article](https://blog.tonestro.com/the-magic-behind-the-tonestro-app/) mentions articulation and dynamics, but the current reviewed help emphasizes pitch and rhythm. Treat current detailed articulation/dynamics grading as unverified. Metronaut's expressive tempo-following mode is not proof of automatic phrasing-quality grading. An absent feature in these sources is not proof that a product lacks it. MakeMusic explicitly documents octave-agnostic pitch assessment; Tunity should decide its own octave policy and handle trumpet transposition explicitly.

## Recommended analysis additions

These priorities are product/engineering recommendations, not competitor performance measurements. Start with isolated trumpet recordings and teacher-checked examples.

| Priority | Analysis | Example user feedback | Requirements and limits |
| --- | --- | --- | --- |
| 1 | Articulation and connection | “There is a gap between these slurred notes”; “This staccato note was held too long.” | Preserve slurs, staccato, tenuto and accents in the structured score. Combine attack, release and inter-note-gap measurements. A slur boundary can be uncertain; do not infer the player's tongue technique from audio alone. |
| 1 | Relative dynamics | “The marked crescendo stays nearly level”; “This accent is not stronger than surrounding notes.” | Preserve dynamic markings and hairpin spans. Compare local loudness within a recording; microphone position, compression and automatic gain can distort it. Do not map arbitrary recorded amplitude directly to p/mf/f. |
| 2 | Intonation stability | “The sustained note starts in tune, then drifts sharp.” | Extend pitch work from note identity to a time-varying cents curve, with tuning/transposition configuration and confidence. Separate deliberate vibrato and attack transients from sustained drift. |
| 2 | Tempo consistency and subdivision evenness | “You accelerate across these four measures”; “The middle triplet note is consistently late.” | Extend the existing rhythm output rather than create another independent detector. Display local tempo and spacing ratios. Offer strict-tempo and expressive modes so alignment does not hide drift or punish intentional rubato. |
| 3 | Attack and release consistency | “Several attacks settle slowly”; “Phrase endings stop abruptly.” | Measure attack settling and release envelopes, validated against expert labels. Present observations, not diagnoses of embouchure or breath support. |
| 3 | Phrase continuity and breath placement | “A pause interrupts this marked phrase.” | Use phrase/slur/breath marks or a teacher-defined reference. A silence is not proof of a breath. Intentional phrasing varies, so use review suggestions rather than universal correctness scores. |
| Later | Tone stability and timbre | “The sustained sound becomes less steady here.” | Requires diverse microphones, rooms, registers, mutes and teacher-labelled recordings. Avoid a universal good/bad tone score or calling brightness itself an error. |
| Later | Vibrato characteristics | “Vibrato widens toward the end of the note.” | Describe rate, depth and regularity where detection is reliable. Evaluate correctness only with stylistic context or a specified exercise. |

## Supporting product features

1. Click a marked note to hear the relevant passage, with reference/recording comparison.
2. Loop a difficult passage, slow it down, provide a count-in, and record another take.
3. Compare takes by the same measures and show whether a repeated issue improved.
4. Rank a small number of actionable practice targets instead of listing every deviation equally.
5. Allow users/teachers to correct score extraction and dismiss uncertain findings.
6. Check recording quality before analysis: clipping, low signal, background sound and possible accompaniment interference. Label this separately from musical performance.

## Integration and validation plan

- Reuse the shared score-aligned event IDs, note/measure positions, timing map and confidence outputs for every analysis module.
- Extend the verified score representation with dynamics, hairpins, articulation, slur and phrase spans. Validate with structured scores before attributing image/PDF extraction errors to audio analysis.
- Each finding should retain its category, expected event/span, audio interval, measured evidence, reference expectation and uncertainty. Keep pitch/rhythm/articulation assessments independently inspectable.
- Validate articulation first on teacher-labelled tongued, slurred, staccato and tenuto passages, including repeated notes and multiple tempos. Report category precision/recall and boundary tolerance separately.
- Validate dynamics on labelled crescendos, diminuendos and accents across held-out players/devices, including recordings with gain processing. Measure false findings on intentionally steady passages.
- Derive acceptance thresholds from representative recordings before shipping a correctness score. Suppress unsupported conclusions when score alignment or recording quality is insufficient.

Suggested order: recording-quality checks and practice/replay workflow; articulation; relative dynamics; pitch stability and phrase-level tempo summaries; then research tone and phrasing. No new analyzer needs an LLM to measure these signals; any generated explanation should be grounded in measured evidence.
