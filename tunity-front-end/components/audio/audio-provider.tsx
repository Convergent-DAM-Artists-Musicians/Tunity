"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  deleteRecording,
  saveRecording,
  watchRecordings,
} from "@/lib/audio-repository";
import {
  MAX_RECORDINGS,
  prepareAudio,
  type Recording,
} from "@/lib/audio-model";

import { watchSheets, deleteSheet } from "@/lib/sheet-repository";
import { prepareSheet, sheetSlot, type Sheet, type SheetChoice } from "@/lib/sheet-model";

type AudioContextValue = {
  sheets: Sheet[];
  sheetsLoading: boolean;
  sheetsError: string;
  removeSheet: (key: string) => Promise<void>;
  recordings: Recording[];
  loading: boolean;
  saving: boolean;
  error: string;
  upload: (file: File, title: string, sheet?: SheetChoice) => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: () => void;
};
const AudioContext = createContext<AudioContextValue | null>(null);
export function AudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Auth boundaries dispose guest/account bytes and object URLs immediately.
  return (
    <AudioSession key={user?.uid || "guest"} uid={user?.uid || null}>
      {children}
    </AudioSession>
  );
}
function AudioSession({
  uid,
  children,
}: {
  uid: string | null;
  children: ReactNode;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(!!uid);
  const [sheetsError, setSheetsError] = useState("");
  const sheetUrls = useRef(new Set<string>());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(!!uid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const urls = useRef(new Set<string>());
  const working = useRef(false);
  const mounted = useRef(true);
  function disposeUrls() {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
  }
  useEffect(() => {
    const ownedUrls = urls.current;
    const ownedSheets = sheetUrls.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
      ownedSheets.forEach(url => URL.revokeObjectURL(url));
      ownedSheets.clear();
    };
  }, []);
  useEffect(() => {
    if (!uid) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        "Could not confirm your recordings with Firebase. Retry when connected; cloud uploads are unavailable until your library loads.",
      );
    }, 12000);
    const unsubscribe = watchRecordings(
      uid,
      (items, fromCache) => {
        if (!mounted.current || fromCache) return;
        clearTimeout(timer);
        disposeUrls();
        const next = items.map(({ info, bytes, saved }) => {
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], { type: info.contentType }),
          );
          urls.current.add(url);
          return { ...info, url, saved };
        });
        setRecordings(next);
        setLoading(false);
        setError("");
      },
      () => {
        if (!mounted.current) return;
        clearTimeout(timer);
        setLoading(false);
        setError(
          "Could not load your recordings. Check your connection and the Firebase recording rules, then retry.",
        );
      },
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [uid, attempt]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const fail = () => {
      if (!active) return;
      setSheetsLoading(false);
      setSheetsError("Could not load sheet music. Check the new Firestore sheet music rules, then Retry library. Uploading without a PDF still works.");
    };
    const timer = setTimeout(fail, 12000);
    const stop = watchSheets(uid, items => {
      if (!active) return;
      clearTimeout(timer);
      sheetUrls.current.forEach(url => URL.revokeObjectURL(url));
      sheetUrls.current.clear();
      setSheets(items.map(({ info, bytes }) => {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        sheetUrls.current.add(url);
        return { ...info, url };
      }));
      setSheetsLoading(false);
      setSheetsError("");
    }, () => { clearTimeout(timer); fail(); });
    return () => { active = false; clearTimeout(timer); stop(); };
  }, [uid, attempt]);

  async function upload(file: File, title: string, sheet: SheetChoice = { kind: "none" }) {
    if (working.current) throw new Error("An upload is already in progress.");
    if (uid && (loading || error))
      throw new Error(
        "Load your saved recordings successfully before uploading.",
      );
    if ((uid ? recordings.length : urls.current.size) >= MAX_RECORDINGS)
      throw new Error(
        `Delete a recording first. The demo allows ${MAX_RECORDINGS} recordings per ${uid ? "account" : "guest session"}.`,
      );
    if (sheet.kind !== "none" && (sheetsLoading || sheetsError))
      throw new Error("Load your sheet music library first, or choose No sheet music.");
    working.current = true;
    setSaving(true);
    try {
      if (uid) {
        await saveRecording(uid, file, title, sheet);
      } else {
        const { info, bytes } = await prepareAudio(file, title);
        const pdf = sheet.kind === "new" ? await prepareSheet(sheet.file) : null;
        const existing = sheet.kind === "existing" ? sheets.find(s => s.key === sheet.key && s.slot === sheet.slot) : undefined;
        if (sheet.kind === "existing" && !existing) throw new Error("That sheet music is no longer available.");
        const added = pdf ? { slot: sheetSlot(sheets.map(s => s.slot)), key: crypto.randomUUID(), name: pdf.name } : undefined;
        if (!mounted.current) throw new Error("Your session changed. Please reopen the upload.");
        const sheetMusic = added || (existing ? { slot: existing.slot, key: existing.key, name: existing.name } : undefined);
        if (pdf && added) {
          const pdfUrl = URL.createObjectURL(new Blob([pdf.bytes], { type: "application/pdf" }));
          sheetUrls.current.add(pdfUrl);
          setSheets(current => [...current, { ...added, size: pdf.size, url: pdfUrl }]);
        }
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: info.contentType }),
        );
        urls.current.add(url);
        setRecordings((current) => [
          ...current,
          {
            ...info,
            sheetMusic,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            saved: false,
            url,
          },
        ]);
      }
      if (!mounted.current) throw new Error("Your session changed. Check the previous account before retrying.");
    } finally {
      working.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  async function mutate(action: () => Promise<void>) {
    if (working.current) throw new Error("Please wait for the current file operation.");
    working.current = true; setSaving(true);
    try { await action(); }
    finally { working.current = false; if (mounted.current) setSaving(false); }
  }
  async function remove(id: string) {
    await mutate(async () => {
      if (uid) await deleteRecording(uid, id);
      else {
        const entry = recordings.find(r => r.id === id);
        if (entry) { URL.revokeObjectURL(entry.url); urls.current.delete(entry.url); }
        setRecordings(current => current.filter(r => r.id !== id));
      }
    });
  }
  async function removeSheet(key: string) {
    await mutate(async () => {
      const sheet = sheets.find(s => s.key === key);
      if (!sheet) return;
      if (uid) await deleteSheet(uid, sheet);
      else {
        if (recordings.some(r => r.sheetMusic?.key === key))
          throw new Error("Delete recordings that use this PDF before deleting the PDF.");
        URL.revokeObjectURL(sheet.url); sheetUrls.current.delete(sheet.url);
        setSheets(current => current.filter(s => s.key !== key));
      }
    });
  }
  return (
    <AudioContext.Provider
      value={{
        recordings,
        sheets, sheetsLoading, sheetsError, removeSheet,
        loading,
        saving,
        error,
        upload,
        remove,
        retry: () => {
          setError("");
          setLoading(!!uid);
          setSheetsError("");
          setSheetsLoading(!!uid);
          setAttempt((n) => n + 1);
        },
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}
export function useAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("AudioProvider is missing.");
  return value;
}
