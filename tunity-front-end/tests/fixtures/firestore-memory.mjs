// Optimistic transactional test double; it does not evaluate Firestore security rules.
let revision = 0;
const versions = new Map();
class Store extends Map {
  set(key,value) { versions.set(key,++revision); return super.set(key,value); }
  delete(key) { versions.set(key,++revision); return super.delete(key); }
  clear() { super.clear(); versions.clear(); revision++; }
}
export const state = new Store();
export class Timestamp { constructor(ms) { this.ms=ms; } toMillis(){return this.ms} toDate(){return new Date(this.ms)} }
export const getFirebaseDb = () => ({});
export class Bytes { constructor(bytes){this.bytes=bytes} static fromUint8Array(bytes){return new Bytes(bytes)} toUint8Array(){return this.bytes} }
export const doc = (_, ...parts) => parts.join('/');
export const serverTimestamp = () => new Timestamp(Date.now());
export const collection = doc;
export const query = (...a) => a;
export const onSnapshot = () => () => {};
export async function runTransaction(_, fn) {
 for(let attempt=0;attempt<8;attempt++) {
  const writes=[],reads=new Map();
  const tx={
    get: async path=>{if(writes.length)throw Error('All reads must precede writes');reads.set(path,versions.get(path));const value=state.get(path);return {id:path.split('/').at(-1),exists:()=>value!==undefined,data:()=>value};},
    set:(p,d)=>writes.push(()=>state.set(p,d)),
    update:(p,d)=>{if(!state.has(p))throw Error('Missing document');writes.push(()=>state.set(p,{...state.get(p),...d}));},
    delete:p=>writes.push(()=>state.delete(p)),
  };
  const result=await fn(tx);
  if([...reads].some(([p,v])=>versions.get(p)!==v))continue;
  writes.forEach(write=>write());return result;
 }
 throw Error('Transaction retry limit exceeded');
}
