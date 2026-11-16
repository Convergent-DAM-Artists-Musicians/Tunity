import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { createScoreServer } from '../src/score-server.ts';
import type { ImportedScore } from '../src/score-xml.ts';

test('HTTP upload passes PDF and explicit practice settings to importer and removes temporary file', async () => {
  let uploadedPath = '';
  const result: ImportedScore = { title: 'Test', parts: [{ id: 'P1', name: 'Trumpet' }], selectedPartId: 'P1',
    notes: [{ id: 'n1', midi: 72, startSec: 0, endSec: 1 }], tempoMap: [{ beat: 0, bpm: 60 }],
    durationSec: 1, warnings: [], source: 'omr', requiresReview: true };
  let calls = 0;
  const server = createScoreServer({}, async (path, options) => {
    calls++; uploadedPath = path;
    assert.equal((await readFile(path)).toString(), '%PDF-test');
    assert.equal(options?.tempoBpm, 60);
    assert.equal(options?.transpositionSemitones, -2);
    assert.equal(options?.omr, undefined);
    return result;
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/scores?tempoBpm=60&transpositionSemitones=-2`;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-test' });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
    // Cleanup runs after sending the response; allow it to finish before checking.
    for (let i = 0; i < 50; i++) {
      try { await access(uploadedPath); } catch { break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await assert.rejects(access(uploadedPath));
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'invalid' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '%PDF-test' })).status, 415);
    assert.equal((await fetch(url.replace('tempoBpm=60', 'tempoBpm=bad'), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-test' })).status, 400);
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
