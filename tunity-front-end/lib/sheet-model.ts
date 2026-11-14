export const MAX_SHEET_BYTES = 500 * 1024;
export const MAX_SHEETS = 5;
export type SheetRef = { slot: string; key: string; name: string };
export type Sheet = SheetRef & { size: number; url: string };
export type SheetChoice = { kind: "none" } | { kind: "new"; file: File | null }
  | ({ kind: "existing" } & SheetRef);
export function readSheetRef(value: unknown): SheetRef | undefined {
  if (value == null) return undefined; // Older recordings have no sheet reference.
  const s = value as SheetRef;
  if (!/^[0-4]$/.test(s.slot) || !/^[a-f0-9-]{36}$/.test(s.key)
      || typeof s.name !== "string" || !s.name.length || s.name.length > 180)
    throw new Error("Invalid sheet music reference.");
  return { slot: s.slot, key: s.key, name: s.name };
}
export async function prepareSheet(file: File | null) {
  if (!file) throw new Error("Choose a sheet music PDF or select No sheet music.");
  if (!file.name.toLowerCase().endsWith(".pdf") || file.name.length > 180
      || file.size < 1 || file.size > MAX_SHEET_BYTES)
    throw new Error("Choose a nonempty PDF up to 500 KiB with a filename up to 180 characters.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("This file is not a PDF. Renaming another file does not convert it.");
  return { name: file.name, size: file.size, bytes };
}
export function sheetSlot(occupied: Iterable<string>) {
  const used = new Set(occupied);
  for (let i = 0; i < MAX_SHEETS; i++) if (!used.has(String(i))) return String(i);
  throw new Error("Your sheet music library is full. Reuse a PDF or delete an unused one.");
}
