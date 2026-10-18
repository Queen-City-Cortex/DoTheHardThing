// Mutation table: does the whole safety net go red when a behavior breaks? Each row is a small source edit applied in a
// COPY of the repo (never in this checkout). The copy is checked by every layer, each recorded in its own column:
//   lint      eslint . and scripts/check-text.mjs (what `npm run lint` runs)
//   types     tsc -b (a compile catch; when it fails there is no build, so journeys are n/a)
//   unit      vitest run (the whole suite; scripts/mutate.test.mjs is left out of the copy, it checks this table)
//   journeys  vite build, vite preview on VDT_PORT, then the row's journeys, one `node e2e/drive.mjs <name>` each
// Result per row:
//   KILLED       at least one layer failed (good: something guards the behavior); the result names the layers
//   SURVIVED     every layer passed with the behavior broken: a blind spot, or the row is wrong
//   NOT-APPLIED  a find string does not occur exactly once in its file (the table has rotted: fix the row)
// Before the rows the pristine copy must pass lint, types and unit; after them, every journey that failed in some row runs
// once more on the pristine build, and a journey that fails there too does not count as a catch.
// Usage: VDT_PORT=<free port above 4400> node scripts/mutate.mjs [ids...] [--fast] [--layers lint,types,unit,journeys]
//   --fast    stop each row at the first layer that catches it (in the order above)
//   --check   check the table against this tree (find strings, journey names, ids) and exit; runs nothing
// MUT_DIR (default $TMPDIR/mutate-<port>) is the copy, MUT_OUT (default $TMPDIR/mutate-<port>-results.json) the JSON, journey
// evidence goes to $TMPDIR/mutate-<port>-evidence (<port> is VDT_PORT, or this process id without the journeys layer), so two
// runs on different ports never clobber each other. Exit 1 when a row SURVIVED or was NOT-APPLIED.
// Each layer that fails says what caught the row (`by` in the JSON, after FAIL in the table): eslint rule ids and the first
// check-text line, the files tsc reports, the failing vitest test files, the failing journeys.
// The preview and every child (each layer, each journey) run in their own process group, killed on exit, SIGINT and
// SIGTERM, so an interrupted run leaves no server on VDT_PORT and no Chromium behind. Before the first journey of a build
// the served /index.html must equal the copy's dist/index.html, or the run stops: another server answers on the port.
// The quote-cut row is killed only with FERRISS_TRANSCRIPT set (the transcript is not in the repo); without it that row SURVIVES.
// Local only: run it by hand or from a scheduled job of your own; the repo has no scheduled workflow. About 15 to 30 minutes
// (36 rows took 27 minutes on a shared machine), NOT part of npm run check or the PR CI job.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..');
const EM = String.fromCharCode(0x2014);
const BRAND_LINE = "export const BRAND = 'Do The Hard Thing';";
const DOMAIN_LINE = "export const DOMAIN_DISPLAY = 'DoTheHardThing.app';";
const ASK_BACK = "<button className=\"secondary\" onClick={() => (idx ? setIdx(idx - 1) : onBack())}>{t('back')}</button>";
const CUTOFFS = 'export const LATE_CUTOFFS = { welcomeFraming: 11, pickWarning: 12 } as const;';
const PICK_LATE = "const late = isLate(clockNow(), 'pickWarning');";
const PICK_DEFAULT = 'useState<number>(small ? SMALL_BLOCK_DEFAULT : BLOCK_MIN)';
const ROLLOVER = '  if (dayKey(new Date(now)) === day.date) return false;\n  if (day.closed) return true;';

