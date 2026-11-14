// Small transactional test double. These tests exercise repository behavior, not security rules.
export const state = new Map();
export function getFirebaseDb() { return {}; }
export class Bytes {
  constructor(bytes) { this.bytes = bytes; }
  static fromUint8Array(bytes) { return new Bytes(bytes); }
  toUint8Array() { return this.bytes; }
}
export const doc = (_, ...parts) => parts.join('/');
export const serverTimestamp = () => new Date();
export const collection = doc;
export const query = (...a) => a;
export const limit = n => n;
export const onSnapshot = () => () => {};
export async function runTransaction(_, fn) {
  const writes = [];
  const tx = {
    get: async path => {
      if (writes.length) throw new Error('All reads must precede writes');
      return { id: path.split('/').at(-1), exists: () => state.has(path), data: () => state.get(path) };
    },
    set: (p,d) => writes.push(() => state.set(p,d)),
    delete: p => writes.push(() => state.delete(p)),
  };
  const result = await fn(tx); writes.forEach(write => write()); return result;
}
