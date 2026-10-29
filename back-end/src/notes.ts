import type { AudioClip, PitchTrack, DetectedNote } from './back-end/types.ts';

export const defaults = {
  tuningHz: 440, minFrequencyHz: 65, maxFrequencyHz: 1800,
  minConfidence: 0.3, silenceDb: -50, minNoteSec: 0.08,
  pitchToleranceCents: 25, timingToleranceMs: 70,
  missedEntranceMs: 250, dynamicsToleranceDb: 4, referenceOffsetSec: 0,
};
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : 0;
}
type Frame = { start: number; end: number; midi: number; confidence: number; db: number };

/** Energy-derived attacks and levels, with CREPE pitch used only in voiced frames. */
export function segmentNotes(clip: AudioClip, track: PitchTrack, o: typeof defaults) {
  const groups: Frame[][] = [];
  let group: Frame[] = [], pending: Frame[] = [];
  let activeStart: number | undefined, uncertainFrames = 0, active = 0, confident = 0;
  const finish = () => { if (group.length) groups.push(group); group = []; pending = []; };
  for (const p of track.frames) {
    const start = Math.round(p.timeSec * clip.sampleRate);
    const end = Math.min(clip.samples.length, Math.round((p.timeSec + track.hopSec) * clip.sampleRate));
    let energy = 0;
    for (let i = start; i < end; i++) energy += clip.samples[i] ** 2;
    const db = 10 * Math.log10(Math.max(energy / Math.max(1, end - start), 1e-12));
    if (db < o.silenceDb) { finish(); activeStart = undefined; uncertainFrames = 0; continue; }
    active++;
    activeStart ??= p.timeSec;
    if (p.frequencyHz === null || p.periodicity < o.minConfidence || p.frequencyHz < o.minFrequencyHz || p.frequencyHz > o.maxFrequencyHz) {
      if (++uncertainFrames >= 3) { finish(); activeStart = p.timeSec; }
      continue;
    }
    confident++; uncertainFrames = 0;
    const frame: Frame = { start: p.timeSec, end: end / clip.sampleRate,
      midi: 69 + 12 * Math.log2(p.frequencyHz / o.tuningHz), confidence: p.periodicity, db };
    if (!group.length) frame.start = Math.max(activeStart, p.timeSec - 0.04);
    const previous = group.at(-1);
    if (previous && Math.abs(frame.midi - median(group.slice(-5).map(f => f.midi))) > 0.7) {
      if (pending.length && Math.abs(frame.midi - pending.at(-1)!.midi) > 0.7) pending = [];
      pending.push(frame);
      if (pending.length >= 3) { const next = pending; finish(); group = next; }
    } else {
      pending = [];
      // Baseline reattack detection. Subtle legato/tongued boundaries need real trumpet validation.
      if (previous && frame.db - previous.db > 8 && previous.end - group[0].start >= o.minNoteSec) finish();
      group.push(frame);
    }
  }
  finish();
  const notes: DetectedNote[] = groups.filter(g => g.at(-1)!.end - g[0].start >= o.minNoteSec).map(g => {
    // Avoid judging the unstable attack/release when enough sustained frames are available.
    const stable = g.filter(f => f.start >= g[0].start + 0.03 && f.end <= g.at(-1)!.end - 0.02);
    const frames = stable.length >= 3 ? stable : g;
    const midi = median(frames.map(f => f.midi));
    return { startSec: g[0].start, endSec: g.at(-1)!.end, midi,
      frequencyHz: o.tuningHz * 2 ** ((midi - 69) / 12),
      confidence: median(frames.map(f => f.confidence)), rmsDb: median(frames.map(f => f.db)) };
  });
  return { notes, voicedConfidenceFraction: active ? confident / active : 0 };
}