// { id, what, file, edits: [[find, replace], ...], journeys, only?, why? }. A row with no journey says which layer alone
// can see it (`only`) and why. Each find must occur exactly once in the file (scripts/mutate.test.mjs checks the table).
export const MUTATIONS = [
  // the method's numbers and the two late cutoffs
  { id: 'block-min-30', what: 'full block 120 to 30 minutes (method.ts)', file: 'src/method.ts',
    edits: [['value: { min: 120, max: 180, mid: 150 },', 'value: { min: 30, max: 180, mid: 150 },']],
    journeys: ['pick-default-length', 'close-day', 'start-end-block', 'short-block-yes-counts', 'small-block-modified'] },
  { id: 'welcome-cutoff-12', what: 'Welcome late cutoff 11 to 12 (LATE_CUTOFFS.welcomeFraming)', file: 'src/method.ts',
    edits: [[CUTOFFS, CUTOFFS.replace('welcomeFraming: 11', 'welcomeFraming: 12')]],
    journeys: ['late-cutoffs', 'returning-late', 'first-visit-late', 'welcome-hour-line', 'missed-days'] },
  { id: 'pick-cutoff-11', what: 'Pick late cutoff 12 to 11 (LATE_CUTOFFS.pickWarning)', file: 'src/method.ts',
    edits: [[CUTOFFS, CUTOFFS.replace('pickWarning: 12', 'pickWarning: 11')]], journeys: ['late-cutoffs', 'review-copy', 'small-block-modified'] },
  { id: 'welcome-late-from-12-logic', what: 'Welcome reads the Pick cutoff (late framing from 12:00, logic.ts)', file: 'src/logic.ts',
    edits: [["const late = lateAt(now.getHours(), 'welcomeFraming');", "const late = lateAt(now.getHours(), 'pickWarning');"]], journeys: ['late-cutoffs', 'returning-late'] },
  { id: 'pick-late-line-from-11', what: 'Pick reads the Welcome cutoff (late line from 11:00)', file: 'src/App.tsx',
    edits: [[PICK_LATE, PICK_LATE.replace('pickWarning', 'welcomeFraming')]], journeys: ['late-cutoffs'] },
  { id: 'pick-late-line-never', what: 'Pick never shows its late line', file: 'src/App.tsx',
    edits: [[PICK_LATE, PICK_LATE.replace(');', ') && false;')]], journeys: ['late-cutoffs', 'review-copy', 'small-block-modified'] },
  { id: 'pick-risky-last', what: 'pick order flipped, risky last', file: 'src/logic.ts',
    edits: [['return [...hl.filter((i) => i.tags.includes(PICK_FIRST)), ...hl.filter((i) => !i.tags.includes(PICK_FIRST))];',
      'return [...hl.filter((i) => !i.tags.includes(PICK_FIRST)), ...hl.filter((i) => i.tags.includes(PICK_FIRST))];']], journeys: ['pick-order-risky-first'] },
  { id: 'break-limit-20', what: 'break limit 10 to 20 minutes (BREAK_LIMIT_MS)', file: 'src/method.ts',
    edits: [['export const BREAK_LIMIT_MS = BREAK_LIMIT_MIN * 60_000;', 'export const BREAK_LIMIT_MS = BREAK_LIMIT_MIN * 120_000;']],
    journeys: ['step-away-broken', 'review-copy'] },
  { id: 'two-breaks', what: 'one break per block allows two', file: 'src/logic.ts',
    edits: [['taken >= 0 && taken < BREAKS_PER_BLOCK;', 'taken >= 0 && taken <= BREAKS_PER_BLOCK;']], journeys: ['one-break-per-block', 'review-copy'] },
  { id: 'pick-default-150', what: 'Pick starts on 2½h instead of the 2h minimum', file: 'src/App.tsx',
    edits: [[PICK_DEFAULT, PICK_DEFAULT.replace(': BLOCK_MIN)', ': BLOCK_MIN + 30)')]], journeys: ['pick-default-length', 'start-end-block', 'close-day'] },
  { id: 'bare-block-lengths', what: 'Pick writes the full block lengths as bare numbers (same values)', file: 'src/App.tsx',
    edits: [['const opts = small ? BLOCK_CHOICES.small : BLOCK_CHOICES.full;', 'const opts = small ? BLOCK_CHOICES.small : [120, 150, 180];']],
    journeys: [], only: 'lint', why: 'the same numbers written bare: the app behaves the same, so only the method-number lint can see it' },
  // the day and its records
  { id: 'trim-days-3', what: 'trimDays window 120 to 3', file: 'src/logic.ts', edits: [['export const MAX_DAYS = 120;', 'export const MAX_DAYS = 3;']],
    journeys: ['count-grows', 'start-over-count', 'close-not-today-count'] },
  { id: 'rollover-never', what: 'shouldRollOver always false', file: 'src/logic.ts',
    edits: [[ROLLOVER, ROLLOVER.replace('=== day.date)', '=== day.date || now)')]], journeys: ['midnight-rollover', 'block-across-midnight'] },
  { id: 'settle-never-complete', what: 'settle never completes a block', file: 'src/logic.ts',
    edits: [['if (b.pausedAt == null && remainingMs(b, now) === 0) return', 'if (b.pausedAt == null && remainingMs(b, now) < 0) return']],
    journeys: ['close-day', 'block-across-midnight', 'block-reload-after-midnight', 'small-block-modified'] },
  { id: 'leftovers-ignore-didit', what: 'didIt ignored by leftovers (a done item carries over)', file: 'src/logic.ts',
    edits: [['.filter((i) => !(d.didIt === true && i.id === d.chosenId) && !aside.includes(i))', '.filter((i) => !aside.includes(i))']],
    journeys: ['yes-clears-item', 'short-block-yes-counts'] },
  { id: 'supersedes-never', what: "a stale tab never takes the other tab's closed day", file: 'src/logic.ts',
    edits: [['export const supersedes = (stored: Day, mine: Day) => stored.closed &&', "export const supersedes = (stored: Day, mine: Day) => stored.closed && mine.date === 'never' &&"]],
    journeys: ['two-tabs'] },
  { id: 'done-text-null', what: 'Yes stores no doneText (Your days shows a placeholder)', file: 'src/state.ts',
    edits: [['doneText: a.didIt ? chosenItem(s.day)?.text ?? null : null', 'doneText: null']], journeys: ['count-grows', 'history-from-close-and-about'] },
  { id: 'pick-back-to-welcome', what: 'reducer: stepBack on Pick (Look again) lands on Welcome, not Ask', file: 'src/state.ts',
    edits: [["if (a.type === 'stepBack') return { screen: 'ask', day: s.day, small: s.small };", "if (a.type === 'stepBack') return { screen: 'welcome', day: s.day, small: s.small };"]],
    journeys: ['copy-from-the-talk'] },
  { id: 'block-without-choice', what: 'reducer: Start the block with no choice still opens the block screen', file: 'src/state.ts',
    edits: [['if (!s.chosen) return s;', "if (!s.chosen) return { screen: 'block', now, day: { ...s.day, block: { ...L.startBlock(a.min, now, s.small), endedAt: null }, gotBlock: null } };"]],
    journeys: ['pick-requires-choice'] },
  // screens
  { id: 'first-day-hidden-after-nav', what: 'first-day line gone after leaving Close and coming back (remount)', file: 'src/App.tsx',
    edits: [['export function Close(', 'let closeSeen = false;\nexport function Close('],
      ['  const { note, count } = L.closeLines(didIt, total);\n', '  const { note, count } = L.closeLines(didIt, total);\n  const again = useRef(closeSeen).current;\n  useEffect(() => { closeSeen = true; }, []);\n'],
      ['{count && <Tally line={count} />}', "{count && !(again && count === t('close.firstCount')) && <Tally line={count} />}"]],
    journeys: ['close-first-day-after-nav', 'history-from-close-and-about', 'close-not-today-count', 'count-grows'] },
  { id: 'no-hour-line-first-visit', what: 'hour-before-email line removed from the first-visit welcome', file: 'src/App.tsx',
    edits: [["        <p className=\"hour\">{t('welcome.hour')}</p>\n", '']], journeys: ['first-visit', 'first-visit-late', 'welcome-v1'] },
  { id: 'ask-no-back', what: 'Back button dropped on Ask', file: 'src/App.tsx', edits: [[ASK_BACK, `{false && ${ASK_BACK}}`]],
    journeys: ['ask-back', 'first-visit', 'welcome-v1', 'focus-after-nav'] },
  { id: 'ask-back-skips-to-name', what: 'Back on a later Ask item goes to Name, not the item before', file: 'src/App.tsx',
    edits: [['onClick={() => (idx ? setIdx(idx - 1) : onBack())}', 'onClick={() => onBack()}']], journeys: ['ask-back'] },
  { id: 'save-note-hidden', what: 'blocked-storage note never shown', file: 'src/App.tsx',
    edits: [['useEffect(() => { setSaveFailed(!save(store, day.date)); }, [store, day.date]);', 'useEffect(() => { save(store, day.date); setSaveFailed(false); }, [store, day.date]);']],
    journeys: ['storage-blocked'] },
  { id: 'item-as-html', what: 'step 1 list renders item text as HTML', file: 'src/App.tsx',
    edits: [['<li key={i.id}><span>{i.text}</span>', '<li key={i.id}><span dangerouslySetInnerHTML={{ __html: i.text }} />']], journeys: ['hostile-text'] },
  { id: 'dnt-ignored', what: 'Do Not Track ignored by analytics', file: 'src/analytics.ts', edits: [['if (!e.enabled || e.dnt()) return;', 'if (!e.enabled) return;']],
    journeys: ['analytics-do-not-track'] },
  // accessibility and layout
  { id: 'no-aria-pressed-group', what: 'aria-pressed removed from the Already-on-your-list toggles', file: 'src/App.tsx',
    edits: [["className={`choice ${on ? 'on' : ''}`} aria-pressed={on} onClick", "className={`choice ${on ? 'on' : ''}`} onClick"]],
    journeys: ['same-answer-two-steps', 'name-pending-draft'] },
  { id: 'no-aria-pressed-leftover', what: 'aria-pressed removed from the step 1 leftover toggles', file: 'src/App.tsx',
    edits: [[' aria-pressed={has(l.text)} ', ' ']], journeys: ['step0-bring-in', 'returning-late'] },
  { id: 'no-role-timer', what: 'role=timer removed', file: 'src/App.tsx', edits: [['role="timer" aria-live="off"', 'aria-live="off"']], journeys: ['start-end-block'] },
  { id: 'dots-no-role', what: 'progress dots lose role=img', file: 'src/App.tsx', edits: [['className="steps" role="img" aria-label', 'className="steps" aria-label']],
    journeys: ['focus-after-nav', 'review-copy'] },
  { id: 'no-overflow-wrap', what: 'overflow-wrap removed from index.css', file: 'src/index.css', edits: [['body{overflow-wrap:anywhere}', 'body{}']],
    journeys: ['long-url-widths', 'small-phone-layout'] },
  { id: 'muted-low-contrast', what: '--muted back to #6b7079 (4.48:1)', file: 'src/index.css', edits: [['--muted:#5c616a', '--muted:#6b7079']], journeys: ['contrast-aa'] },
  // the brand, the domain and the copy
  { id: 'brand-lowercase-header', what: 'brand lowercased in the header (App.tsx)', file: 'src/App.tsx',
    edits: [['<span className="brand">{BRAND}</span>', '<span className="brand">{BRAND.toLowerCase()}</span>']], journeys: ['first-visit', 'social-preview'] },
  { id: 'brand-lowercase-copy', what: 'brand lowercased at the source (copy.ts BRAND)', file: 'src/copy.ts',
    edits: [[BRAND_LINE, BRAND_LINE.replace(/'.*'/, (m) => m.toLowerCase())]], journeys: ['first-visit', 'social-preview'] },
  { id: 'domain-lowercase-copy', what: 'domain lowercased at the source (copy.ts DOMAIN_DISPLAY)', file: 'src/copy.ts',
    edits: [[DOMAIN_LINE, DOMAIN_LINE.replace(/'.*'/, (m) => m.toLowerCase())]], journeys: ['social-preview'] },
  { id: 'em-dash-copy', what: 'an em dash in a copy.ts line (pick.ten)', file: 'src/copy.ts',
    edits: [['nothing important gets done. So pick one.', `nothing important gets done ${EM} so pick one.`]], journeys: ['review-copy', 'copy-from-the-talk'] },
  { id: 'quote-cut', what: 'a talk quote loses its last word (about.busy)', file: 'src/copy.ts',
    edits: [["text: 'Being busy is a form of laziness.'", "text: 'Being busy is a form of.'"]], journeys: ['copy-from-the-talk'] },
];

