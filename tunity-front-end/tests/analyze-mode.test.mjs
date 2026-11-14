import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
const front = new URL('../', import.meta.url);
const fixture = new URL('./fixtures/analyze-runtime.mjs', import.meta.url).href;
const routeUrl = new URL('app/api/analyze/route.ts', front).href;
const hooks = registerHooks({ resolve(s,c,next) {
  if (c.parentURL === routeUrl) {
    if (s === 'node:child_process' || s === '@/lib/server/practice-access') return {url:fixture,shortCircuit:true};
    if (s === '@/lib/audio-model') return {url:new URL('lib/audio-model.ts', front).href,shortCircuit:true};
  }
  return next(s,c);
}});
const {POST} = await import(routeUrl);
const {calls} = await import(fixture);
hooks.deregister();
function request(mode, reference, authorized = true) {
  const form=new FormData();
  form.set('audio',new File(['RIFF0000WAVEfmt '],'take.wav'));
  if(mode!==undefined)form.set('mode',mode);
  if(reference)form.set('reference',new File([JSON.stringify(reference)],'reviewed-score.json'));
  return new Request('http://localhost/api/analyze',{method:'POST',headers:authorized?{authorization:'Bearer test'}:{},body:form});
}
test('merged analyzer preserves rhythm default, explicit pitch and reviewed JSON while requiring account access',async()=>{
  const previous=process.env.TUNITY_BACKEND_DIR;
  process.env.TUNITY_BACKEND_DIR=fileURLToPath(new URL('../../back-end/',import.meta.url));
  try {
    calls.length=0;
    assert.equal((await POST(request(undefined,null,false))).status,401);
    assert.equal(calls.length,0);
    assert.equal((await POST(request(undefined))).status,200);
    assert.equal(calls.at(-1).args.at(-1),'rhythm');
    assert.equal(calls.at(-1).args[2],''); // Preserve the CLI's reference argument position.
    const score={notes:[{id:'a4',midi:69,startSec:0,endSec:1}]};
    assert.equal((await POST(request('pitch',score))).status,200);
    assert.equal(calls.at(-1).args.at(-1),'pitch');
    assert.deepEqual(calls.at(-1).reference,score);
    const count=calls.length;
    assert.equal((await POST(request('unknown'))).status,400);
    assert.equal(calls.length,count);
  } finally {
    if(previous===undefined)delete process.env.TUNITY_BACKEND_DIR;else process.env.TUNITY_BACKEND_DIR=previous;
  }
});
