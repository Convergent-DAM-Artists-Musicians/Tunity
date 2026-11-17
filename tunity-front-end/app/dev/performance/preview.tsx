"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { PerformanceReview } from "@/components/rhythm/rhythm-review";
import { CoachPanel } from "@/components/studio/coach-panel";
import { EtudeWriter, type EtudeSeed } from "@/components/studio/etude-writer";
import type { FocusRequest } from "@/components/studio/evidence";
import { etudePiece, SessionPracticeCard } from "@/components/studio/session-practice";
import { TakeComparison, type TakeOption } from "@/components/studio/take-comparison";
import { sessionPractice, type AnalysisResult, type ReviewFocus } from "@/lib/studio/analysis";
import { instrumentForProfile } from "@/lib/studio/etude";
import { putStudio } from "@/lib/studio/studio-db";
import type { CoachResult, TakeMessage } from "@/lib/studio/types";
import type { PerformanceResult } from "../../../../back-end/performance-analyzer/src/types";

type CatalogEntry = {
  id: string;
  scoreKey: string | null;
  findings: number;
  durationSec: number;
  hasReference: boolean;
  hasAudio?: boolean;
  featured: boolean;
};

const FALLBACK_SAMPLES = [
  "05-verified",
  "09-verified",
  "10-verified",
  "15-verified",
  "33-verified",
  "42-triplets",
  "control-uneven-quadruplet",
  "accent-absent",
  "accent-present",
  "staccato-clean",
  "staccato-long",
  "slur-connected",
  "slur-gap",
  "clean",
  "pitch-drift",
];

