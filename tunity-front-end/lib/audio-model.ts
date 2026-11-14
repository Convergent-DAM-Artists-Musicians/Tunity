/** Tiny Firestore-only MVP. Keep binary well below Firestore's 1 MiB document limit. */
export const MAX_AUDIO_BYTES = 500 * 1024;
export const MAX_RECORDINGS = 5;
export const AUDIO_LIMIT_LABEL = "500 KiB";
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.flac,.ogg,.webm,.mp4,.mov";
export const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export type RecordingInfo = {
  id: string;
  name: string;
  title: string;
  contentType: string;
  size: number;
  createdAt: string;
  sheetMusic?: import("./sheet-model").SheetRef;
};
export type Recording = RecordingInfo & { url: string; saved: boolean };
const formats: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  webm: "audio/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export function validateAudioInfo(
  file: { name: string; size: number; type?: string },
  title: string,
) {
  if (!file.name || file.name.length > 180)
    throw new Error("Use an audio filename of 180 characters or fewer.");
  if (
    !Number.isInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_AUDIO_BYTES
  )
    throw new Error(
      `Choose a nonempty audio file up to ${AUDIO_LIMIT_LABEL}. Try a short compressed MP3 for the demo.`,
    );
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const contentType = extension === "webm" && file.type?.startsWith("video/")
    ? "video/webm" : formats[extension];
  if (!contentType)
    throw new Error(
      "Choose audio or an MP4, MOV, or WebM practice video.",
    );
  if (title.trim().length > 100)
    throw new Error("Use a recording title of 100 characters or fewer.");
  return {
    name: file.name,
    title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
    size: file.size,
    contentType,
  };
}
export function verifyAudioHeader(contentType: string, bytes: Uint8Array) {
  const text = (start: number, size: number) =>
    String.fromCharCode(...bytes.slice(start, start + size));
  const sync =
    bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  const valid =
    bytes.length >= 4 &&
    ((contentType === "audio/mpeg" && (text(0, 3) === "ID3" || sync)) ||
      (contentType === "audio/wav" &&
        text(0, 4) === "RIFF" &&
        text(8, 4) === "WAVE") ||
      (["audio/mp4", "video/mp4", "video/quicktime"].includes(contentType) && text(4, 4) === "ftyp") ||
      (contentType === "audio/aac" && sync) ||
      (contentType === "audio/flac" && text(0, 4) === "fLaC") ||
      (contentType === "audio/ogg" && text(0, 4) === "OggS") ||
      (["audio/webm", "video/webm"].includes(contentType) &&
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3));
  if (!valid)
    throw new Error(
      "This file does not match its audio format or video container. Please choose a valid recording.",
    );
}
export function firstAvailableSlot(occupied: Iterable<string>): string {
  const used = new Set(occupied);
  for (let slot = 0; slot < MAX_RECORDINGS; slot++)
    if (!used.has(String(slot))) return String(slot);
  throw new Error(
    `Your profile has ${MAX_RECORDINGS} recordings. Delete one before uploading another.`,
  );
}
export async function prepareAudio(file: File, title = "") {
  const info = validateAudioInfo(file, title);
  const bytes = new Uint8Array(await file.arrayBuffer());
  verifyAudioHeader(info.contentType, bytes);
  return { info, bytes };
}
