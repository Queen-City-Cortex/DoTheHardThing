// Parallel journey runner. Each journey runs in its own `node e2e/drive.mjs <name>` child process, so isolation is
// exactly what drive.mjs gives one journey today: its own Chromium, a fresh context, its own fake clock, its own
// evidence dir. N workers pull journeys from one queue, slowest first.
// Usage (from the repo root):
//   node e2e/run.mjs [--workers N] [--fast | names...] [--serve] [--json file]
//   --workers N  parallel children (default: half the CPUs, at least 1)
//   --fast       only FAST, the per-PR subset below; with no names and no --fast, every journey in drive.mjs
//   --serve      start `vite preview` of the existing dist/ on VDT_PORT (default 4317, --strictPort) and stop it
//                afterwards, however the run ends; refuses when dist/ is older than src/, index.html, public/ or
//                vite.config.ts, or when the port is already taken (another agent's server)
//   otherwise VDT_URL must point at a running preview (`VDT_PORT=<your port> e2e/vdt launch` prints it)
// A journey that runs longer than VDT_JOURNEY_TIMEOUT_MS (default 120000) gets SIGTERM (so it can still write its
// failure evidence), SIGKILL 5 s later, and counts as a FAIL (timeout).
// Prints one PASS/FAIL line per journey with its evidence dir and seconds, then a summary; exit 0 only if all pass.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
// Per-PR subset: one journey per main path. The full list runs on master. Keep it about 8 and keep the reason.
export const FAST = [
  'first-visit', // welcome, Name, two questions, Pick: the whole morning path
  'start-end-block', // block countdown, End block, stored endReason
  'close-day', // Did you do it?, Yes / Not today, the gentle count
  'midnight-rollover', // the date rollover; a FAIL is a regression (e2e/README.md)
  'count-grows', // returning days built through the UI, history count only goes up
  'offline-reload', // service worker: the app loads offline after the first visit
  'long-url-widths', // overflow at 320 to 430 px
  'analytics-anonymous-counts', // the three bare-name counts, nothing a person writes leaves the device
];

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const workers = Math.max(1, Number(opt('--workers', Math.floor(os.availableParallelism() / 2))) || 1);
const jsonOut = opt('--json', null);
const fast = flag('--fast');
const serve = flag('--serve');
const TIMEOUT_MS = Number(process.env.VDT_JOURNEY_TIMEOUT_MS) || 120000;
const all = execFileSync(process.execPath, [path.join(HERE, 'drive.mjs'), '--list'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n');
const names = args.length ? args : fast ? FAST : all;
const unknown = names.filter((n) => !all.includes(n));
const gapNames = unknown.filter((n) => n.startsWith('gap-'));
if (gapNames.length) console.error(`${gapNames.join(', ')}: gap-* names are known-gap journeys, left out of the suite on purpose; run them with \`node e2e/gaps.mjs\` (\`npm run gaps\`) or \`e2e/vdt journey <name>\` (see Known gaps in e2e/README.md)`);
if (unknown.length) { console.error(`unknown journey(s): ${unknown.join(', ')}; see \`node e2e/drive.mjs --list\``); process.exit(2); }

// the preview and every drive.mjs child run in their own process group (detached), so a kill reaches their Chromium too
const running = new Set();
let preview = null;
const killGroup = (child, sig = 'SIGKILL') => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
const stop = () => {
  for (const c of running) killGroup(c);
  running.clear();
  if (preview) { killGroup(preview); preview = null; }
};
process.on('exit', stop); // also covers process.exit() and an uncaught throw, so the preview never outlives the run
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(143); });

