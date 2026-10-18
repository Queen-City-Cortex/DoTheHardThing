// verify:live against a fake site: a local node http server stands in for the live site and a temp dir holds the
// local dist (the script reads dist/ from its cwd). No network beyond 127.0.0.1 and no browser.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./verify-live.mjs', import.meta.url));
const MANIFEST = JSON.stringify({ name: 'Do The Hard Thing', theme_color: '#f4f3ef' });
const HEADERS = '/*\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n/\n  Cache-Control: no-cache\n';
const ROOT = { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' };
const page = (entry) => `<!doctype html><html><head><script type="module" src="/${entry}"></script></head><body><div id="root"></div></body></html>`;
const cleanup = [];
afterEach(async () => { for (const f of cleanup.splice(0)) await f(); });

// the local build: dist/index.html with entry assets/index-THIS.js, and the files the script compares
function localDist({ dist = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-live-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  if (dist) {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/index.html'), page('assets/index-THIS.js'));
    writeFileSync(join(dir, 'dist/sw.js'), 'precache');
    writeFileSync(join(dir, 'dist/manifest.webmanifest'), MANIFEST);
    writeFileSync(join(dir, 'dist/_headers'), HEADERS);
  }
  return dir;
}

// the fake site: each path answers { status, headers, body }; every request's method is recorded
async function site(overrides = {}) {
  const routes = {
    '/': { status: 200, headers: ROOT, body: page('assets/index-THIS.js') },
    '/api/event': { status: 405, headers: { allow: 'POST' }, body: '' },
    '/og-image.png': { status: 200, headers: { 'content-type': 'image/png' }, body: 'png' },
    '/sw.js': { status: 200, headers: { 'content-type': 'text/javascript' }, body: 'precache' },
    '/manifest.webmanifest': { status: 200, headers: { 'content-type': 'application/manifest+json' }, body: MANIFEST },
    ...overrides,
  };
  const methods = [];
  const server = createServer((req, res) => {
    methods.push(req.method);
    const r = routes[req.url] ?? { status: 404, headers: {}, body: '' };
    res.writeHead(r.status, Object.fromEntries(Object.entries(r.headers).filter(([, v]) => v !== undefined))).end(r.body);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  cleanup.push(() => new Promise((ok) => server.close(ok)));
  return { url: `http://127.0.0.1:${server.address().port}`, methods };
}

function run(cwd, env, args = []) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (status) => ok({ status, out }));
  });
}

describe('verify:live', () => {
  it('passes when the fake site serves this build, with GET only', async () => {
    const s = await site();
    const r = await run(localDist(), { SITE: s.url });
    expect(r.out).toContain('OK    manifest.webmanifest 200, equal to dist/manifest.webmanifest');
    expect(r.out).toContain('OK    / gets the 3 headers dist/_headers gives it (X-Frame-Options, Referrer-Policy, Cache-Control)');
    expect(r.out).toContain('INFO  / has no strict-transport-security, left out on purpose');
    expect(r.out).not.toContain('PENDING');
    expect(r.status).toBe(0);
    expect(s.methods.length).toBeGreaterThan(4);
    expect(new Set(s.methods)).toEqual(new Set(['GET']));
  });
  it('fails when it serves this build but the manifest differs', async () => {
    const s = await site({ '/manifest.webmanifest': { status: 200, headers: {}, body: JSON.stringify({ theme_color: '#1f2329' }) } });
    const r = await run(localDist(), { SITE: s.url });
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL  live manifest.webmanifest (theme_color #1f2329');
    expect(r.out).toContain('!= dist/manifest.webmanifest (theme_color #f4f3ef');
  });
  it('reports the manifest PENDING, not FAIL, when the site serves another build', async () => {
    const s = await site({
      '/': { status: 200, headers: {}, body: page('assets/index-OTHER.js') },
      '/manifest.webmanifest': { status: 200, headers: {}, body: '{}' },
    });
    const r = await run(localDist(), { SITE: s.url });
    expect(r.out).toContain('PENDING manifest.webmanifest: live does not serve this build yet');
    expect(r.out).not.toContain('FAIL  live manifest');
    // the entry script check still fails a run before the deploy, as it always did
    expect(r.out).toContain('FAIL  live entry assets/index-OTHER.js != local dist assets/index-THIS.js');
    expect(r.status).toBe(1);
    expect(new Set(s.methods)).toEqual(new Set(['GET']));
  });
  it('reports PENDING and passes when there is no local dist to compare', async () => {
    const s = await site({ '/manifest.webmanifest': { status: 200, headers: {}, body: '{}' } });
    const r = await run(localDist({ dist: false }), { SITE: s.url });
    expect(r.out).toContain('PENDING manifest.webmanifest: no local dist to compare');
    expect(r.status).toBe(0);
  });
  it('fails when it serves this build but a header on / differs or is missing', async () => {
    const s = await site({ '/': { status: 200, headers: { ...ROOT, 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': undefined }, body: page('assets/index-THIS.js') } });
    const r = await run(localDist(), { SITE: s.url });
    expect(r.status).toBe(1);
    expect(r.out).toContain('FAIL  / does not get what dist/_headers gives it: X-Frame-Options: SAMEORIGIN, want DENY; Referrer-Policy: (none), want strict-origin-when-cross-origin');
  });
  it('never fails on extra headers, and compares names case-insensitively and values with whitespace collapsed', async () => {
    const s = await site({ '/': { status: 200, headers: { ...ROOT, 'referrer-policy': undefined, 'Referrer-Policy': 'strict-origin-when-cross-origin', 'cache-control': '  no-cache ', server: 'edge', 'x-extra': '1' }, body: page('assets/index-THIS.js') } });
    const r = await run(localDist(), { SITE: s.url });
    expect(r.out).toContain('OK    / gets the 3 headers');
    expect(r.status).toBe(0);
  });
  it('reports the headers PENDING when the site serves another build', async () => {
    const s = await site({ '/': { status: 200, headers: { 'content-type': 'text/html' }, body: page('assets/index-OTHER.js') } });
    const r = await run(localDist(), { SITE: s.url });
    expect(r.out).toContain('PENDING headers on /: live does not serve this build yet');
    expect(r.out).not.toContain('FAIL  / does not get');
    expect(new Set(s.methods)).toEqual(new Set(['GET']));
  });
});
