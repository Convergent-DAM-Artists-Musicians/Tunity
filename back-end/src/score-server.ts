import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { importSheetMusic } from './score-import.ts';
import type { SheetImportOptions } from './score-import.ts';

const maxBytes = 20 * 1024 * 1024;
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>PDF score upload test</title>
<style>body{font:18px system-ui;max-width:800px;margin:40px auto;padding:20px}label{display:block;margin:20px 0}pre{white-space:pre-wrap}button{padding:12px}</style>
<h1>Upload a trumpet score</h1><p>Local backend test. Review the returned notes before comparing a recording.</p>
<form id="upload"><label>PDF <input id="pdf" type="file" accept="application/pdf" required></label>
<label>Practice tempo (quarter notes per minute) <input id="tempo" type="number" min="1" max="400" value="60" required></label>
<label>Notation <select id="transpose"><option value="-2">Written B♭ trumpet pitches</option><option value="0">Concert pitches</option></select></label>
<button id="submit">Upload and recognize</button></form><p id="status"></p><a id="download" hidden download="reference.pdf-upload.json">Download reference JSON</a><pre id="result"></pre>
<script>
const form=document.querySelector('#upload'),status=document.querySelector('#status'),result=document.querySelector('#result'),download=document.querySelector('#download'),button=document.querySelector('#submit');
let previousUrl;
form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;download.hidden=true;result.textContent='';status.textContent='Recognizing score. This may take a few minutes…';
try{const file=document.querySelector('#pdf').files[0];const query=new URLSearchParams({tempoBpm:document.querySelector('#tempo').value,transpositionSemitones:document.querySelector('#transpose').value});
const response=await fetch('/api/scores?'+query,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error);
const json=JSON.stringify(data,null,2);result.textContent=json;status.textContent='Recognition complete. Review pitches, rhythm and tempo before grading.';
if(previousUrl)URL.revokeObjectURL(previousUrl);previousUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));download.href=previousUrl;download.hidden=false;
}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
</script></html>`;

/** Local development only: no authentication or Firebase persistence. */
export function createScoreServer(options: SheetImportOptions,
  importer: typeof importSheetMusic = importSheetMusic) {
  let busy = false;
  const server = createServer(async (request, response) => {
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data, null, 2));
    };
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(page); return;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/scores') { send(404, { error: 'Not found.' }); return; }
    if (request.headers['content-type']?.split(';')[0] !== 'application/pdf') {
      send(415, { error: 'Send the PDF file as the request body with Content-Type: application/pdf.' }); return;
    }
    const tempoBpm = Number(url.searchParams.get('tempoBpm'));
    const rawTranspose = url.searchParams.get('transpositionSemitones');
    const transpositionSemitones = Number(rawTranspose);
    if (!Number.isFinite(tempoBpm) || tempoBpm < 1 || tempoBpm > 400 || rawTranspose === null
        || !Number.isInteger(transpositionSemitones) || Math.abs(transpositionSemitones) > 24) {
      send(400, { error: 'Supply tempoBpm (1–400) and transpositionSemitones (-24–24; written Bb trumpet: -2).' }); return;
    }
    if (busy) { send(503, { error: 'A score is already being processed. Try again when it finishes.' }); return; }
    if (Number(request.headers['content-length']) > maxBytes) { send(413, { error: 'PDF must be at most 20 MiB.' }); return; }
    busy = true;
    let folder: string | undefined;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) { send(413, { error: 'PDF must be at most 20 MiB.' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const pdf = Buffer.concat(chunks);
      if (pdf.subarray(0, 5).toString() !== '%PDF-') { send(400, { error: 'File is not a PDF.' }); return; }
      folder = await mkdtemp(join(tmpdir(), 'score-upload-'));
      const path = join(folder, 'uploaded-score.pdf');
      await writeFile(path, pdf);
      const score = await importer(path, { ...options, tempoBpm, transpositionSemitones });
      send(200, score);
    } catch (error) {
      send(422, { error: error instanceof Error ? error.message : 'Score import failed.' });
    } finally {
      try { if (folder) await rm(folder, { recursive: true, force: true }); }
      finally { busy = false; }
    }
  });
  server.requestTimeout = 300000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const executable = process.env.AUDIVERIS_PATH;
  if (!executable) { console.error('Set AUDIVERIS_PATH to the Audiveris executable first.'); process.exitCode = 1; }
  else {
    const server = createScoreServer({ omr: { executable, timeoutMs: 240000 } });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(8080, '127.0.0.1', () => console.log('PDF upload test: http://127.0.0.1:8080 — press Ctrl+C to stop.'));
  }
}
