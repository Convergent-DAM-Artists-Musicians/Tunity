"use client";

import type { EvidenceRef, ReviewFocus } from "@/lib/studio/analysis";

export type FocusRequest = Omit<ReviewFocus, "nonce">;

export const CATEGORY_LABELS: Record<string, string> = {
  rhythm: "Rhythm", pitch: "Pitch", articulation: "Articulation", dynamics: "Dynamics",
  tempo: "Tempo", recording: "Recording", setup: "Setup",
};

/** Clickable citations: each jumps the review to the measure and plays that moment. */
export function EvidenceChips({ refs, onFocus, disabled }: { refs: EvidenceRef[]; onFocus: (f: FocusRequest) => void; disabled?: boolean }) {
  if (!refs.length) return null;
  return (
    <ul className="studio-evidence" aria-label="Evidence from the analysis">
      {refs.map((r) => {
        const canJump = !disabled && (r.measure !== undefined || r.startSec !== undefined);
        return (
          <li key={r.id}>
            <button disabled={!canJump} title={r.message ?? r.label}
              onClick={() => onFocus({ measure: r.measure, expectedId: r.expectedId, startSec: r.startSec, endSec: r.endSec })}>
              <span aria-hidden="true">▶</span> {r.label}
              {r.startSec !== undefined && <small>{r.startSec.toFixed(2)}s</small>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
