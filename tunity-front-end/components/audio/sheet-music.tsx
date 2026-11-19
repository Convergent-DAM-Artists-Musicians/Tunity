"use client";
import { useId, useState } from "react";
import { useAudio } from "./audio-provider";
import { type SheetChoice, type SheetRef } from "@/lib/sheet-model";
import "./sheet-music.css";
import { useBandAccount } from "../accounts/account-provider";

export function SheetPicker({ value, onChange, disabled }: {
  value: SheetChoice; onChange: (value: SheetChoice) => void; disabled: boolean;
}) {
  const { sheets, sheetsLoading, sheetsError } = useAudio();
  const id = useId();
  return <fieldset className="sheet-picker" disabled={disabled}>
    <legend>Sheet music <span className="optional">optional</span></legend>
    <label className="field-label" htmlFor={id}>Reference for this take</label>
    <select id={id} value={value.kind} onChange={e => onChange(e.target.value === "new"
      ? { kind: "new", file: null } : e.target.value === "existing" && sheets[0]
      ? { kind: "existing", slot: sheets[0].slot, key: sheets[0].key, name: sheets[0].name } : { kind: "none" })}>
      <option value="none">No sheet music</option>
      <option value="new" disabled={sheetsLoading || !!sheetsError}>Upload a new PDF</option>
      <option value="existing" disabled={sheetsLoading || !!sheetsError || !sheets.length}>Choose from my sheet music</option>
    </select>
    {value.kind === "new" && <label className="field-label">Sheet music PDF
      <input type="file" accept=".pdf,application/pdf" required onChange={e => onChange({ kind: "new", file: e.target.files?.[0] || null })} />
    </label>}
    {value.kind === "existing" && <label className="field-label">Saved sheet music
      <select required value={value.key} onChange={e => {
        const s = sheets.find(s => s.key === e.target.value);
        if (s) onChange({ kind: "existing", slot: s.slot, key: s.key, name: s.name });
      }}>
        {sheets.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
      </select>
    </label>}
    <p className="upload-help">PDFs up to 500 KiB · reusable across recordings · sheet music optional</p>
    <p className="upload-help">Stored for viewing only · MXL conversion and analysis are not run here</p>
    {sheetsLoading && <p role="status">Loading sheet music…</p>}
    {sheetsError && <p role="alert" className="error-message">{sheetsError}</p>}
  </fieldset>;
}
export function SheetReference({ reference }: { reference?: SheetRef }) {
  const { sheets, sheetsLoading, sheetsError } = useAudio();
  if (!reference) return <p className="sheet-reference">No sheet music attached</p>;
  const sheet = sheets.find(s => s.key === reference.key && s.slot === reference.slot);
  return <p className="sheet-reference">Sheet music: {sheet
    ? <a href={sheet.url} download={sheet.name}>{sheet.name} ↓ PDF</a>
    : <span>{reference.name} · {sheetsLoading ? "Loading…" : sheetsError ? "Library unavailable" : "PDF unavailable"}</span>}</p>;
}
export function SheetLibrary() {
  const { sheets, recordings, sheetsLoading, sheetsError, saving, removeSheet, retry } = useAudio();
  const { account } = useBandAccount();
  const [error, setError] = useState("");
  async function erase(key: string) {
    if (!confirm("Delete this unused PDF from your library?")) return;
    setError("");
    try { await removeSheet(key); }
    catch (e) { setError(e instanceof Error ? e.message : "PDF deletion was not confirmed. Retry library."); }
  }
  return <section className="sheet-library" aria-label="My sheet music">
    <h3>My sheet music <span>{sheets.length} saved</span></h3>
    <p>Upload a PDF with a practice take, then reuse it on another take. Deleting a take keeps its PDF in this library.</p>
    {sheetsLoading && <p role="status">Loading sheet music…</p>}
    {sheetsError && <div><p role="alert">{sheetsError}</p><button className="text-button" onClick={retry}>Retry library</button></div>}
    {error && <p role="alert">{error}</p>}
    {!sheetsLoading && !sheetsError && !sheets.length && <p>No sheet music yet. It’s optional.</p>}
    {sheets.map(sheet => {
      const used = account.sheetUses[sheet.key] ?? recordings.filter(r => r.sheetMusic?.key === sheet.key).length;
      return <article key={sheet.key}>
        <div><a href={sheet.url} download={sheet.name}>{sheet.name} ↓ PDF</a>
          <p>{Math.ceil(sheet.size / 1024)} KiB · {used} linked {used === 1 ? "take" : "takes"} · Not converted to MXL yet</p></div>
        <button className="text-button" disabled={saving || !!used} title={used ? "Delete linked takes first" : "Delete unused PDF"}
          onClick={() => void erase(sheet.key)}>Delete PDF</button>
      </article>;
    })}
  </section>;
}
