// The runner: copies the repo, applies each row, and records which layers catch it (see the usage in scripts/mutate.mjs).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO, LAYERS, fileText, count, sleep, portOpen, ready } from './common.mjs';
import { MUTATIONS } from './table.mjs';
import { checkTable } from './check-table.mjs';

export async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    const problems = checkTable();
    for (const p of problems) console.error(`mutation table: ${p}`);
    console.log(problems.length ? `mutation table BROKEN: ${problems.length} problems` : `mutation table OK: ${MUTATIONS.length} rows`);
    process.exit(problems.length ? 1 : 0);
  }
  const fast = argv.includes('--fast');
  const li = argv.indexOf('--layers');
  const layers = li >= 0 ? (argv[li + 1] ?? '').split(',') : LAYERS;
  if (!layers.length || layers.some((l) => !LAYERS.includes(l))) { console.error(`--layers takes a comma list of ${LAYERS.join(',')}`); process.exit(2); }
  const ids = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--layers');
  const unknown = ids.filter((id) => !MUTATIONS.some((m) => m.id === id));
  if (unknown.length) { console.error(`unknown id: ${unknown.join(' ')}`); process.exit(2); }
  const todo = ids.length ? MUTATIONS.filter((m) => ids.includes(m.id)) : MUTATIONS;

  const PORT = process.env.VDT_PORT;
  if (layers.includes('journeys')) {
    if (!/^\d+$/.test(PORT ?? '') || Number(PORT) <= 4400 || Number(PORT) > 65535) { console.error(`VDT_PORT is ${PORT ? `${PORT}, not a port above 4400` : 'unset'}: pick a free port of your own above 4400 (never 4317), e.g. export VDT_PORT=$((4400 + RANDOM % 500))`); process.exit(2); }
    if (await portOpen(PORT)) { console.error(`port ${PORT} is busy: pick another VDT_PORT`); process.exit(2); }
  }
  const tag = `mutate-${PORT ?? process.pid}`;
  const COPY = path.resolve(process.env.MUT_DIR ?? path.join(os.tmpdir(), tag));
  const OUT = process.env.MUT_OUT ?? path.join(os.tmpdir(), `${tag}-results.json`);
  const EVIDENCE = path.join(os.tmpdir(), `${tag}-evidence`);
  if (COPY === REPO || COPY.startsWith(REPO + path.sep)) { console.error('MUT_DIR must be outside this checkout'); process.exit(2); }
  const URL = `http://127.0.0.1:${PORT}`;
  const timeout = Number(process.env.VDT_JOURNEY_TIMEOUT_MS ?? 120000);
  const bin = (b) => path.join(COPY, 'node_modules/.bin', b);

  // the preview and every child run in their own process group (detached), so a kill reaches vitest's workers and a
  // journey's Chromium too; on exit, SIGINT and SIGTERM every group still running is killed, as in e2e/run.mjs
  const running = new Set();
  let preview = null;
  const killGroup = (child, sig = 'SIGKILL') => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
  const stop = () => { for (const c of running) killGroup(c); running.clear(); if (preview) { killGroup(preview); preview = null; } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  process.on('SIGTERM', () => { stop(); process.exit(143); });

  /** One child in its own group; a timeout gets SIGTERM (so a journey can still write its evidence), SIGKILL 5 s later. */
  const run = (cmd, args, { env = {}, ms = 0 } = {}) => new Promise((resolve) => {
    let out = ''; let timedOut = false; let timer; let hard;
    const child = spawn(cmd, args, { cwd: COPY, env: { ...process.env, VDT_URL: URL, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    running.add(child);
    if (ms) timer = setTimeout(() => { timedOut = true; killGroup(child, 'SIGTERM'); hard = setTimeout(() => killGroup(child), 5000); }, ms);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { out += `\n${e.message}`; });
    child.on('close', (code) => {
      clearTimeout(timer); clearTimeout(hard); running.delete(child);
      resolve({ ok: code === 0 && !timedOut, out: timedOut ? `${out}\nFAIL timeout: stopped after ${ms} ms (VDT_JOURNEY_TIMEOUT_MS)` : out });
    });
  });
  const errLines = (out, re) => out.split('\n').map((l) => l.trim()).filter((l) => re.test(l)).slice(0, 4).join(' | ').slice(0, 400);
  // the error messages of the last eslint run; when eslint stopped before writing the file (a config error), its output stands in
  const ESLINT_JSON = `${COPY}-eslint.json`;
  const eslintErrors = (out) => {
    if (!fs.existsSync(ESLINT_JSON)) return [{ ruleId: 'eslint-crashed', line: 0, column: 0, message: errLines(out, /error/i) || out.trim().split('\n')[0] || '' }];
    const report = JSON.parse(fs.readFileSync(ESLINT_JSON, 'utf8'));
    const seen = new Set(); // the compiler rules can report one message several times at one place
    const errors = report.flatMap((r) => r.messages).filter((m) => m.severity === 2).map((m) => ({ ...m, ruleId: m.ruleId ?? 'parse-error' }))
      .filter((m) => { const k = `${m.line}:${m.column}:${m.ruleId}`; return !seen.has(k) && seen.add(k); });
    return errors.length ? errors : [{ ruleId: 'eslint-exit', line: 0, column: 0, message: errLines(out, /\S/) }];
  };
  const uniq = (xs) => [...new Set(xs)].slice(0, 6);
  const secs = (t0) => Math.round((Date.now() - t0) / 100) / 10;

  // the copy: no .git, no dist, no table test; node_modules is a directory of links to the real entries, so the caches
  // tsc, vite and vitest write under node_modules (.tmp, .vite, .vitest, .vitest-cache) stay in the copy
  fs.rmSync(COPY, { recursive: true, force: true });
  fs.rmSync(EVIDENCE, { recursive: true, force: true });
  const skip = new Set(['node_modules', 'dist', '.git', 'scripts/mutate.test.mjs']);
  fs.cpSync(REPO, COPY, { recursive: true, filter: (src) => { const rel = path.relative(REPO, src).split(path.sep).join('/'); return !skip.has(rel) && !skip.has(rel.split('/')[0]); } });
  fs.mkdirSync(path.join(COPY, 'node_modules'));
  for (const e of fs.readdirSync(path.join(REPO, 'node_modules'))) {
    if (['.tmp', '.vite', '.vitest', '.vitest-cache', '.cache'].includes(e)) continue;
    fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules', e)), path.join(COPY, 'node_modules', e));
  }
  const pristine = new Map(MUTATIONS.map((m) => [m.file, fileText(COPY, m.file)]));
  const restore = () => { for (const [f, text] of pristine) if (fileText(COPY, f) !== text) fs.writeFileSync(path.join(COPY, f), text); };

  // `by` names what caught it: eslint rule ids (from the JSON report; `parse-error` for a fatal parse, `eslint-crashed` when
  // no report was written, `eslint-exit` when eslint failed with no error in the report), the first check-text line, the files tsc
  // reports, the failing vitest test files
  const layer = {
    // eslint writes JSON to a file: react-hooks 7 messages span several lines, so the rule id is not on the error line of the text output
    lint: async () => { fs.rmSync(ESLINT_JSON, { force: true }); const e = await run(bin('eslint'), ['.', '-f', 'json', '-o', ESLINT_JSON]); const c = await run(process.execPath, ['scripts/check-text.mjs']);
      const errors = e.ok ? [] : eslintErrors(e.out); fs.rmSync(ESLINT_JSON, { force: true });
      return { ok: e.ok && c.ok, by: [...uniq(errors.map((m) => m.ruleId)), ...(c.ok ? [] : [`check-text: ${c.out.trim().split('\n')[0].slice(0, 120)}`])],
        detail: [e.ok ? '' : errors.slice(0, 4).map((m) => `${m.line}:${m.column}  error  ${m.message.split('\n')[0]}  ${m.ruleId}`).join(' | ').slice(0, 400), c.ok ? '' : errLines(c.out, /\S/)].filter(Boolean).join(' | ') }; },
    types: async () => { const r = await run(bin('tsc'), ['-b']);
      return { ok: r.ok, by: r.ok ? [] : uniq([...r.out.matchAll(/^(\S+?)\(\d+,\d+\): error TS/gm)].map((m) => m[1])), detail: r.ok ? '' : errLines(r.out, /error TS/) }; },
    unit: async () => { const r = await run(bin('vitest'), ['run', '--reporter=dot']);
      return { ok: r.ok, by: r.ok ? [] : uniq([...r.out.matchAll(/^\s*FAIL\s+(\S+\.test\.\w+)/gm)].map((m) => m[1])),
        detail: [(r.out.match(/^\s*Tests\s+.*$/m) ?? [''])[0].trim(), errLines(r.out, /^FAIL\s/)].filter(Boolean).join(' | ') }; },
  };
  /** Build the copy, serve dist on PORT, check the bytes it serves are this build's, run each journey in its own group. */
  async function journeys(names, evidence) {
    const b = await run(bin('vite'), ['build']);
    if (!b.ok) return { ok: false, built: false, detail: `vite build failed: ${errLines(b.out, /error/i)}` };
    if (await portOpen(PORT)) { console.error(`port ${PORT} is busy before the preview started: port busy or another server answers; stopping`); process.exit(2); }
    const log = fs.openSync(path.join(COPY, 'preview.log'), 'w');
    preview = spawn(bin('vite'), ['preview', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], { cwd: COPY, detached: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); // the child holds its own copy
    const mine = preview;
    try {
      const served = await ready(URL, mine);
      if (served == null) {
        if (mine.exitCode !== null || mine.signalCode) { console.error(`vite preview exited (code ${mine.exitCode ?? mine.signalCode}): port busy or another server answers on ${URL}; see ${COPY}/preview.log`); process.exit(2); }
        return { ok: false, built: true, detail: `preview not ready on ${URL}; see ${COPY}/preview.log` };
      }
      if (served !== fileText(COPY, 'dist/index.html')) { console.error(`${URL}/index.html is not ${COPY}/dist/index.html: port busy or another server answers; stopping`); process.exit(2); }
      const each = [];
      for (const name of names) {
        const t0 = Date.now();
        const r = await run(process.execPath, ['e2e/drive.mjs', name], { ms: timeout, env: { VDT_EVIDENCE: evidence } });
        const pass = r.ok && new RegExp(`^PASS ${name}\\b`, 'm').test(r.out);
        each.push({ name, pass, seconds: secs(t0), detail: pass ? '' : (errLines(r.out, /^(FAIL|\s*\w*Error)/) || r.out.trim().split('\n').slice(-2).join(' | ')).slice(0, 300) });
      }
      return { ok: each.every((j) => j.pass), built: true, each };
    } finally {
      killGroup(mine, 'SIGTERM'); preview = null;
      for (let i = 0; i < 40 && await portOpen(PORT); i++) await sleep(250);
      killGroup(mine);
    }
  }

  // control: the pristine copy must pass before any row means anything
  const control = {};
  for (const l of layers.filter((x) => x !== 'journeys')) {
    const t0 = Date.now(); control[l] = { ...await layer[l](), seconds: secs(t0) };
    console.log(`control ${l}: ${control[l].ok ? 'pass' : 'FAIL'} (${control[l].seconds}s) ${control[l].detail ?? ''}`);
  }
  if (Object.values(control).some((c) => !c.ok)) { console.error(`the unmutated copy in ${COPY} is red: fix that first`); process.exit(2); }

  const results = [];
  for (const m of todo) {
    restore();
    const r = { id: m.id, what: m.what, file: m.file, journeysListed: m.journeys, layers: {}, result: '', killedBy: [], seconds: 0 };
    const t0 = Date.now();
    let text = pristine.get(m.file);
    const bad = m.edits.map(([find]) => count(text, find)).findIndex((n) => n !== 1);
    if (bad >= 0) {
      r.result = 'NOT-APPLIED'; r.detail = `${m.file} has ${count(text, m.edits[bad][0])} of ${JSON.stringify(m.edits[bad][0].slice(0, 70))}`;
      results.push(r); console.log(`NOT-APPLIED ${m.id}: ${r.detail}`); continue;
    }
    for (const [find, repl] of m.edits) text = text.replace(find, () => repl);
    fs.writeFileSync(path.join(COPY, m.file), text);
    for (const l of LAYERS) {
      if (!layers.includes(l)) { r.layers[l] = { status: 'skipped' }; continue; }
      if (fast && r.killedBy.length) { r.layers[l] = { status: 'skipped (--fast)' }; continue; }
      const lt = Date.now();
      if (l === 'journeys') {
        if (r.layers.types?.status === 'FAIL') { r.layers[l] = { status: 'n/a (no build)' }; continue; }
        if (!m.journeys.length) { r.layers[l] = { status: `n/a (${m.only}-only)` }; continue; }
        const j = await journeys(m.journeys, path.join(EVIDENCE, m.id));
        r.layers[l] = { status: j.ok ? 'pass' : 'FAIL', failed: (j.each ?? []).filter((x) => !x.pass).map((x) => x.name), each: j.each, detail: j.detail, built: j.built, seconds: secs(lt) };
      } else {
        const x = await layer[l]();
        r.layers[l] = { status: x.ok ? 'pass' : 'FAIL', by: x.by, detail: x.detail, seconds: secs(lt) };
      }
      if (r.layers[l].status === 'FAIL') r.killedBy.push(l);
    }
    r.seconds = secs(t0);
    r.result = r.killedBy.length ? 'KILLED' : 'SURVIVED';
    results.push(r);
    const jl = r.layers.journeys;
    console.log(`${r.result.padEnd(8)} ${m.id} (${r.seconds}s) ${LAYERS.map((l) => `${l} ${r.layers[l].status}`).join(', ')}${jl?.failed?.length ? `: ${jl.failed.join(' ')}` : ''}`);
  }
  restore();

  // control for the journeys: a journey that also fails on the unmutated build is no catch
  const failedSomewhere = [...new Set(results.flatMap((r) => r.layers.journeys?.failed ?? []))];
  if (failedSomewhere.length) {
    const c = await journeys(failedSomewhere, path.join(EVIDENCE, '_control'));
    const redAlready = new Set(c.built ? c.each.filter((x) => !x.pass).map((x) => x.name) : failedSomewhere);
    control.journeys = { ran: failedSomewhere, failedUnmutated: [...redAlready], detail: c.detail };
    console.log(`control journeys: ${failedSomewhere.length} run on the unmutated build, ${redAlready.size} fail there too${redAlready.size ? `: ${[...redAlready].join(' ')}` : ''}`);
    for (const r of results) {
      const jl = r.layers.journeys;
      if (!jl?.failed?.length || jl.failed.some((n) => !redAlready.has(n))) continue;
      jl.status = `pass (only ${jl.failed.join(', ')} failed, red unmutated too)`;
      r.killedBy = r.killedBy.filter((l) => l !== 'journeys');
      r.result = r.killedBy.length ? 'KILLED' : 'SURVIVED';
    }
  }

  const n = (k) => results.filter((r) => r.result === k).length;
  const totals = { killed: n('KILLED'), survived: n('SURVIVED'), notApplied: n('NOT-APPLIED') };
  fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), port: PORT ?? null, layers, fast, control, totals, rows: results }, null, 2));
  const cell = (r, l) => { const x = r.layers[l]; if (!x) return 'n/a'; if (x.status !== 'FAIL') return x.status;
    const by = l === 'journeys' ? x.failed : x.by; return by?.length ? `FAIL: ${by.join(', ')}` : l === 'journeys' ? `FAIL: ${x.detail}` : 'FAIL'; };
  console.log('\n| mutation | lint | types | unit | journeys | result | s |\n|---|---|---|---|---|---|---|');
  for (const r of results) {
    const res = r.result === 'KILLED' ? `KILLED by ${r.killedBy.join('+')}` : `**${r.result}**`;
    console.log(`| ${r.what} (\`${r.id}\`) | ${LAYERS.map((l) => cell(r, l)).join(' | ')} | ${res} | ${r.seconds} |`);
  }
  console.log(`\nkilled ${totals.killed}, survived ${totals.survived}, not-applied ${totals.notApplied}  (JSON: ${OUT})`);
  process.exit(totals.survived || totals.notApplied ? 1 : 0);
}