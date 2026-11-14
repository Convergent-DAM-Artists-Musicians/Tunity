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
  type Recording,
} from "@/lib/audio-model";

import { watchSheets, deleteSheet } from "@/lib/sheet-repository";
import { type Sheet, type SheetChoice } from "@/lib/sheet-model";

import { useBandAccount } from "../accounts/account-provider";

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
  if (!user) throw new Error("Sign in before accessing recordings.");
  // Leaving the account or reaching the paywall disposes all local file URLs.
  return (
    <AudioSession key={user.uid} uid={user.uid}>
      {children}
    </AudioSession>
  );
}
function AudioSession({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const { status, announceStart } = useBandAccount();
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
    if (!status.canUpload) throw new Error("Your trial upload allowance or trial time has ended. Upgrade to upload more.");
    if (sheet.kind !== "none" && (sheetsLoading || sheetsError))
      throw new Error("Load your sheet music library first, or choose No sheet music.");
    working.current = true;
    setSaving(true);
    try {
      const result = await saveRecording(uid, file, title, sheet);
      if (mounted.current && result.firstUpload) announceStart();
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
      await deleteRecording(uid, id);
    });
  }
  async function removeSheet(key: string) {
    await mutate(async () => {
      const sheet = sheets.find(s => s.key === key);
      if (!sheet) return;
      await deleteSheet(uid, sheet);
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
