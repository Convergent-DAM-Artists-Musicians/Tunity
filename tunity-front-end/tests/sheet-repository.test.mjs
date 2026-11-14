import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const lib = new URL('../lib/', import.meta.url).href;
const stub = new URL('./fixtures/firestore-memory.mjs', import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(lib)) {
    if (specifier === 'firebase/firestore' || specifier === './practice-db')
      return {url:stub,shortCircuit:true};
    if (specifier.startsWith('./') && !specifier.endsWith('.ts'))
      return next(specifier + '.ts',context);
  }
  return next(specifier,context);
}});
const { saveRecording, deleteRecording } = await import('../lib/audio-repository.ts');
const { deleteSheet } = await import('../lib/sheet-repository.ts');
const { state } = await import('./fixtures/firestore-memory.mjs');
hooks.deregister();
const audio = () => new File(['RIFF0000WAVEfmt '], 'take.wav');
const pdf = () => new File(['%PDF-1.4\n%%EOF'], 'score.pdf');
const recording = n => `userProfiles/member/recordings/${n}`;
const sheet = n => `userProfiles/member/sheetMusic/${n}`;
test('new PDF + take, refresh-style reuse, protected delete and quota remain cohesive', async () => {
  state.clear();
  await saveRecording('member',audio(),'First',{kind:'new',file:pdf()});
  const first = state.get(recording(0));
  assert.equal(state.size,2);
  const reference = JSON.parse(JSON.stringify(first.sheetMusic));
  await saveRecording('member',audio(),'Second',{kind:'existing',...reference});
  assert.equal(state.size,3); // PDF bytes were not duplicated.
  assert.deepEqual(state.get(recording(1)).sheetMusic,reference);
  await assert.rejects(deleteSheet('member',reference),/linked/);
  await deleteRecording('member','0');
  assert.ok(state.has(sheet(0)));
  await deleteRecording('member','1');
  await deleteSheet('member',reference);
  assert.equal(state.size,0);
  await saveRecording('member',audio(),'Replacement',{kind:'new',file:pdf()});
  assert.notEqual(state.get(recording(0)).sheetMusic.key,reference.key);
  const count = state.size;
  await assert.rejects(saveRecording('member',audio(),'Stale',{kind:'existing',...reference}),/no longer/);
  assert.equal(state.size,count);
  for (let n=1;n<5;n++) await saveRecording('member',audio(),`Take ${n}`);
  await assert.rejects(saveRecording('member',audio(),'Sixth',{kind:'new',file:pdf()}),/Delete/);
  assert.equal([...state.keys()].filter(p=>p.includes('/sheetMusic/')).length,1);
});
test('invalid PDF and full sheet quota do not partially save a recording', async () => {
  state.clear();
  await assert.rejects(saveRecording('member',audio(),'Bad',{kind:'new',file:new File(['fake'],'fake.pdf')}));
  assert.equal(state.size,0);
  for(let n=0;n<5;n++) state.set(sheet(n),{key:crypto.randomUUID()});
  await assert.rejects(saveRecording('member',audio(),'Full',{kind:'new',file:pdf()}),/full/);
  assert.equal(state.size,5);
  await saveRecording('member',audio(),'No sheet'); // Sheet quota does not block unattached takes.
  assert.equal(state.get(recording(0)).sheetMusic,undefined);
});
