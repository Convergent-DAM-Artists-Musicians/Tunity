import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStatus, requireUpload, TRIAL_MS, readAccount } from '../lib/account-model.ts';
const base={bandName:'Band',plan:'trial',uploadCount:0,trialStartedAt:null,noticeAcceptedAt:null,sheetUses:{}};
test('account creation leaves trial unstarted regardless of elapsed time',()=>{
 assert.equal(accountStatus(base,Date.now()+365*86400000).daysLeft,30);
 assert.equal(accountStatus(base).canUpload,true);
});
test('exact 30-day boundary expires, with ceil-day countdown and no extra day',()=>{
 const a={...base,trialStartedAt:1000};
 assert.equal(accountStatus(a,1001).daysLeft,30);
 assert.equal(accountStatus(a,1000+TRIAL_MS-1).expired,false);
 assert.equal(accountStatus(a,1000+TRIAL_MS).expired,true);
 assert.equal(accountStatus(a,1000+TRIAL_MS).canUpload,false);
 assert.equal(accountStatus(a,1000+TRIAL_MS).daysLeft,0);
});
test('five lifetime trial uploads block another upload; demo upgrade removes count/time limits',()=>{
 const a={...base,uploadCount:5};
 assert.throws(()=>requireUpload(a),/five/);
 assert.equal(accountStatus({...a,plan:'demo',uploadCount:1000,trialStartedAt:1},Date.now()).canUpload,true);
});
test('corrupt plan/counters/timestamps fail closed',()=>{
 for(const change of [{plan:'paid'},{uploadCount:-1},{uploadCount:1.2},{trialStartedAt:'yesterday'}])
  assert.throws(()=>readAccount({...base,...change}));
});
