"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth } from "@/lib/firebase";
import { PerformanceReview } from "@/components/rhythm/rhythm-review";
import { useAuth } from "@/components/auth-provider";
import { useBandAccount } from "@/components/accounts/account-provider";
import { useAudio } from "@/components/audio/audio-provider";
import { AudioLibrary } from "@/components/audio/audio-library";
import { SheetPicker } from "@/components/audio/sheet-music";
import { AUDIO_ACCEPT, AUDIO_LIMIT_LABEL, validateAudioInfo } from "@/lib/audio-model";
import { type SheetChoice } from "@/lib/sheet-model";
import { loadProfile } from "@/lib/profile";
import { sessionPractice, type AnalysisResult, type ReviewFocus } from "@/lib/studio/analysis";
import { cleanNotes } from "@/lib/studio/compare";
import { instrumentForProfile } from "@/lib/studio/etude";
import { listStudio, putStudio } from "@/lib/studio/studio-db";
import type { CoachResult, EtudeResult, PracticePiece, StudyGuide as Guide, StudySource, TakeMessage } from "@/lib/studio/types";
import { CoachPanel } from "@/components/studio/coach-panel";
import { TakeComparison, type TakeOption } from "@/components/studio/take-comparison";
import { EtudeWriter, type EtudeSeed } from "@/components/studio/etude-writer";
import { etudePiece, SessionPracticeCard } from "@/components/studio/session-practice";
import { StudyGuide } from "@/components/studio/study-guide";
import { PieceDetail, PracticePieces } from "@/components/studio/practice-pieces";
import type { FocusRequest } from "@/components/studio/evidence";

type Result = AnalysisResult;

type Project = {
  id: string;
  name: string;
  semester: string;
  date: string;
  file: string;
  sample?: boolean;
  trashed?: boolean;
  result?: Result;
  audioFile?: File;
  createdAt?: string;
  pieceId?: string;
  coach?: CoachResult;
  chat?: TakeMessage[];
};

/** A score preloaded into the upload dialog, e.g. from a practice piece. */
type ReferencePreset = { file: File; title: string; pieceId?: string };

const today = () => new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
const studyKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const isScoreFile = (file?: File | null) => !!file && /\.(xml|musicxml|mxl)$/i.test(file.name);

type IconName =
  | "home" | "folder" | "trash" | "search" | "plus" | "sliders"
  | "user" | "music" | "arrow" | "close" | "upload" | "check" | "spark";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    folder: <path d="M3 6h6l2 3h10v11H3ZM3 6V4h7l2 2h8v3" />,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    sliders: <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="9" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="7" cy="18" r="2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    music: <><path d="M9 18V5l11-2v13M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="16" rx="3" ry="2.5" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <path d="M12 2c.7 5.8 4.2 9.3 10 10-5.8.7-9.3 4.2-10 10-.7-5.8-4.2-9.3-10-10 5.8-.7 9.3-4.2 10-10Z" fill="currentColor" stroke="none" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <span className="brand">
      <svg viewBox="0 0 40 45" fill="none" aria-hidden="true">
        <path d="M8 5c12 0 8 18 13 25 3 4 8 3 8-2V15l6-2v19c0 13-20 12-22 1L9 13 4 9Z"
          stroke="currentColor" strokeWidth="1.4" />
        <path d="m18 10 12 7M19 15l11 7M21 21l9 6" stroke="currentColor" />
      </svg>
      <span>Tunity</span>
    </span>
  );
}

const semesters = ["All", "Fall ’26", "Spring ’25"];

const seeds: Project[] = [
  ["Autumn recital", "Fall ’26", "Oct 26", "recital-take-03.wav"],
  ["Long tones & warm-ups", "Fall ’26", "Oct 24", "long-tones.wav"],
  ["Arban · Study No. 1", "Fall ’26", "Oct 22", "arban-study.wav"],
  ["A little jazz", "Spring ’25", "May 12", "jazz-session.mp3"],
  ["B♭ major scale", "Fall ’26", "Oct 20", "bb-major.wav"],
  ["First chair audition", "Spring ’25", "Apr 28", "audition.wav"],
  ["Sunday practice", "Fall ’26", "Oct 18", "sunday.wav"],
  ["Clarke · Technical studies", "Fall ’26", "Oct 16", "clarke-02.wav"],
  ["Spring concert", "Spring ’25", "Apr 18", "spring-concert.wav"],
  ["Finding my sound", "Spring ’25", "Apr 14", "tone-study.wav"],
  ["Articulation exercises", "Fall ’26", "Oct 12", "articulation.wav"],
  ["One more take", "Spring ’25", "Apr 08", "final-take.wav"],
].map(([name, semester, date, file], i) => ({
  id: `sample-${i}`, name, semester, date, file, sample: true,
}));



