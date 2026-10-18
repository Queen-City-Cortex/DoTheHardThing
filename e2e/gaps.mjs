// Known-gaps runner. Every entry in e2e/known-gaps.json names a gap-* journey in drive.mjs that asserts the behavior we
// want, so it FAILS while the gap is open. For each entry this runs the journey and inverts the result:
//   XFAIL    the journey failed with its own `gap open (N of M): ...` error and it contains `fails_with` (which carries
//            the count): the gap is open, as registered (ok)
//   STALE    the journey passed: the gap is fixed. Delete the entry and move the journey into the suite (run fails)
//   WRONG    the journey failed for another reason (a half-fixed gap: another count), or died before writing result.json
//            (run fails: the gap check broke, or the gap moved and the entry needs the new count)
//   EXPIRED  today is past `expires`: fix it, or decide again and move the date with a reason (run fails; not run)
// The run also fails on a MALFORMED entry, a MISSING journey (named by an entry, not in `drive.mjs --list-gaps`) and an
// UNREGISTERED gap-* journey with no entry. The registry is for owner-blocked gaps only: a bug gets fixed, not registered.
// Usage (from the repo root):
//   node e2e/gaps.mjs [--serve] [gap ids...]
//   --serve  serve the existing dist/ on VDT_PORT (default 4317) and stop it afterwards; otherwise VDT_URL, or
//            http://127.0.0.1:$VDT_PORT, must already serve a preview (`VDT_PORT=<your port> e2e/vdt launch`)
// Env: GAPS_TODAY=YYYY-MM-DD overrides today, GAPS_FILE another registry, GAPS_DRIVE another drive script (the tests use
// both), VDT_JOURNEY_TIMEOUT_MS (default 120000), VDT_EVIDENCE and VDT_RUN_ID as for e2e/run.mjs.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const FILE = process.env.GAPS_FILE ? path.resolve(process.env.GAPS_FILE) : path.join(HERE, 'known-gaps.json');
const DRIVE = process.env.GAPS_DRIVE ? path.resolve(process.env.GAPS_DRIVE) : path.join(HERE, 'drive.mjs');
const FIELDS = ['id', 'journey', 'why', 'owner', 'expires', 'fixed_by', 'fails_with'];
const TIMEOUT_MS = Number(process.env.VDT_JOURNEY_TIMEOUT_MS) || 120000;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = process.env.GAPS_TODAY ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; // the local date
const args = process.argv.slice(2);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const GAP_OPEN = /^gap open \(\d+ of \d+\): \S/; // the start of the journey's own error, `gap open (N of M): ...`, from gapOpen() in drive.mjs
const serve = args.includes('--serve');
const ids = args.filter((a) => a !== '--serve');
const fail = (msg) => { console.log(msg); process.exit(1); };
const refuse = (msg) => { console.error(msg); process.exit(2); }; // the preview could not be set up, as in e2e/run.mjs
if (!isDate(today)) refuse(`GAPS_TODAY must be a date, YYYY-MM-DD (it is ${JSON.stringify(today)})`);

let gaps;
try { gaps = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { fail(`MALFORMED ${path.relative(REPO, FILE)}: ${e.message}`); }
if (!Array.isArray(gaps)) fail(`MALFORMED ${path.relative(REPO, FILE)}: the registry is a JSON array of entries`);
const listed = spawnSync(process.execPath, [DRIVE, '--list-gaps'], { cwd: REPO, encoding: 'utf8' });
if (listed.status !== 0) fail(`MISSING ${path.relative(REPO, DRIVE)} --list-gaps failed: ${(listed.stdout + listed.stderr).trim()}`);
const journeys = listed.stdout.split('\n').filter(Boolean);

const bad = [];
const valid = [];
for (const [i, g] of gaps.entries()) {
  const name = typeof g?.id === 'string' && g.id ? g.id : `entry ${i}`;
  const miss = FIELDS.filter((f) => typeof g?.[f] !== 'string' || !g[f].trim());
  const extra = g && typeof g === 'object' ? Object.keys(g).filter((k) => !FIELDS.includes(k)) : [];
  if (miss.length) bad.push(`MALFORMED ${name}: ${miss.join(', ')} must be non-empty strings`);
  else if (!isDate(g.expires)) bad.push(`MALFORMED ${name}: expires must be a date, YYYY-MM-DD (it is ${JSON.stringify(g.expires)})`);
  else if (!GAP_OPEN.test(g.fails_with)) bad.push(`MALFORMED ${name}: fails_with must start with the journey's own count, "gap open (N of M): " (it is ${JSON.stringify(g.fails_with)})`);
  else if (extra.length) bad.push(`MALFORMED ${name}: unknown field(s) ${extra.join(', ')}; the fields are ${FIELDS.join(', ')}`);
  else if (gaps.findIndex((x) => x?.id === g.id) !== i) bad.push(`MALFORMED ${name}: the id is used twice`);
  else if (!journeys.includes(g.journey)) bad.push(`MISSING ${name}: no gap journey ${g.journey} in ${path.relative(REPO, DRIVE)} (--list-gaps)`);
  else valid.push(g);
}
for (const j of journeys) if (!gaps.some((g) => g?.journey === j)) bad.push(`UNREGISTERED ${j}: a gap journey with no entry in ${path.relative(REPO, FILE)}; register it or move it into the suite`);
const unknown = ids.filter((id) => !gaps.some((g) => g?.id === id));
if (unknown.length) bad.push(`MISSING ${unknown.join(', ')}: no such gap id in ${path.relative(REPO, FILE)}`);
for (const line of bad) console.log(line);

const chosen = valid.filter((g) => !ids.length || ids.includes(g.id));
const expired = chosen.filter((g) => g.expires < today);
for (const g of expired) console.log(`EXPIRED  ${g.id}  expired ${g.expires} (today ${today}), owner ${g.owner}: ${g.fixed_by}`);
const toRun = chosen.filter((g) => g.expires >= today);

// ---- the preview: the same small serve logic as e2e/run.mjs --serve, kept here so run.mjs stays as it is ----
const running = new Set();
let preview = null;
const killGroup = (child, sig = 'SIGKILL') => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
const stop = () => { for (const c of running) killGroup(c); running.clear(); if (preview) { killGroup(preview); preview = null; } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(143); });
const PORT = process.env.VDT_PORT ?? '4317';
let url = process.env.VDT_URL ?? `http://127.0.0.1:${PORT}`;
if (serve && toRun.length) {
  const newest = (p) => { const st = fs.statSync(p); return st.isDirectory() ? Math.max(st.mtimeMs, ...fs.readdirSync(p).map((f) => newest(path.join(p, f)))) : st.mtimeMs; };
  const built = fs.existsSync(path.join(REPO, 'dist/index.html')) ? fs.statSync(path.join(REPO, 'dist/index.html')).mtimeMs : 0;
  const src = Math.max(...['src', 'index.html', 'public', 'vite.config.ts'].map((p) => newest(path.join(REPO, p))));
  if (built < src) refuse('dist/ is missing or older than src/, index.html, public/ or vite.config.ts: run `npm run build` first (the journeys drive dist/, not src/)');
  url = `http://127.0.0.1:${PORT}`;
  const free = await new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false)).once('listening', () => srv.close(() => resolve(true)));
    srv.listen(Number(PORT), '127.0.0.1');
  });
  if (!free) refuse(`port ${PORT} is already in use (another agent's server?): set VDT_PORT to a free port of your own, e.g. VDT_PORT=$((4400 + RANDOM % 500))`);
  preview = spawn(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'); // the colour codes around vite's Local: line
  let log = ''; preview.stderr.on('data', (d) => { log += d; });
  const up = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    preview.stdout.on('data', (d) => {
      log += d;
      if (log.replace(ANSI, '').includes(`Local:   ${url}/`)) { clearTimeout(timer); resolve(true); }
    });
    preview.once('exit', () => { clearTimeout(timer); resolve(false); });
  });
  if (!up) refuse(`vite preview did not start on ${url}: ${log.trim()}`);
}

