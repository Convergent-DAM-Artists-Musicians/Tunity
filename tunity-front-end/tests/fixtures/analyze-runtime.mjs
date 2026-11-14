// Route-plumbing fixture. Firebase token verification has separate emulator coverage.
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
export const calls = [];
export function execFile() { throw new Error('Use the promisified worker fixture.'); }
execFile[promisify.custom] = async (binary, args) => {
  calls.push({ binary, args: [...args], reference: args[2] ? JSON.parse(await readFile(args[2], 'utf8')) : null });
  return { stdout: JSON.stringify({ fixture: true, mode: args.at(-1) }), stderr: '' };
};
export function practiceAccess(request) {
  return request.headers.get('authorization') === 'Bearer test'
    ? null : Response.json({ error: 'Sign in required.' }, { status: 401 });
}