export default function Home() {
  const [projects, setProjects] = useState<Project[]>(seeds);
  const [view, setView] = useState("Home");
  const [semester, setSemester] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [modal, setModal] = useState<"upload" | "project" | "account" | "etude" | "piece" | "study" | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [sheet, setSheet] = useState<SheetChoice>({ kind: "none" });
  const [runAnalysis, setRunAnalysis] = useState(false);
  const { upload: uploadAudio, loading: libraryLoading, error: libraryError } = useAudio();
  const [audio, setAudio] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [uploadSemester, setUploadSemester] = useState("Fall ’26");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { user, loading: authLoading, authError, authBusy, logOut, setAuthError } = useAuth();
  const { status, showUpgrade } = useBandAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<PracticePiece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<PracticePiece | null>(null);
  const [preset, setPreset] = useState<ReferencePreset | null>(null);
  const [focus, setFocus] = useState<ReviewFocus>();
  const [etudeSeed, setEtudeSeed] = useState<EtudeSeed>();
  const [studySource, setStudySource] = useState<StudySource | null>(null);
  const [studyFromUpload, setStudyFromUpload] = useState(false);
  const [studyCache, setStudyCache] = useState<Record<string, Guide>>({});
  const [instrument, setInstrument] = useState(instrumentForProfile());

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([listStudio<Project>("projects", user.uid), listStudio<PracticePiece>("pieces", user.uid)])
      .then(([savedProjects, savedPieces]) => {
        if (!active) return;
        savedProjects.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        setProjects((items) => [...savedProjects.filter((s) => !items.some((i) => i.id === s.id)), ...items]);
        setPieces(savedPieces);
      })
      .catch(() => { if (active) setNotice("Saved analyses and practice pieces could not be loaded in this browser."); });
    loadProfile(user.uid).then((p) => { if (active && p) setInstrument(instrumentForProfile(p.instrument)); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  function saveProject(project: Project) {
    if (!user || project.sample) return;
    putStudio("projects", { ...project, uid: user.uid })
      .catch(() => setNotice("This browser could not save the analysis. Download the JSON to keep it."));
  }

  function updateProject(id: string, patch: Partial<Project>) {
    setProjects((items) => items.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch };
      saveProject(next);
      return next;
    }));
    setSelected((s) => (s?.id === id ? { ...s, ...patch } : s));
  }

  async function savePiece(piece: PracticePiece) {
    await putStudio("pieces", piece);
    setPieces((items) => [piece, ...items.filter((p) => p.id !== piece.id)]);
    setSelectedPiece((s) => (s?.id === piece.id ? piece : s));
  }

  function openProject(project: Project) {
    setSelected(project);
    setFocus(undefined);
    setModal("project");
  }

  function openUpload(withReference?: ReferencePreset) {
    if (!status.canUpload) { showUpgrade(); return; }
    setSheet({ kind: "none" });
    setAudio(null);
    setReference(withReference?.file ?? null);
    setPreset(withReference ?? null);
    setRunAnalysis(!!withReference);
    if (withReference) setPrompt(`${withReference.title} · Take ${projects.filter((p) => p.pieceId && p.pieceId === withReference.pieceId).length + 1}`);
    setError("");
    setModal("upload");
  }

  function generatePractice() {
    setEtudeSeed(undefined);
    setModal("etude");
  }

  function practiceForTake(project: Project, result: Result, coachWeaknesses?: string[]) {
    const session = sessionPractice(result, project.name);
    const piece = pieces.find((p) => p.id === project.pieceId);
    const weaknesses = coachWeaknesses?.length ? coachWeaknesses : session.weaknesses;
    setEtudeSeed({
      session: project.name,
      weaknesses,
      context: session.context,
      summary: session.summary,
      prompt: weaknesses.length ? "" : "Write a new exercise with similar meter and phrasing, using original notes.",
      instrument: piece?.instrument,
      keyName: piece?.keyName,
      timeSignature: piece?.meter ?? session.meter,
      tempoBpm: piece?.tempoBpm ?? session.scoreBpm,
      collection: project.name.slice(0, 40),
    });
    setModal("etude");
  }

  function openStudy(source: StudySource, fromUpload: boolean) {
    setStudySource(source);
    setStudyFromUpload(fromUpload);
    setModal("study");
  }

  async function saveEtude(etude: EtudeResult, collection: string, request: string) {
    if (!user) throw new Error("Sign in to save practice pieces.");
    const piece = etudePiece(etude, collection, request, user.uid);
    await savePiece(piece);
    setView("Pieces");
    setSelectedPiece(piece);
    setModal("piece");
    setNotice(`“${piece.title}” saved to Practice pieces.`);
  }

  async function saveStudiedScore(source: StudySource, guide: Guide) {
    if (!user) throw new Error("Sign in to save practice pieces.");
    const piece: PracticePiece = {
      id: crypto.randomUUID(), uid: user.uid, title: guide.facts.title !== "Untitled score" ? guide.facts.title : source.title,
      createdAt: new Date().toISOString(), source: "score", collection: "Scores", fileName: source.file.name,
      file: source.file, xml: /\.(xml|musicxml)$/i.test(source.file.name) ? await source.file.text() : undefined,
      reference: guide.reference, instrument: guide.facts.partName, tempoBpm: guide.facts.tempoBpm, meter: guide.facts.meter, study: guide,
    };
    await savePiece(piece);
    setStudySource({ ...source, pieceId: piece.id });
    if (studyFromUpload && reference === source.file) setPreset({ file: source.file, title: piece.title, pieceId: piece.id });
  }

  const requestFocus = (f: FocusRequest) => setFocus({ ...f, nonce: Date.now() });
  const pieceFile = (piece: PracticePiece) => new File([piece.file], piece.fileName, { type: piece.file.type || "application/xml" });

  function chooseAudio(file?: File) {
    if (!file) return;
    try {
      const info = validateAudioInfo(file, prompt);
      if (info.contentType.startsWith("video/")) setRunAnalysis(false);
    } catch (err) {
      setAudio(null);
      setError(
        err instanceof Error ? err.message : "Choose a valid audio file.",
      );
      return;
    }
    setAudio(file);
    setError("");
  }

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (!audio || busy || authLoading) return;
    setBusy(true);
    setError("");
    let uploaded = false;
    try {
      await uploadAudio(audio, prompt, sheet);
      uploaded = true;
      let data: Result | undefined;
      if (runAnalysis && !audio.type.startsWith("video/") && !/\.(mp4|mov)$/i.test(audio.name)) {
        try {
          const form = new FormData();
          form.append("audio", audio);
          if (reference) form.append("reference", reference);
          const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { authorization: `Bearer ${await getFirebaseAuth().currentUser!.getIdToken()}` },
            body: form,
            signal: AbortSignal.timeout(240_000),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Analysis could not complete.");
          data = result;
        } catch {
          setNotice(
            "Your recording was uploaded, but analysis could not complete. You can still play it in My recordings.",
          );
        }
      }
      if (data) {
        const project: Project = {
          id: crypto.randomUUID(),
          name: prompt.trim() || audio.name.replace(/\.[^.]+$/, ""),
          semester: uploadSemester,
          file: audio.name,
          date: today(),
          createdAt: new Date().toISOString(),
          pieceId: preset?.pieceId,
          result: data,
          audioFile: audio,
        };
        setProjects((items) => [project, ...items]);
        saveProject(project);
        openProject(project);
        setNotice(
          user
            ? "Recording saved to your profile and analyzed."
            : "Recording saved and analyzed.",
        );
      } else {
        setModal(null);
        if (!runAnalysis)
          setNotice(
            user
              ? "Recording saved to your profile."
              : "Recording saved to your band.",
          );
      }

      setAudio(null);
      setReference(null);
      setPreset(null);
      setSheet({ kind: "none" });
      setPrompt("");
      setRunAnalysis(false);
      setView("Home");
      setSemester("All");
      setSearch("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload was not confirmed. Reload your library before retrying.",
      );
    } finally {
      setBusy(false);
      if (uploaded) setAudio(null);
    }
  }

  function trashProject() {
    if (!selected) return;
    updateProject(selected.id, { trashed: !selected.trashed });
    setNotice(selected.trashed ? "Project restored." : "Project moved to Trash.");
    setModal(null);
  }

  const visible = projects.filter(p =>
    Boolean(p.trashed) === (view === "Trash") &&
    (semester === "All" || p.semester === semester) &&
    `${p.name} ${p.file}`.toLowerCase().includes(search.toLowerCase())
  );

  if (sort === "name") visible.sort((a, b) => a.name.localeCompare(b.name));
  const result = selected?.result;

  const developmentExamples = process.env.NODE_ENV === "development" && user && view !== "Trash"
    ? [
        { id: "05-verified", name: "Practice Clip" },
      ].filter(example => `${example.name} rhythm pitch articulation dynamics tempo`.toLowerCase().includes(search.toLowerCase()))
    : [];
  const displayedCount = visible.length + developmentExamples.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/workspace" aria-label="Tunity home"><Brand /></Link>

        <nav aria-label="Main navigation">
          {(["Home", "Pieces", "Files", "Trash"] as const).map((item, i) => (
            <button key={item} className={`nav-item ${view === item ? "active" : ""}`}
              aria-current={view === item ? "page" : undefined}
              onClick={() => { setView(item); setSearch(""); setNotice(""); }}>
              <Icon name={(["home", "spark", "folder", "trash"] as const)[i]} />
              <span>{item === "Pieces" ? "Practice pieces" : item}</span>
              {item === "Files" && (
                <span className="nav-count">{projects.filter(p => !p.trashed).length}</span>
              )}
              {item === "Pieces" && (
                <span className="nav-count">{pieces.filter(p => !p.trashed).length}</span>
              )}
            </button>
          ))}
          <Link className="nav-item" href="/profile"><Icon name="user" /><span>My profile</span></Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="practice-note">
            <span className="tiny-label">A LITTLE EVERY DAY</span>
            <p>Great sound starts<br />with showing up.</p>
            <span className="note-line" />
          </div>
          {authLoading ? <span className="profile-auth-loading" role="status">Checking account…</span> : user ? (
            <button className="account-button" onClick={() => { setAuthError(""); setModal("account"); }}>
              <span className="avatar"><Icon name="user" /></span>
              <span className="account-label">
                <span>{user.displayName || user.email}</span>
                <small>Shared band account</small>
              </span>
              <span className="account-dot signed-in" />
            </button>
          ) : null}
        </div>
      </aside>

      <main className="main-content">
        <header className="masthead">
          <span className="masthead-rule" /><Brand />
          <span className="masthead-rule" />
        </header>

        <section className="welcome" aria-labelledby="welcome-heading">
          <div className="welcome-topline">
            <span className="eyebrow">YOUR PRACTICE, IN TUNE</span>
            <span className="hero-notes" aria-hidden="true">♩ ♪ ♫</span>
          </div>
          <h1 id="welcome-heading">Welcome! Upload files and ask away!</h1>
          <p>A space for your sound. A little clarity for your next take.</p>

          <form className="prompt-bar" onSubmit={e => { e.preventDefault(); openUpload(); }}>
            <Icon name="music" />
            <input aria-label="New project name or practice goal"
              placeholder="What are you working on today?" value={prompt}
              maxLength={100} onChange={e => setPrompt(e.target.value)} />
            <button type="submit" aria-label="Upload a recording"><Icon name="plus" size={29} /></button>
          </form>

          <div className="hero-footer">
            <span>Record. Reflect. Find your rhythm.</span>
            <div className="hero-actions">
              <button className="generate-project" onClick={generatePractice}><Icon name="spark" size={15} /> Generate practice</button>
              <button onClick={() => openUpload()}>Upload a recording <Icon name="arrow" size={16} /></button>
            </div>
          </div>
        </section>

        <AudioLibrary onUpload={() => openUpload()} />
        {notice && <p className="audio-library-status" role="status">{notice}</p>}
        <section className="workspace" aria-label={view === "Pieces" ? "Practice pieces" : "Project library"}>
          {view === "Pieces" ? (
            <PracticePieces pieces={pieces}
              takeCounts={Object.fromEntries(pieces.map((p) => [p.id, projects.filter((t) => t.pieceId === p.id && !t.trashed).length]))}
              onOpen={(piece) => { setSelectedPiece(piece); setModal("piece"); }}
              onWrite={generatePractice}
              onStudy={(file) => openStudy({ file, title: file.name.replace(/\.[^.]+$/, "") }, false)} />
          ) : (<>
          <div className="section-title">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h2>
                {view === "Trash" ? "Trash" : view === "Files" ? "Your files" : "Your projects"}
                <span>{displayedCount.toString().padStart(2, "0")}</span>
              </h2>
            </div>
            <div className="section-actions">
              <button className="new-project generate-project" onClick={generatePractice}>
                <Icon name="spark" size={17} /> Generate practice
              </button>
              <button className="new-project" onClick={() => openUpload()}>
                <Icon name="plus" size={17} /> New project
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="semester-tabs" role="group" aria-label="Filter by semester">
              {semesters.map(s => (
                <button key={s} className={semester === s ? "selected" : ""}
                  aria-pressed={semester === s} onClick={() => setSemester(s)}>{s}</button>
              ))}
            </div>
            <div className="search-tools">
              <label className="search-box">
                <Icon name="search" size={17} />
                <input aria-label="Search projects" placeholder="Search projects"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && (
                  <button aria-label="Clear search" onClick={() => setSearch("")}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </label>
              <button className={`filter-button ${showFilters ? "on" : ""}`}
                aria-label="Sort projects" aria-expanded={showFilters}
                onClick={() => setShowFilters(!showFilters)}><Icon name="sliders" /></button>
            </div>
          </div>

          {showFilters && (
            <div className="filter-row">
              <label>Sort by{" "}
                <select value={sort} onChange={e => setSort(e.target.value)}>
                  <option value="recent">Recently added</option>
                  <option value="name">Project name (A–Z)</option>
                </select>
              </label>
            </div>
          )}

          <div className="library-meta">
            <span>{view === "Trash" ? "Restore a project whenever you’re ready." : "A new perspective on every performance."}</span>
            <span><i />{projects.some(p => !p.sample) ? "Session workspace" : "Sample projects"}</span>
          </div>
          <p className="sr-only" role="status">{notice || `${displayedCount} projects shown`}</p>

          {displayedCount ? (
            <div className={`project-grid ${view === "Files" ? "file-list" : ""}`}>
              {developmentExamples.map(example => (
                <Link key={example.id} className="project-card development-folder"
                  href={`/dev/performance?sample=${example.id}`}>
                  <div className="card-top">
                    <span className="project-symbol tone-0"><Icon name="folder" size={21} /></span>
                    <span className="card-arrow"><Icon name="arrow" size={17} /></span>
                  </div>
                  <h3>{example.name}</h3>
                  <div className="card-bottom"><span>Analysis &amp; recording</span><span>Sample</span></div>
                  <div className="card-accent" />
                </Link>
              ))}
              {visible.map((project, i) => (
                <button key={project.id} className="project-card"
                  onClick={() => openProject(project)}>
                  <div className="card-top">
                    <span className={`project-symbol tone-${i % 4}`}>
                      <Icon name={view === "Files" ? "music" : "folder"} size={21} />
                    </span>
                    <span className="card-arrow"><Icon name="arrow" size={17} /></span>
                  </div>
                  <h3>{view === "Files" ? project.file : project.name}</h3>
                  <div className="card-bottom">
                    <span>{project.semester}</span>
                    <span>{project.sample ? "Sample" : "Analyzed"}<span className="meta-dot">·</span>{project.date}</span>
                  </div>
                  <div className="card-accent" />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Icon name={view === "Trash" ? "trash" : "folder"} size={35} />
              <h3>{search ? "No matching projects" : view === "Trash" ? "A clean slate" : "Room for something new"}</h3>
              <p>{search ? "Try a different name or semester." : view === "Trash" ? "Projects you remove will appear here." : "Upload a recording to start this chapter."}</p>
              {view !== "Trash" && <button className="primary-button" onClick={() => openUpload()}>Upload a recording</button>}
            </div>
          )}

          </>)}

          <footer className="workspace-footer">
            <Brand /><span>Made for the moments between the notes.</span>
            <span>Current practice session</span>
          </footer>
        </section>
      </main>

      <dialog ref={dialog} className={`project-dialog ${modal === "project" && selected?.result ? "rhythm-dialog" : ""} ${modal === "etude" || modal === "piece" || modal === "study" ? "studio-dialog" : ""}`} aria-labelledby="dialog-title"
        onCancel={e => { if (busy) e.preventDefault(); else setModal(null); }}
        onClick={e => { if (e.target === dialog.current && !busy) setModal(null); }}>
        <div className="dialog-content">
          <button className="dialog-close" aria-label="Close dialog"
            disabled={busy} onClick={() => setModal(null)}><Icon name="close" /></button>

          {modal === "upload" && (
            <form className="upload-form" onSubmit={analyze}>
              <span className="eyebrow">MAKE ROOM FOR PROGRESS</span>
              <h2 id="dialog-title">Let’s hear it.</h2>
              <p className="dialog-intro">
                Upload short audio or video. Signed-in uploads save to your
                shared band account.
              </p>

              <label className="field-label">
                Project name
                <input
                  value={prompt}
                  maxLength={100}
                  disabled={busy}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Autumn recital · Take 4"
                />
              </label>

              <button
                type="button"
                className={`drop-zone ${audio ? "has-file" : ""}`}
                disabled={busy}
                onClick={() => audioInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) chooseAudio(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  <Icon name={audio ? "check" : "upload"} size={26} />
                </span>
                <strong>{audio ? audio.name : "Drop a recording here"}</strong>
                <span>
                  {audio
                    ? `${(audio.size / 1024 / 1024).toFixed(2)} MB · Click to replace`
                    : "or click to browse · audio, MP4, MOV, WebM"}
                </span>
              </button>
              <input
                ref={audioInput}
                type="file"
                accept={AUDIO_ACCEPT}
                className="sr-only"
                aria-label="Choose recording"
                disabled={busy}
                onChange={(e) => chooseAudio(e.target.files?.[0])}
              />

              <SheetPicker value={sheet} onChange={setSheet} disabled={busy} />
              <label className="upload-help">
                <input
                  type="checkbox"
                  checked={runAnalysis}
                  disabled={busy || (!!audio && (audio.type.startsWith("video/") || /\.(mp4|mov)$/i.test(audio.name)))}
                  onChange={(e) => setRunAnalysis(e.target.checked)}
                />{" "}
                Analyze this performance · pitch, rhythm and expression together
              </label>
              <div className="upload-options">
                <label className="field-label">
                  Semester
                  <select
                    value={uploadSemester}
                    disabled={busy}
                    onChange={(e) => setUploadSemester(e.target.value)}
                  >
                    {semesters.slice(1).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {preset ? (
                  <div className="field-label">
                    Reference score
                    <span className="reference-chip">
                      <span>♪ {preset.title}</span>
                      <button type="button" className="text-button" disabled={busy}
                        onClick={() => { setPreset(null); setReference(null); }}>Change</button>
                    </span>
                  </div>
                ) : (
                  <label className="field-label">
                    Reference score <span className="optional">optional</span>
                    <input
                      type="file"
                      accept=".json,.xml,.musicxml,.mxl"
                      disabled={busy || !runAnalysis}
                      onChange={(e) => setReference(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
              {isScoreFile(reference) && (
                <p className="upload-help study-link">
                  <button type="button" className="text-button" disabled={busy}
                    onClick={() => {
                      const piece = pieces.find((p) => p.id === preset?.pieceId);
                      openStudy({ file: reference!, title: preset?.title || prompt.trim() || reference!.name.replace(/\.[^.]+$/, ""), pieceId: piece?.id }, true);
                    }}>
                    <Icon name="spark" size={14} /> Get a study guide before recording: hard passages, breathing points and a starting tempo
                  </button>
                </p>
              )}

              <p className="upload-help">
                Audio or video, up to {AUDIO_LIMIT_LABEL}. Analysis accepts audio and an optional reviewed MusicXML, MXL or JSON score. PDF uploads are saved for viewing; their notes are not automatically extracted here.
              </p>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}

              {user && libraryError && (
                <p className="error-message" role="alert">
                  {libraryError} Close this dialog and use Retry library.
                </p>
              )}
              {libraryLoading && (
                <p className="upload-help" role="status">
                  Loading your recording slots…
                </p>
              )}
              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  !audio ||
                  busy ||
                  authLoading ||
                  libraryLoading ||
                  (!!user && !!libraryError)
                }
              >
                {busy ? (
                  <>
                    <span className="spinner" /> Uploading your recording…
                  </>
                ) : (
                  <>
                    {user ? "Save to my band" : "Save to my band"}{" "}
                    <Icon name="arrow" size={18} />
                  </>
                )}
              </button>
              <p className="privacy-note" role="status">
                {busy
                  ? "Saving your file; optional model analysis can take up to 3 minutes. Keep this tab open."
                  : "Recordings and sheet music are saved to your shared band account. Analysis results and practice pieces are saved in this browser."}
              </p>
            </form>
          )}

          {modal === "project" && selected && (
            <>
              <span className="eyebrow">{selected.sample ? "SAMPLE PROJECT" : "YOUR PERFORMANCE"} · {selected.semester}</span>
              <h2 id="dialog-title">{selected.name}</h2>
              <p className="dialog-intro file-caption"><Icon name="music" size={16} />{selected.file}</p>

              {result ? (
                <>
                  <div className="result-badge"><i /> Performance analysis
                    <span>{result.hasReference ? "Reference comparison" : "Note detection"}</span>
                  </div>
                  <div className="result-stats">
                    <div><strong>{result.durationSec.toFixed(1)}<small>s</small></strong><span>Clip length</span></div>
                    <div><strong>{result.detectedNotes.length}</strong><span>Notes detected</span></div>
                    <div><strong>{Math.round(result.quality.voicedConfidenceFraction * 100)}<small>%</small></strong><span>{result.rhythmEngine ? "Boundary evidence" : "Confident voiced frames"}</span></div>
                  </div>

                  <SessionPracticeCard name={selected.name} findingCount={result.findings.length}
                    onGenerate={() => practiceForTake(selected, result, selected.coach?.targets.map((t) => `${t.title}: ${t.observation}`))} />

                  <CoachPanel key={`coach-${selected.id}`} title={selected.name} result={result}
                    coach={selected.coach} chat={selected.chat}
                    onCoach={(coach) => updateProject(selected.id, { coach })}
                    onChat={(chat) => updateProject(selected.id, { chat })}
                    onFocus={requestFocus}
                    onEtude={(weaknesses) => practiceForTake(selected, result, weaknesses)} />

                  <PerformanceReview key={selected.id}
                    events={result.rhythmEvents?.length ? result.rhythmEvents : result.detectedNotes.map((n, i) => ({expectedId:`detected-${i}`,kind:"note" as const,measure:"Recording",beat:i+1,rhythmLabel:"Detected sound",targetStartSec:n.startSec,targetEndSec:n.endSec,actualStartSec:n.startSec,actualEndSec:n.endSec}))}
                    findings={result.findings} groups={result.rhythmGroups} audio={selected.audioFile} alignment={result.alignment}
                    insights={result.insights} hasReference={result.hasReference} focus={focus}
                    onRetry={() => {
                      const piece = pieces.find((p) => p.id === selected.pieceId);
                      if (piece) openUpload({ file: pieceFile(piece), title: piece.title, pieceId: piece.id });
                      else { openUpload(); setPrompt(selected.name); setRunAnalysis(true); }
                    }}/>

                  {!selected.sample && (
                    <TakeComparison key={`compare-${selected.id}`} allowUpload
                      current={{ id: selected.id, name: selected.name, date: selected.date, createdAt: selected.createdAt, result }}
                      others={projects.filter((p): p is Project & { result: Result } => p.id !== selected.id && !p.trashed && !!p.result)
                        .map((p): TakeOption => ({ id: p.id, name: p.name, date: p.date, createdAt: p.createdAt, result: p.result }))}
                      onFocus={requestFocus} />
                  )}
                  {!result.detectedNotes.length && <p className="upload-help">No reliable notes were detected. Check the recording level and try an isolated melody.</p>}
                  {result.quality.warnings.map((w, i) => <p className="analysis-warning" key={i}>{w}</p>)}

                  <button className="secondary-button" onClick={() => {
                    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "tunity-analysis.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}>Download analysis JSON <Icon name="arrow" size={16} /></button>
                </>
              ) : (
                <div className="sample-panel">
                  <span className="sample-notes" aria-hidden="true">♩ ♫ ♪</span>
                  <h3>Every great take starts somewhere.</h3>
                  <p>This is a sample project to explore the workspace. Upload your own recording for real note detection and practice feedback.</p>
                  <button className="primary-button" onClick={() => { setPrompt(selected.name); openUpload(); }}>
                    Add a recording <Icon name="plus" size={17} />
                  </button>
                </div>
              )}

              <div className="dialog-bottom">
                <span>{selected.sample ? "Sample · no audio attached" : "Saved in this browser · download JSON to share"}</span>
                <button className="text-button" onClick={trashProject}>
                  <Icon name={selected.trashed ? "folder" : "trash"} size={16} />
                  {selected.trashed ? "Restore project" : "Move to Trash"}
                </button>
              </div>
            </>
          )}

          {modal === "account" && <><h2 id="dialog-title">Your band account</h2><p className="dialog-intro">{user?.email}</p><p>Recordings, sheet music, progress, and feedback are shared by everyone signed in to this band account.</p><Link className="primary-button" href="/profile">Band account and sign-in settings</Link><button className="secondary-button full-width" disabled={!!authBusy} onClick={() => void logOut()}>Sign out</button>{authError && <p role="alert">{authError}</p>}</>}

          {modal === "etude" && (
            <EtudeWriter key={JSON.stringify(etudeSeed ?? {})} seed={etudeSeed} defaultInstrument={instrument}
              collections={[...new Set(["Etudes", ...pieces.filter((p) => !p.trashed).map((p) => p.collection)])]}
              onSave={saveEtude} />
          )}

          {modal === "piece" && selectedPiece && (
            <PieceDetail key={selectedPiece.id} piece={selectedPiece}
              collections={[...new Set(["Etudes", "Scores", ...pieces.map((p) => p.collection)])]}
              takes={projects.filter((p) => p.pieceId === selectedPiece.id && !p.trashed && p.result)
                .map((p) => ({ id: p.id, name: p.name, date: p.date, clean: cleanNotes(p.result!) }))}
              onRecord={() => openUpload({ file: pieceFile(selectedPiece), title: selectedPiece.title, pieceId: selectedPiece.id })}
              onStudy={() => openStudy({ file: pieceFile(selectedPiece), title: selectedPiece.title, pieceId: selectedPiece.id }, false)}
              onUpdate={(patch) => {
                void savePiece({ ...selectedPiece, ...patch }).then(() => {
                  if (patch.trashed !== undefined) { setModal(null); setNotice(patch.trashed ? "Piece removed. Restore it from Removed." : "Piece restored."); }
                }, () => setNotice("This browser could not save the piece."));
              }}
              onOpenTake={(id) => { const take = projects.find((p) => p.id === id); if (take) openProject(take); }} />
          )}

          {modal === "study" && studySource && (() => {
            const piece = pieces.find((p) => p.id === studySource.pieceId);
            return (
              <StudyGuide key={studyKey(studySource.file)} source={studySource} instrument={piece?.instrument ?? instrument}
                cached={piece?.study ?? studyCache[studyKey(studySource.file)]}
                onResult={(guide) => {
                  setStudyCache((c) => ({ ...c, [studyKey(studySource.file)]: guide }));
                  if (piece) void savePiece({ ...piece, study: guide }).catch(() => {});
                }}
                onBack={studyFromUpload ? () => setModal("upload") : undefined}
                onSave={piece ? undefined : (guide) => saveStudiedScore(studySource, guide)}
                onRecord={() => {
                  if (studyFromUpload) setModal("upload");
                  else openUpload({ file: studySource.file, title: studySource.title, pieceId: studySource.pieceId });
                }} />
            );
          })()}
        </div>
      </dialog>
    </div>
  );
}
