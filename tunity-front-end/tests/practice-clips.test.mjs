import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('practice clips load from a relocated frontend without evaluation folders or backend tools', async (t) => {
  const checkout = mkdtempSync(join(tmpdir(), 'tunity-practice-clips-'));
  const front = join(checkout, 'tunity-front-end');
  const previousCwd = process.cwd();
  const previousEnv = process.env.NODE_ENV;
  t.after(() => {
    process.chdir(previousCwd);
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    rmSync(checkout, { recursive: true, force: true });
  });
  mkdirSync(front);
  cpSync(new URL('../data/', import.meta.url), join(front, 'data'), { recursive: true });
  cpSync(new URL('../app/api/dev-performance/route.ts', import.meta.url), join(front, 'route.mts'));
  process.chdir(front);
  process.env.NODE_ENV = 'development';
  const { GET } = await import(pathToFileURL(join(front, 'route.mts')).href);
  const get = (query = '') => GET(new Request(`http://localhost/api/dev-performance${query}`));

  await t.test('default clip includes analysis and playable audio', async () => {
    const response = await get();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.hasReference);
    assert.ok(result.rhythmEvents.length);
    assert.ok(result.insights.notes.length);
    assert.deepEqual(result, await (await get('?sample=05-verified')).json());
    const audio = await get('?audio=1');
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('Content-Type'), 'audio/wav');
    const bytes = Buffer.from(await audio.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  });

  await t.test('every catalog entry has its matching saved result and audio', async () => {
    const response = await get('?catalog=1');
    assert.equal(response.status, 200);
    const catalog = await response.json();
    assert.equal(catalog.length, 19);
    for (const id of ['05-verified', '09-verified', 'clean', 'pitch-drift', 'accent-present']) {
      assert.ok(catalog.some((entry) => entry.id === id && entry.featured), id);
    }
    for (const entry of catalog) {
      assert.equal(entry.hasAudio, true, entry.id);
      const result = await get(`?sample=${entry.id}`);
      assert.equal(result.status, 200, entry.id);
      assert.deepEqual(await result.json(), JSON.parse(readFileSync(join(front, 'data/practice-clips/results', `${entry.id}.wav.json`), 'utf8')));
      const audio = await get(`?sample=${entry.id}&audio=1`);
      assert.equal(audio.status, 200, entry.id);
      assert.deepEqual(Buffer.from(await audio.arrayBuffer()), readFileSync(join(front, 'data/practice-clips/audio', `${entry.id}.wav`)));
    }
    assert.equal(readdirSync(join(front, 'data/practice-clips/audio')).length, catalog.length);
  });

  await t.test('missing samples and invalid paths fail; production stays disabled', async () => {
    for (const query of ['?sample=missing', '?sample=missing&audio=1', '?sample=..%2Fsecret', '?sample=..%2Fsecret&audio=1']) {
      assert.equal((await get(query)).status, 404);
    }
    process.env.NODE_ENV = 'production';
    for (const query of ['', '?catalog=1', '?audio=1']) {
      assert.equal((await get(query)).status, 404);
    }
  });
});
