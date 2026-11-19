import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSheet, readSheetRef, MAX_SHEET_BYTES } from '../lib/sheet-model.ts';
import { validateAudioInfo, verifyAudioHeader } from '../lib/audio-model.ts';
test('PDF validation rejects disguised, empty and oversized files before a write', async () => {
  for (const f of [new File(['no PDF'], 'fake.pdf'), new File(['%PDF-1.4'], 'score.exe'),
    new File([], 'empty.pdf'), new File([new Uint8Array(MAX_SHEET_BYTES + 1)], 'large.pdf')])
    await assert.rejects(prepareSheet(f));
  await assert.rejects(prepareSheet(null));
  const result = await prepareSheet(new File(['%PDF-1.4\n%%EOF'], 'score.PDF'));
  assert.equal(result.size, result.bytes.length);
});
test('legacy and UUID sheet references stay readable; malformed references are rejected', () => {
  const key=crypto.randomUUID();
  assert.equal(readSheetRef({slot:key,key,name:'score.pdf'}).slot,key);
  assert.equal(readSheetRef({slot:'0',key,name:'old.pdf'}).slot,'0');
  assert.equal(readSheetRef(undefined), undefined);
  assert.throws(() => readSheetRef({slot:'5', key:crypto.randomUUID(), name:'score.pdf'}));
  assert.throws(() => readSheetRef({slot:'0', key:'not-a-key', name:'score.pdf'}));
});
test('MP4, MOV and video WebM have video types and matching container validation', () => {
  for (const [name, type, bytes] of [
    ['take.mp4','video/mp4',new TextEncoder().encode('0000ftypisom')],
    ['take.mov','video/quicktime',new TextEncoder().encode('0000ftypqt  ')],
    ['take.webm','video/webm',new Uint8Array([26,69,223,163])],
  ]) {
    const info = validateAudioInfo({name,size:bytes.length,type}, '');
    assert.equal(info.contentType,type); verifyAudioHeader(type,bytes);
  }
});
