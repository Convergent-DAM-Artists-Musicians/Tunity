/** Plays score notes with a soft triangle tone and an optional count-in click. */
export function playNotes(
  notes: { midi: number; startSec: number; endSec: number }[],
  { rate = 1, countInBeats = 0, bpm = 100, onEnd }: { rate?: number; countInBeats?: number; bpm?: number; onEnd?: () => void } = {},
) {
  if (!notes.length) return () => {};
  const context = new AudioContext();
  const origin = Math.min(...notes.map((n) => n.startSec));
  const countIn = (countInBeats * 60) / bpm / rate;
  const start = context.currentTime + 0.08;
  for (let i = 0; i < countInBeats; i++) {
    const at = start + (i * 60) / bpm / rate;
    const osc = context.createOscillator(), gain = context.createGain();
    osc.frequency.value = i === 0 ? 1500 : 1000;
    gain.gain.setValueAtTime(0.15, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
  let last = start;
  for (const n of notes) {
    const from = start + countIn + (n.startSec - origin) / rate;
    const to = Math.max(from + 0.03, start + countIn + (n.endSec - origin) / rate - 0.01);
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(0.14, Math.min(to, from + 0.015));
    gain.gain.setValueAtTime(0.14, Math.max(from + 0.015, to - 0.025));
    gain.gain.linearRampToValueAtTime(0, to);
    osc.connect(gain).connect(context.destination);
    osc.start(from);
    osc.stop(to + 0.01);
    last = Math.max(last, to);
  }
  const timer = setTimeout(() => { void context.close(); onEnd?.(); }, (last - context.currentTime) * 1000 + 150);
  return () => { clearTimeout(timer); void context.close(); onEnd?.(); };
}
