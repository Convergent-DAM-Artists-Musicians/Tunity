# Tunity frontend

The Next.js demo UI follows the Tunity mockup with a dark sidebar, red welcome panel, semester filters, project search, Files, Trash/restore, and recording analysis dialogs.

## Quick start

Install **Node.js 24+** from [nodejs.org](https://nodejs.org/). Its installer includes npm. Check both commands in the terminal you will use:

```sh
node --version
npm --version
```

From the **Tunity repository root**:

```sh
cd tunity-front-end
npm ci
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** after Next.js reports that it is ready. If Next.js uses a different port, open the Local URL printed in the terminal. Keep the server running while using the page; stop it with **Ctrl+C**.

If your terminal is already inside `tunity-front-end`, omit the `cd` command. On later visits, run `npm run dev` here; reinstall with `npm ci` after dependency/lockfile changes.

## macOS and VS Code

If `node` or `npm` says `command not found`, Node.js is not installed or is missing from that terminal's PATH.

1. Install Node.js 24 LTS using the macOS `.pkg` installer.
2. Open a new macOS Terminal window and check `node --version` and `npm --version`.
3. If they work there but not in VS Code, fully quit VS Code with **Cmd+Q**, reopen it, and use **Terminal → New Terminal**. A window refresh may retain the old PATH.
4. If the issue remains, compare `command -v node`, `command -v npm`, and `echo "$PATH"` in both terminals.

If npm reports a missing `package.json`, check your working directory: the frontend commands belong in `Tunity/tunity-front-end`. If `next` is missing, run `npm ci` here first.

## Development commands

Run these inside `tunity-front-end`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the committed lockfile |
| `npm run dev` | Start development with automatic page updates |
| `npm run dev -- --port 3001` | Use an alternative port |
| `npm run lint` | Check the frontend with ESLint |
| `npx next typegen` | Generate Next.js route types |
| `npx tsc --noEmit` | Check TypeScript after generating route types |
| `npm run build` | Create the production build |
| `npm start` | Serve an existing production build |

Edit `app/page.tsx` for UI behavior, `app/globals.css` for styling, and `app/layout.tsx` for page metadata.

## Optional backend connection

Python, FFmpeg, and backend dependencies are **not required to view the website**. They are required for real recording analysis through `POST /api/analyze`.

The route runs `../back-end/src/cli/web-demo.ts` locally using Node 24+, FFmpeg, and the Python CREPE worker. Keep both repository folders on the same machine. No separate backend HTTP server is needed.

Configure `PYTHON_PATH` with the absolute path of the Python interpreter containing the ML dependencies before starting Next.js. Optional overrides are `FFMPEG_PATH`, `TUNITY_BACKEND_DIR`, and `TUNITY_NODE_PATH`. An ignored `.env.local` in this folder can hold local paths; restart Next.js after changing them.

See [DEMO_UI.md](../DEMO_UI.md#run) for full backend setup. On macOS use `python3` when creating the virtual environment and select the macOS PyTorch installation from the [official selector](https://pytorch.org/get-started/locally/), rather than the Linux CPU-wheel index.

Uploads are limited to 25 MB and the first 120 seconds. A recording alone returns detected notes; optional reference JSON enables pitch and timing feedback. Sample projects contain no attached audio or invented analysis. Projects/results reset on refresh; download analysis JSON to retain it. Accounts and persistent storage are not connected.
