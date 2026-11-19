"use client";

import type { EtudeResult, PracticePiece } from "@/lib/studio/types";
import "./studio.css";

/** Entry point for generating practice from one analyzed take. */
export function SessionPracticeCard({ name, findingCount, onGenerate }: {
  name: string;
  findingCount: number;
  onGenerate: () => void;
}) {
  return (
    <div className="session-practice">
      <div className="session-practice-copy">
        <strong>Practice for this session</strong>
        <span>
          {findingCount
            ? `Based on “${name}” · ${findingCount} flagged ${findingCount === 1 ? "spot" : "spots"}`
            : `Based on “${name}” · key, meter and phrasing`}
        </span>
      </div>
      <button className="session-practice-generate" onClick={onGenerate}>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2c.7 5.8 4.2 9.3 10 10-5.8.7-9.3 4.2-10 10-.7-5.8-4.2-9.3-10-10 5.8-.7 9.3-4.2 10-10Z" fill="currentColor" />
        </svg>
        Generate Etude
      </button>
    </div>
  );
}

export function etudePiece(etude: EtudeResult, collection: string, request: string, uid: string): PracticePiece {
  const slug = etude.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "etude";
  return {
    id: crypto.randomUUID(), uid, title: etude.title, createdAt: new Date().toISOString(),
    source: "etude", collection, fileName: `${slug}.musicxml`,
    file: new Blob([etude.xml], { type: "application/vnd.recordare.musicxml+xml" }), xml: etude.xml,
    reference: etude.reference, instrument: etude.instrument, keyName: etude.keyName, meter: etude.meter,
    tempoBpm: etude.tempoBpm, focus: etude.focus, description: etude.description, tips: etude.tips, prompt: request,
  };
}
