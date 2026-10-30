# Tunity

Tunity combines a Next.js demo workspace with a Python-backed solo music analyzer.

## Run the website locally

You only need **Node.js 24+ and npm** to view and develop the demo UI. Python, FFmpeg, and the backend packages are optional until you want to analyze uploaded recordings.

### 1. Install and check Node.js

Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/). The macOS `.pkg` installer includes npm. Then open a new terminal and check:

```sh
node --version
npm --version
```

Node should report `v24.x.x` or newer. If either command says `command not found`, see Troubleshooting below before continuing.

### 2. Install the frontend dependencies

Open a terminal in the **Tunity repository root**, then run:

```sh
cd tunity-front-end
npm ci
```

`npm ci` installs the versions in the committed `package-lock.json`. Run it after a fresh clone or when the lockfile changes. There is no root-level `package.json`: do not run `npm install` or `npm run dev` from the repo root or from `back-end` to start the website.

### 3. Start the development server

From `tunity-front-end`:

```sh
npm run dev
```

Wait for Next.js to report that it is ready, then open **[http://localhost:3000](http://localhost:3000)** in your browser. Keep the terminal running. Edits to `app/page.tsx` and `app/globals.css` update the page automatically. Press **Ctrl+C** in the terminal to stop the server.

If port 3000 is already in use, check the Local URL printed by Next.js, or choose a port explicitly:

```sh
npm run dev -- --port 3001
```

Then open `http://localhost:3001`.

### Starting again later

You do not need to reinstall dependencies every time. From the repo root:

```sh
cd tunity-front-end
npm run dev
```

### Troubleshooting

- **`node` or `npm`: command not found:** Install Node.js, then open a new terminal. On macOS, if the commands work in the regular Terminal app but not VS Code, fully quit VS Code with **Cmd+Q**, reopen it, and select **Terminal → New Terminal**. Refreshing the VS Code window may keep the old PATH. If it still fails, compare `command -v node` and `echo "$PATH"` in both terminals.
- **`ENOENT` / missing `package.json`:** Check `pwd` (or your terminal prompt). Run the frontend commands inside `Tunity/tunity-front-end`.
- **`next: command not found`:** Run `npm ci` inside `tunity-front-end`, then retry `npm run dev`.
- **The browser cannot connect:** Keep `npm run dev` running, read any terminal error, and use the exact Local URL it prints. `localhost` refers to the computer running the server.
- **The UI loads but analysis fails:** This is a separate backend setup requirement; see the optional setup below.

### Optional: enable recording analysis

The sample projects, filtering, Files view, and Trash/restore work without the analyzer. Real uploads additionally need backend npm dependencies, a compatible Python environment with `torch`, `torchaudio`, and `torchcrepe`, and FFmpeg. Set `PYTHON_PATH` to that environment's absolute Python executable **before starting Next.js**. On macOS the Python command is usually `python3`.

See [the demo setup guide](DEMO_UI.md#run) for the full connection and server variable details. For PyTorch on macOS, use the macOS installation command from the [official installation selector](https://pytorch.org/get-started/locally/); the Linux CPU-wheel index is not the macOS installation route. Keep `back-end` beside `tunity-front-end`, or configure `TUNITY_BACKEND_DIR`.

Projects and results currently live in the browser tab and reset on refresh. Download analysis JSON to keep results. The demo does not connect accounts or persistent project storage.

See [the frontend README](tunity-front-end/README.md) for useful development commands.

---

## Backend analyzer reference

An independent copy of the original music analyzer. The original `music-analyzer` folder is preserved. This edition replaces its basic YIN pitch estimator with **torchcrepe**, the PyTorch implementation of CREPE. It retains audio extraction, sheet-music import, note alignment, and the same seven requested feedback categories, plus missing/extra notes.

**Scope:** one player, one pitched melodic line, offline clips up to 120 seconds. No accompaniment, band transcription, or timbre-quality grading. This is a working integration baseline, not a trumpet-accuracy claim.

## Setup

Requirements:

- Node.js 24+ (native TypeScript execution).
- A Python version supported by your chosen PyTorch distribution.
- Matching `torch` and `torchaudio` installations for CPU or CUDA, using the [official PyTorch installation selector](https://pytorch.org/get-started/locally/).
- FFmpeg on PATH, or its executable path in `FFMPEG_PATH`.
- Audiveris only if importing PDF/image scores; MusicXML does not need it.

From the repository root, on Windows PowerShell:

```powershell