"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Note = {
  midi: number;
  startSec: number;
  endSec: number;
  confidence: number;
};

type Result = {
  hasReference: boolean;
  durationSec: number;
  detectedNotes: Note[];
  findings: {
    kind: string;
    message: string;
    startSec: number;
  }[];
  quality: {
    voicedConfidenceFraction: number;
    warnings: string[];
  };
};

type Project = {
  id: string;
  name: string;
  semester: string;
  date: string;
  file: string;
  sample?: boolean;
  trashed?: boolean;
  result?: Result;
};

type IconName =
  | "home" | "folder" | "trash" | "search" | "plus" | "sliders"
  | "user" | "music" | "arrow" | "close" | "upload" | "check";

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

const noteName = (midi: number) =>
  `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][Math.round(midi) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

export default function Home() {
  const [projects, setProjects] = useState<Project[]>(seeds);
  const [view, setView] = useState("Home");
  const [semester, setSemester] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [modal, setModal] = useState<"upload" | "project" | "account" | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [uploadSemester, setUploadSemester] = useState("Fall ’26");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);

  function openUpload() {
    setError("");
    setModal("upload");
  }

  function chooseAudio(file?: File) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024 || !file.size) {
      setError("Choose a nonempty recording under 25 MB.");
      return;
    }
    setAudio(file);
    setError("");
  }

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (!audio || busy) return;
    setBusy(true);
    setError("");

    try {
      const form = new FormData();
      form.append("audio", audio);
      if (reference) form.append("reference", reference);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(240_000),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed. Please try again.");
      }

      const project: Project = {
        id: crypto.randomUUID(),
        name: prompt.trim() || audio.name.replace(/\.[^.]+$/, ""),
        semester: uploadSemester,
        file: audio.name,
        date: "Just now",
        result: data,
      };

      setProjects(items => [project, ...items]);
      setSelected(project);
      setModal("project");
      setAudio(null);
      setReference(null);
      setPrompt("");
      setView("Home");
      setSemester("All");
      setSearch("");
      setNotice("Your recording has been analyzed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function trashProject() {
    if (!selected) return;
    setProjects(items => items.map(p =>
      p.id === selected.id ? { ...p, trashed: !p.trashed } : p
    ));
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/" aria-label="Tunity home"><Brand /></Link>

        <nav aria-label="Main navigation">
          {(["Home", "Files", "Trash"] as const).map((item, i) => (
            <button key={item} className={`nav-item ${view === item ? "active" : ""}`}
              aria-current={view === item ? "page" : undefined}
              onClick={() => { setView(item); setSearch(""); setNotice(""); }}>
              <Icon name={(["home", "folder", "trash"] as const)[i]} />
              <span>{item}</span>
              {item === "Files" && (
                <span className="nav-count">{projects.filter(p => !p.trashed).length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="practice-note">
            <span className="tiny-label">A LITTLE EVERY DAY</span>
            <p>Great sound starts<br />with showing up.</p>
            <span className="note-line" />
          </div>
          <button className="account-button" onClick={() => setModal("account")}>
            <span className="avatar"><Icon name="user" /></span>
            <span>My Account<small>Demo workspace</small></span>
            <span className="account-dot" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="masthead">
          <span className="masthead-rule" /><Brand />
          <span className="masthead-rule" /><span className="demo-badge">DEMO</span>
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
            <button onClick={openUpload}>Upload a recording <Icon name="arrow" size={16} /></button>
          </div>
        </section>

        <section className="workspace" aria-label="Project library">
          <div className="section-title">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h2>
                {view === "Trash" ? "Trash" : view === "Files" ? "Your files" : "Your projects"}
                <span>{visible.length.toString().padStart(2, "0")}</span>
              </h2>
            </div>
            <button className="new-project" onClick={openUpload}>
              <Icon name="plus" size={17} /> New project
            </button>
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
          <p className="sr-only" role="status">{notice || `${visible.length} projects shown`}</p>

          {visible.length ? (
            <div className={`project-grid ${view === "Files" ? "file-list" : ""}`}>
              {visible.map((project, i) => (
                <button key={project.id} className="project-card"
                  onClick={() => { setSelected(project); setModal("project"); }}>
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
              {view !== "Trash" && <button className="primary-button" onClick={openUpload}>Upload a recording</button>}
            </div>
          )}

          <footer className="workspace-footer">
            <Brand /><span>Made for the moments between the notes.</span>
            <span>Local demo · projects stay in this tab</span>
          </footer>
        </section>
      </main>

      <dialog ref={dialog} className="project-dialog" aria-labelledby="dialog-title"
        onCancel={e => { if (busy) e.preventDefault(); else setModal(null); }}
        onClick={e => { if (e.target === dialog.current && !busy) setModal(null); }}>
        <div className="dialog-content">
          <button className="dialog-close" aria-label="Close dialog"
            disabled={busy} onClick={() => setModal(null)}><Icon name="close" /></button>

          {modal === "upload" && (
            <form onSubmit={analyze}>
              <span className="eyebrow">MAKE ROOM FOR PROGRESS</span>
              <h2 id="dialog-title">Let’s hear it.</h2>
              <p className="dialog-intro">
                Upload a solo recording for real note detection. Add a reference to get pitch and timing feedback.
              </p>

              <label className="field-label">Project name
                <input value={prompt} maxLength={100} disabled={busy}
                  onChange={e => setPrompt(e.target.value)} placeholder="e.g. Autumn recital · Take 4" />
              </label>

              <button type="button" className={`drop-zone ${audio ? "has-file" : ""}`}
                disabled={busy} onClick={() => audioInput.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (!busy) chooseAudio(e.dataTransfer.files[0]); }}>
                <span className="upload-icon"><Icon name={audio ? "check" : "upload"} size={26} /></span>
                <strong>{audio ? audio.name : "Drop a recording here"}</strong>
                <span>{audio ? `${(audio.size / 1024 / 1024).toFixed(2)} MB · Click to replace` : "or click to browse · WAV, MP3, M4A, FLAC"}</span>
              </button>
              <input ref={audioInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"
                className="sr-only" aria-label="Choose recording" disabled={busy}
                onChange={e => chooseAudio(e.target.files?.[0])} />

              <div className="upload-options">
                <label className="field-label">Semester
                  <select value={uploadSemester} disabled={busy}
                    onChange={e => setUploadSemester(e.target.value)}>
                    {semesters.slice(1).map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field-label">Reference JSON <span className="optional">optional</span>
                  <input type="file" accept=".json,application/json" disabled={busy}
                    onChange={e => setReference(e.target.files?.[0] || null)} />
                </label>
              </div>

              <p className="upload-help">
                One melodic line, up to 25 MB. Analyzes the first 120 seconds. Reference format:
                <code>{'{ "notes": [{ "id": "a4", "midi": 69, "startSec": 0.1, "endSec": 0.9 }] }'}</code>
              </p>
              {error && <p className="error-message" role="alert">{error}</p>}

              <button type="submit" className="primary-button full-width" disabled={!audio || busy}>
                {busy ? <><span className="spinner" /> Listening to your recording…</> : <>Analyze recording <Icon name="arrow" size={18} /></>}
              </button>
              <p className="privacy-note" role="status">
                {busy ? "Real model analysis can take up to 3 minutes. Keep this tab open." : "Processed on this server. Uploaded files are deleted after analysis. Results stay in this tab."}
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
                  <div className="result-badge"><i /> Analyzed with CREPE
                    <span>{result.hasReference ? "Reference comparison" : "Note detection"}</span>
                  </div>
                  <div className="result-stats">
                    <div><strong>{result.durationSec.toFixed(1)}<small>s</small></strong><span>Clip length</span></div>
                    <div><strong>{result.detectedNotes.length}</strong><span>Notes detected</span></div>
                    <div><strong>{Math.round(result.quality.voicedConfidenceFraction * 100)}<small>%</small></strong><span>Confident voiced frames</span></div>
                  </div>

                  <h3 className="result-heading">{result.hasReference ? "Practice feedback" : "Your detected notes"}</h3>
                  {result.hasReference && (
                    result.findings.length ? (
                      <ul className="findings">
                        {result.findings.map((f, i) => (
                          <li key={i}>
                            <span>{f.startSec.toFixed(2)}s</span>
                            <div><strong>{f.kind.replaceAll("_", " ")}</strong><p>{f.message}</p></div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="success-message">
                        <Icon name="check" size={18} />
                        No pitch or timing issues found against this reference. Review confidence warnings below.
                      </p>
                    )
                  )}

                  <div className="note-chips">
                    {result.detectedNotes.slice(0, 40).map((n, i) => (
                      <span key={i}>{noteName(n.midi)}<small>{n.startSec.toFixed(2)}s</small></span>
                    ))}
                  </div>
                  {result.detectedNotes.length > 40 && (
                    <p className="upload-help">Showing the first 40 notes. Download the full result below.</p>
                  )}
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
                <span>{selected.sample ? "Sample · no audio attached" : "Session only · download to keep results"}</span>
                <button className="text-button" onClick={trashProject}>
                  <Icon name={selected.trashed ? "folder" : "trash"} size={16} />
                  {selected.trashed ? "Restore project" : "Move to Trash"}
                </button>
              </div>
            </>
          )}

          {modal === "account" && (
            <>
              <span className="eyebrow">YOUR SPACE TO PRACTICE</span>
              <h2 id="dialog-title">Welcome to the demo.</h2>
              <p className="dialog-intro">No sign-in needed. Explore the sample projects or upload a recording to try the analyzer.</p>
              <div className="account-info">
                <Icon name="user" size={30} />
                <div><strong>Guest musician</strong><span>Local demo workspace</span></div>
              </div>
              <p className="upload-help">
                Projects and analysis results live in this tab and reset on refresh.
                There is no account or cloud storage connected yet. Download any analysis you want to keep.
              </p>
              <button className="primary-button full-width" onClick={() => setModal(null)}>
                Back to practice <Icon name="arrow" size={18} />
              </button>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