// one journey in its own process group, as e2e/run.mjs runs it, so a timeout reaches its Chromium too
const ROOT = process.env.VDT_EVIDENCE ?? path.join(os.tmpdir(), 'do-the-hard-thing-e2e');
const run = process.env.VDT_RUN_ID ?? `gaps-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const one = (name) => new Promise((resolve) => {
  let out = ''; let timedOut = false; let hard;
  const child = spawn(process.execPath, [DRIVE, name], { cwd: REPO, env: { ...process.env, VDT_URL: url, VDT_RUN_ID: run, VDT_EVIDENCE: ROOT }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  running.add(child);
  const timer = setTimeout(() => { timedOut = true; killGroup(child, 'SIGTERM'); hard = setTimeout(() => killGroup(child), 5000); }, TIMEOUT_MS);
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => { clearTimeout(timer); clearTimeout(hard); running.delete(child); resolve({ code: timedOut ? null : code, timedOut, out: out.trim() }); });
});

let failed = bad.length + expired.length;
let xfail = 0;
for (const g of toRun) {
  const t0 = Date.now();
  const dir = path.join(ROOT, run, g.journey);
  fs.rmSync(path.join(dir, 'result.json'), { force: true }); // a file left by an earlier run with this VDT_RUN_ID must not decide
  const r = await one(g.journey);
  const s = `(${((Date.now() - t0) / 1000).toFixed(1)}s)`;
  let result = null;
  try { result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); } catch { /* died before writing it */ }
  const error = String(result?.error ?? '');
  if (r.timedOut) { failed++; console.log(`WRONG    ${g.id}  ${g.journey} timed out after ${TIMEOUT_MS} ms  ${dir}  ${s}`); }
  else if (r.code === 0 && result?.ok) { failed++; console.log(`STALE    ${g.id}  ${g.journey} passes: the gap is fixed. Delete the entry and move the journey into the suite.  ${dir}  ${s}`); }
  else if (!result) { failed++; console.log(`WRONG    ${g.id}  ${g.journey} died before writing result.json (exit ${r.code}): ${r.out.split('\n').slice(-3).join(' | ') || 'no output'}  ${s}`); }
  else if (result.ok || r.code === 0 || !/^Error: gap open \(\d+ of \d+\): /.test(error) || !error.includes(g.fails_with)) { // the journey's own error, thrown by gap.end()
    failed++;
    const moved = /gap open \(\d+ of \d+\)/.test(error) ? ' (the gap moved: if part of it was fixed on purpose, put the new count in fails_with)' : '';
    console.log(`WRONG    ${g.id}  ${g.journey} failed without "${g.fails_with}"${moved}: ${error.split('\n')[0] || `exit ${r.code}, ok ${result.ok}`}  ${dir}  ${s}`);
  }
  else { xfail++; console.log(`XFAIL    ${g.id}  open as registered, expires ${g.expires}, owner ${g.owner}  ${dir}  ${s}`); }
}
stop();
console.log(`${failed ? 'FAIL' : 'PASS'} known gaps: ${xfail} open as registered, ${failed} problem(s), today ${today}`);
process.exit(failed ? 1 : 0);
