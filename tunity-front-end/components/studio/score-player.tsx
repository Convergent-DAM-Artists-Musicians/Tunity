"use client";

import { useEffect, useRef, useState } from "react";
import type { CompactScore } from "@/lib/studio/score";
import { playNotes } from "@/lib/studio/synth";

/** Plays a score (or a measure range) with speed and count-in controls. */
export function ScorePlayer({ score, from, to, label = "Hear it", compact = false }: {
  score: CompactScore; from?: string; to?: string; label?: string; compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [countIn, setCountIn] = useState(true);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const a = from ? score.measures.indexOf(from) : 0;
  const b = to ? score.measures.indexOf(to) : score.measures.length - 1;
  const range = new Set(score.measures.slice(Math.max(0, a), (b < 0 ? score.measures.length - 1 : b) + 1));
  const notes = score.notes.filter((n) => range.has(n.measure));
  function toggle() {
    if (playing) { stop.current?.(); return; }
    setPlaying(true);
    stop.current = playNotes(notes, {
      rate, bpm: score.tempoBpm, countInBeats: countIn ? Number(score.meter.split("/")[0]) || 4 : 0,
      onEnd: () => { stop.current = null; setPlaying(false); },
    });
  }
  return (
    <div className={`score-player ${compact ? "compact" : ""}`}>
      <button className={compact ? "studio-ghost" : "secondary-button"} disabled={!notes.length} onClick={toggle}>
        {playing ? "■ Stop" : `▶ ${label}`}
      </button>
      {!compact && (
        <>
          <label>Speed
            <select value={rate} disabled={playing} onChange={(e) => setRate(Number(e.target.value))}>
              {[0.5, 0.75, 0.9, 1].map((r) => <option key={r} value={r}>{Math.round(score.tempoBpm * r)} BPM</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={countIn} disabled={playing} onChange={(e) => setCountIn(e.target.checked)} /> Count-in</label>
        </>
      )}
    </div>
  );
}