const LAYERS = ['lint', 'types', 'unit', 'journeys'];
const fileText = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const count = (text, find) => text.split(find).length - 1;
/** Journey names in e2e/drive.mjs, read the cheap way: each is `'name': journey(` at the start of a line. */
export const journeyNames = (root = REPO) => new Set([...fileText(root, 'e2e/drive.mjs').matchAll(/^\s*'([a-z0-9-]+)': journey\(/gm)].map((m) => m[1]));

/** Every way the table can be wrong against a tree: an empty list means it is OK. */
export function checkTable(root = REPO, rows = MUTATIONS) {
  const problems = [];
  const names = journeyNames(root);
  const seen = new Set();
  for (const m of rows) {
    if (seen.has(m.id)) problems.push(`${m.id}: duplicate id`);
    seen.add(m.id);
    if (!m.edits.length) problems.push(`${m.id}: no edits`);
    const text = fs.existsSync(path.join(root, m.file)) ? fileText(root, m.file) : '';
    for (const [find] of m.edits) if (count(text, find) !== 1) problems.push(`${m.id}: ${m.file} has ${count(text, find)} of ${JSON.stringify(find.slice(0, 70))}`);
    for (const j of m.journeys) if (!names.has(j)) problems.push(`${m.id}: no journey ${j} in e2e/drive.mjs`);
    if (!m.journeys.length && !(['lint', 'types', 'unit'].includes(m.only) && m.why)) problems.push(`${m.id}: no journey, and no only (lint, types or unit) with a why`);
  }
  return problems;
}

async function main() {
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
  const uniq = (xs) => [...new Set(xs)].slice(0, 6);
  const secs = (t0) => Math.round((Date.now() - t0) / 100) / 10;

  // the copy: no .git, no dist, no table test; node_modules is a directory of links to the real entries, so the caches
  // tsc, vite and vitest write under node_modules (.tmp, .vite, .vitest) stay in the copy
  fs.rmSync(COPY, { recursive: true, force: true });
  fs.rmSync(EVIDENCE, { recursive: true, force: true });
  const skip = new Set(['node_modules', 'dist', '.git', 'scripts/mutate.test.mjs']);
  fs.cpSync(REPO, COPY, { recursive: true, filter: (src) => { const rel = path.relative(REPO, src).split(path.sep).join('/'); return !skip.has(rel) && !skip.has(rel.split('/')[0]); } });
  fs.mkdirSync(path.join(COPY, 'node_modules'));
  for (const e of fs.readdirSync(path.join(REPO, 'node_modules'))) {
    if (['.tmp', '.vite', '.vitest', '.cache'].includes(e)) continue;
    fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules', e)), path.join(COPY, 'node_modules', e));
  }
  const pristine = new Map(MUTATIONS.map((m) => [m.file, fileText(COPY, m.file)]));
  const restore = () => { for (const [f, text] of pristine) if (fileText(COPY, f) !== text) fs.writeFileSync(path.join(COPY, f), text); };

  // `by` names what caught it: eslint rule ids (the last word of an error line), the first check-text line, the files tsc
  // reports, the failing vitest test files
  const layer = {
    lint: async () => { const e = await run(bin('eslint'), ['.']); const c = await run(process.execPath, ['scripts/check-text.mjs']);
      const rules = e.ok ? [] : uniq(e.out.split('\n').filter((l) => /^\s*\d+:\d+\s+error\s/.test(l)).map((l) => l.trim().split(/\s+/).at(-1)));
      return { ok: e.ok && c.ok, by: [...rules, ...(c.ok ? [] : [`check-text: ${c.out.trim().split('\n')[0].slice(0, 120)}`])],
        detail: [e.ok ? '' : errLines(e.out, /error/), c.ok ? '' : errLines(c.out, /\S/)].filter(Boolean).join(' | ') }; },
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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port: Number(port) });
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
  });
}
/** The /index.html bytes `url` serves once it answers, or null when `child` (the preview) exits or 30 s pass. */
async function ready(url, child) {
  for (let i = 0; i < 60 && child.exitCode === null && !child.signalCode; i++) {
    try { const r = await fetch(`${url}/index.html`); if (r.ok) return await r.text(); } catch { /* not up yet */ }
    await sleep(500);
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