const PORT = process.env.VDT_PORT ?? '4317';
let url = process.env.VDT_URL;
if (serve) {
  const newest = (p) => { const st = fs.statSync(p); return st.isDirectory() ? Math.max(st.mtimeMs, ...fs.readdirSync(p).map((f) => newest(path.join(p, f)))) : st.mtimeMs; };
  const built = fs.existsSync(path.join(REPO, 'dist/index.html')) ? fs.statSync(path.join(REPO, 'dist/index.html')).mtimeMs : 0;
  const src = Math.max(...['src', 'index.html', 'public', 'vite.config.ts'].map((p) => newest(path.join(REPO, p))));
  if (built < src) { console.error('dist/ is missing or older than src/, index.html, public/ or vite.config.ts: run `npm run build` first (the journeys drive dist/, not src/)'); process.exit(2); }
  url = `http://127.0.0.1:${PORT}`;
  // probe the port first: if another server holds it, the URL would answer with someone else's dist/
  const free = await new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false)).once('listening', () => srv.close(() => resolve(true)));
    srv.listen(Number(PORT), '127.0.0.1');
  });
  if (!free) { console.error(`port ${PORT} is already in use (another agent's server?): set VDT_PORT to a free port of your own, e.g. VDT_PORT=$((4400 + RANDOM % 500))`); process.exit(2); }
  preview = spawn(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = ''; preview.stderr.on('data', (d) => { log += d; });
  // ready when this preview prints its own `Local: http://127.0.0.1:<port>/` line, not when something answers the URL
  const up = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    preview.stdout.on('data', (d) => {
      log += d;
      // eslint-disable-next-line no-control-regex
      if (log.replace(/\x1b\[[0-9;]*m/g, '').includes(`Local:   ${url}/`)) { clearTimeout(timer); resolve(true); }
    });
    preview.once('exit', () => { clearTimeout(timer); resolve(false); });
  });
  if (!up) { console.error(`vite preview did not start on ${url}: ${log.trim()}`); process.exit(2); }
}
if (!url) { console.error('set VDT_URL (`VDT_PORT=<your port> e2e/vdt launch` prints it) or pass --serve'); process.exit(2); }

// slowest first, from the last run's timings when there are any, so the long journeys do not end up last
const TIMES = path.join(process.env.VDT_EVIDENCE ?? path.join(os.tmpdir(), 'do-the-hard-thing-e2e'), 'last-times.json');
// the file is shared by every run on the machine: a missing or corrupt one only loses the ordering
let prev = {};
try { prev = JSON.parse(fs.readFileSync(TIMES, 'utf8')) ?? {}; } catch { /* no timings yet, or a torn write */ }
const queue = [...names].sort((a, b) => (prev[b] ?? 0) - (prev[a] ?? 0));
const run = process.env.VDT_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const results = [];
const t0 = Date.now();

function one(name) {
  return new Promise((resolve) => {
    const start = Date.now(); let out = '';
    const child = spawn(process.execPath, [path.join(HERE, 'drive.mjs'), name], { cwd: REPO, env: { ...process.env, VDT_URL: url, VDT_RUN_ID: run }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    running.add(child);
    let timedOut = false;
    let hard;
    const timer = setTimeout(() => { timedOut = true; killGroup(child, 'SIGTERM'); hard = setTimeout(() => killGroup(child), 5000); }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      clearTimeout(timer); clearTimeout(hard); running.delete(child);
      const s = (Date.now() - start) / 1000;
      if (timedOut) out += `\nFAIL ${name} timeout: stopped after ${TIMEOUT_MS} ms (VDT_JOURNEY_TIMEOUT_MS)`;
      results.push({ name, ok: code === 0 && !timedOut, timedOut, s, out: out.trim() });
      console.log(`${out.trim()}  (${s.toFixed(1)}s)`);
      resolve();
    });
  });
}
try {
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => { while (queue.length) await one(queue.shift()); }));
} finally {
  stop();
}

const wall = (Date.now() - t0) / 1000;
const failed = results.filter((r) => !r.ok);
fs.mkdirSync(path.dirname(TIMES), { recursive: true });
const tmp = `${TIMES}.${process.pid}.tmp`; // write then rename, so a parallel run never reads half a file
fs.writeFileSync(tmp, JSON.stringify({ ...prev, ...Object.fromEntries(results.map((r) => [r.name, r.s])) }, null, 2));
fs.renameSync(tmp, TIMES);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ workers, wall, run, results }, null, 2));
const sum = results.reduce((a, r) => a + r.s, 0);
console.log(`${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length} journeys, ${workers} worker(s), wall ${wall.toFixed(1)}s, sum of journeys ${sum.toFixed(1)}s, run id ${run}`);
if (failed.length) console.log(`failed: ${failed.map((r) => r.name + (r.timedOut ? ' (timeout)' : '')).join(' ')}\nrerun one: ${serve ? `npm run journeys -- ${failed[0].name}` : `VDT_URL=${url} node e2e/drive.mjs ${failed[0].name}`}`);
process.exit(failed.length ? 1 : 0);
