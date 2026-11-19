"use client";

import { useRef, useState } from "react";
import type { PracticePiece } from "@/lib/studio/types";
import { ScorePlayer } from "./score-player";
import { ScoreView } from "./score-view";
import "./studio.css";

export type PieceTake = { id: string; name: string; date: string; clean: number | null };

/** Library of generated etudes and saved scores, organized into collections. */
export function PracticePieces({ pieces, takeCounts, onOpen, onWrite, onStudy }: {
  pieces: PracticePiece[];
  takeCounts: Record<string, number>;
  onOpen: (piece: PracticePiece) => void;
  onWrite: () => void;
  onStudy: (file: File) => void;
}) {
  const [collection, setCollection] = useState("All");
  const [search, setSearch] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const scoreInput = useRef<HTMLInputElement>(null);
  const active = pieces.filter((p) => !p.trashed);
  const collections = ["All", ...[...new Set(active.map((p) => p.collection))].sort()];
  const visible = (showTrash ? pieces.filter((p) => p.trashed) : active)
    .filter((p) => showTrash || collection === "All" || p.collection === collection)
    .filter((p) => `${p.title} ${p.focus ?? ""} ${p.instrument ?? ""} ${p.keyName ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">AI STUDIO</span>
          <h2>{showTrash ? "Removed pieces" : "Practice pieces"}<span>{visible.length.toString().padStart(2, "0")}</span></h2>
        </div>
        <div className="studio-actions tight">
          <button className="new-project" onClick={() => scoreInput.current?.click()}>Study a score</button>
          <button className="new-project" onClick={onWrite}>✦ Generate practice</button>
        </div>
        <input ref={scoreInput} type="file" className="sr-only" accept=".xml,.musicxml,.mxl" aria-label="Choose a MusicXML score to study"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onStudy(f); }} />
      </div>
      <div className="toolbar">
        <div className="semester-tabs" role="group" aria-label="Filter by collection">
          {!showTrash && collections.map((c) => (
            <button key={c} className={collection === c ? "selected" : ""} aria-pressed={collection === c} onClick={() => setCollection(c)}>{c}</button>
          ))}
        </div>
        <div className="search-tools">
          <label className="search-box">
            <input aria-label="Search practice pieces" placeholder="Search pieces" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button className={`filter-button ${showTrash ? "on" : ""}`} aria-pressed={showTrash} onClick={() => setShowTrash(!showTrash)}>
            {showTrash ? "Back" : "Removed"}
          </button>
        </div>
      </div>
      <div className="library-meta">
        <span>Generated etudes and saved scores. Record any piece to get scored feedback and compare takes.</span>
        <span><i />Saved in this browser</span>
      </div>
      {visible.length ? (
        <div className="project-grid">
          {visible.map((p, i) => (
            <button key={p.id} className="project-card piece-card" onClick={() => onOpen(p)}>
              <div className="card-top">
                <span className={`project-symbol tone-${i % 4}`}>{p.source === "etude" ? "✦" : "♪"}</span>
                <span className="piece-takes">{takeCounts[p.id] ?? 0} takes</span>
              </div>
              <h3>{p.title}</h3>
              <p className="piece-focus">{p.focus || p.reference.partName}</p>
              <div className="card-bottom">
                <span>{p.collection}</span>
                <span>{[p.keyName, p.reference.meter, `♩${p.reference.tempoBpm}`].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="card-accent" />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>{showTrash ? "Nothing removed" : search ? "No matching pieces" : "Your practice library starts here"}</h3>
          <p>{showTrash ? "Pieces you remove can be restored here." : "Write an etude aimed at your coach feedback, or study a MusicXML score before recording it."}</p>
          {!showTrash && <button className="primary-button" onClick={onWrite}>✦ Generate practice</button>}
        </div>
      )}
    </>
  );
}

/** Detail view for one practice piece. */
export function PieceDetail({ piece, takes, collections, onRecord, onStudy, onUpdate, onOpenTake }: {
  piece: PracticePiece;
  takes: PieceTake[];
  collections: string[];
  onRecord: () => void;
  onStudy: () => void;
  onUpdate: (patch: Partial<PracticePiece>) => void;
  onOpenTake: (id: string) => void;
}) {
  const [title, setTitle] = useState(piece.title);
  const [collection, setCollection] = useState(piece.collection);
  const dirty = title.trim() !== piece.title || collection.trim() !== piece.collection;
  function download() {
    const url = URL.createObjectURL(piece.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = piece.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="piece-detail">
      <span className="eyebrow">{piece.source === "etude" ? "AI ETUDE" : "SAVED SCORE"} · {piece.collection}</span>
      <h2 id="dialog-title">{piece.title}</h2>
      {piece.description && <p className="dialog-intro">{piece.description}</p>}
      <div className="piece-facts">
        {piece.instrument && <span>{piece.instrument}</span>}
        {piece.keyName && <span>{piece.keyName}</span>}
        <span>{piece.reference.meter}</span><span>♩ = {piece.reference.tempoBpm}</span>
        <span>{piece.reference.measures.length} measures</span>
      </div>
      <ScoreView key={piece.id} xml={piece.xml} label={`${piece.title} notation`} />
      <ScorePlayer score={piece.reference} />
      {!!piece.tips?.length && <ul className="piece-tips">{piece.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <div className="studio-actions">
        <button className="primary-button" onClick={onRecord}>Record this piece →</button>
        <button className="secondary-button" onClick={onStudy}>{piece.study ? "Open study guide" : "Get a study guide"}</button>
        <button className="secondary-button" onClick={download}>Download MusicXML</button>
      </div>
      <section className="study-section">
        <h3>Takes <span className="studio-muted">{takes.length}</span></h3>
        {!takes.length && <p className="studio-muted">No analyzed takes yet. Record this piece with analysis on to get feedback and compare takes over time.</p>}
        <ul className="piece-take-list">
          {takes.map((t) => (
            <li key={t.id}><button onClick={() => onOpenTake(t.id)}>
              <strong>{t.name}</strong><span>{t.date}</span><span>{t.clean === null ? "—" : `${t.clean}% clean notes`}</span>
            </button></li>
          ))}
        </ul>
      </section>
      <section className="study-section piece-organize">
        <h3>Organize</h3>
        <div className="etude-save">
          <label className="field-label">Title<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field-label">Collection
            <input list="piece-detail-collections" value={collection} maxLength={40} onChange={(e) => setCollection(e.target.value)} />
            <datalist id="piece-detail-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <div className="studio-actions">
          <button className="secondary-button" disabled={!dirty || !title.trim()} onClick={() => onUpdate({ title: title.trim(), collection: collection.trim() || "Etudes" })}>Save changes</button>
          <button className="text-button" onClick={() => onUpdate({ trashed: !piece.trashed })}>{piece.trashed ? "Restore piece" : "Remove piece"}</button>
        </div>
      </section>
    </div>
  );
}