export function Preview({ initialSample = "05-verified" }: { initialSample?: string }) {
  const [sample, setSample] = useState(initialSample);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [chat, setChat] = useState<TakeMessage[]>([]);
  const [coach, setCoach] = useState<Record<string, CoachResult>>({});
  const [focus, setFocus] = useState<ReviewFocus>();
  const [siblings, setSiblings] = useState<TakeOption[]>([]);
  const [loaded, setLoaded] = useState<{
    sample: string;
    result: PerformanceResult;
    audio: File;
  }>();
  const [error, setError] = useState("");
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [seed, setSeed] = useState<EtudeSeed>();
  const [notice, setNotice] = useState("");

  function openPractice(result: PerformanceResult, coachWeaknesses?: string[]) {
    const session = sessionPractice(result, sample);
    const weaknesses = coachWeaknesses?.length ? coachWeaknesses : session.weaknesses;
    setSeed({
      session: sample,
      weaknesses,
      context: session.context,
      summary: session.summary,
      prompt: weaknesses.length ? "" : "Write a new exercise with similar meter and phrasing, using original notes.",
      timeSignature: session.meter,
      tempoBpm: session.scoreBpm,
      collection: sample,
    });
    setNotice("");
    dialog.current?.showModal();
  }

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/dev-performance?catalog=1", { signal: abort.signal })
      .then(async (r) => (r.ok ? r.json() as Promise<CatalogEntry[]> : []))
      .then((entries) => { if (!abort.signal.aborted) setCatalog(entries); })
      .catch(() => {});
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      fetch(`/api/dev-performance?sample=${sample}`, { signal: abort.signal }).then(async (r) => {
        if (!r.ok) throw Error("Could not load this practice clip. Check that your checkout includes data/practice-clips.");
        return r.json();
      }),
      fetch(`/api/dev-performance?sample=${sample}&audio=1`, { signal: abort.signal }).then((r) => {
        if (!r.ok) throw Error("Audio fixture missing for this sample.");
        return r.blob();
      }),
    ])
      .then(([result, blob]) => {
        setLoaded({
          sample,
          result,
          audio: new File([blob], `${sample}.wav`, { type: "audio/wav" }),
        });
        setError("");
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [sample]);

  useEffect(() => {
    if (!loaded || loaded.sample !== sample) return;
    const key = loaded.result.insights?.scoreKey;
    const peers = key ? catalog.filter((c) => c.id !== sample && c.scoreKey === key).slice(0, 8) : [];
    if (!peers.length) return;
    const abort = new AbortController();
    Promise.all(peers.map(async (peer) => {
      const result = await fetch(`/api/dev-performance?sample=${peer.id}`, { signal: abort.signal }).then(async (r) => {
        if (!r.ok) throw Error(peer.id);
        return r.json() as Promise<AnalysisResult>;
      });
      return {
        id: peer.id,
        name: peer.id,
        date: "Fixture",
        createdAt: peer.id.localeCompare(sample) < 0 ? "2020-01-01" : "2020-01-02",
        result,
      } satisfies TakeOption;
    }))
      .then((items) => { if (!abort.signal.aborted) setSiblings(items); })
      .catch(() => {});
    return () => abort.abort();
  }, [loaded, sample, catalog]);

  const samples = (catalog.length
    ? catalog.filter((c) => c.featured && c.hasAudio !== false).map((c) => c.id)
    : FALLBACK_SAMPLES);

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "32px auto",
        padding: "0 24px",
        color: "#efdbc5",
      }}
    >
      <Link className="development-back" href="/workspace">← Back to workspace</Link>
      <label className="field-label">
        <select aria-label="Recording" value={sample} onChange={(e) => {
          setSample(e.target.value);
          setChat([]);
          setFocus(undefined);
          setSiblings([]);
        }}>
          {samples.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : loaded?.sample === sample ? (
        <>
          <CoachPanel
            key={`coach-${sample}`}
            className="preview-chat"
            title="Practice Clip"
            result={loaded.result}
            coach={coach[sample]}
            chat={chat}
            onCoach={(next) => setCoach((all) => ({ ...all, [sample]: next }))}
            onChat={setChat}
            onFocus={(request: FocusRequest) => setFocus({ ...request, nonce: Date.now() })}
            onEtude={(weaknesses) => openPractice(loaded.result, weaknesses)}
          />
          <SessionPracticeCard name={sample} findingCount={loaded.result.findings.length}
            onGenerate={() => openPractice(loaded.result, coach[sample]?.targets.map((t) => `${t.title}: ${t.observation}`))} />
          {notice && <p className="studio-status" role="status">{notice} <Link href="/workspace">Open Practice pieces →</Link></p>}
          <PerformanceReview
            key={sample}
            events={loaded.result.rhythmEvents}
            findings={loaded.result.findings}
            insights={loaded.result.insights}
            groups={loaded.result.rhythmGroups}
            alignment={loaded.result.alignment}
            audio={loaded.audio}
            focus={focus}
          />
          <TakeComparison
            key={`compare-${sample}`}
            variant="clip"
            allowUpload
            current={{
              id: sample,
              name: sample,
              date: "This clip",
              createdAt: "2020-01-02",
              result: loaded.result,
            }}
            others={siblings}
            onFocus={(request: FocusRequest) => setFocus({ ...request, nonce: Date.now() })}
          />
        </>
      ) : (
        <p>Loading practice clip…</p>
      )}
      <dialog ref={dialog} className="project-dialog studio-dialog" aria-labelledby="dialog-title"
        onClose={() => setSeed(undefined)}
        onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
        <div className="dialog-content">
          <button className="dialog-close" aria-label="Close dialog" onClick={() => dialog.current?.close()}>✕</button>
          {seed && (
            <EtudeWriter key={JSON.stringify(seed)} seed={seed} defaultInstrument={instrumentForProfile()}
              collections={[seed.collection ?? "Etudes", "Etudes"]}
              onSave={async (etude, collection, request) => {
                if (!user) throw new Error("Sign in to save practice pieces.");
                await putStudio("pieces", etudePiece(etude, collection, request, user.uid));
                dialog.current?.close();
                setNotice(`“${etude.title}” saved to Practice pieces.`);
              }} />
          )}
        </div>
      </dialog>
    </main>
  );
}
