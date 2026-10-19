// e2e/gaps.mjs on fixture registries (GAPS_FILE) and a fake drive script (GAPS_DRIVE), so no browser runs: each outcome
// the runner exists for (XFAIL, STALE, WRONG, EXPIRED, MALFORMED, MISSING, UNREGISTERED) prints its line and exit code.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** e2e/drive.mjs and the files it imports (e2e/drive/*.mjs, e2e/journeys/*.mjs), as one text. */
const driveText = () => [join(ROOT, 'e2e/drive.mjs'), ...['drive', 'journeys'].flatMap((d) => readdirSync(join(ROOT, 'e2e', d)).sort().map((f) => join(ROOT, 'e2e', d, f)))].map((f) => readFileSync(f, 'utf8')).join('\n');
const SCRIPT = join(ROOT, 'e2e/gaps.mjs');
const dir = mkdtempSync(join(tmpdir(), 'gaps-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// the fake drive.mjs: --list-gaps prints FAKE_GAPS; a journey writes result.json as drive.mjs does, by its name:
// gap-open fails with the registered text, gap-half with one of its two parts fixed, gap-other for another reason,
// gap-sentence with the registered words but not as the journey's own `gap open` error; gap-fixed passes, gap-dies writes
// nothing
const FAKE = join(dir, 'fake-drive.mjs');
writeFileSync(FAKE, `import fs from 'node:fs'; import path from 'node:path';
const [name] = process.argv.slice(2);
if (name === '--list-gaps') { console.log((process.env.FAKE_GAPS ?? '').split(',').filter(Boolean).join('\\n')); process.exit(0); }
if (name === 'gap-dies') { console.error('Error: cannot find module playwright'); process.exit(1); }
const out = path.join(process.env.VDT_EVIDENCE, process.env.VDT_RUN_ID, name); fs.mkdirSync(out, { recursive: true });
const error = { 'gap-open': 'Error: gap open (2 of 2): the wanted thing (saw "today"); the wanted thing again (saw "today")',
  'gap-half': 'Error: gap open (1 of 2): the wanted thing again (saw "today")', 'gap-other': 'TimeoutError: locator.click: Timeout 30000ms exceeded',
  'gap-sentence': 'Error: expect(locator).toHaveText: gap open (2 of 2): the wanted thing' }[name] ?? null;
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ journey: name, ok: !error, error, log: [] }));
console.log(error ? 'FAIL ' + name : 'PASS ' + name); process.exit(error ? 1 : 0);
`);

const entry = (id, journey, p = {}) => ({ id, journey, why: 'why it is open', owner: 'repo owner', expires: '2026-11-18', fixed_by: 'a product call', fails_with: 'gap open (2 of 2): the wanted thing', ...p });
let n = 0;
/** Run the runner on `gaps` (an array, or raw text) with the fake drive listing `listed`; today is 2026-10-18 unless set. */
function run(gaps, listed, env = {}) {
  const file = join(dir, `gaps-${++n}.json`);
  writeFileSync(file, typeof gaps === 'string' ? gaps : JSON.stringify(gaps));
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, GAPS_FILE: file, GAPS_DRIVE: FAKE, FAKE_GAPS: listed.join(','), GAPS_TODAY: '2026-10-18', VDT_EVIDENCE: join(dir, 'evidence'), VDT_RUN_ID: `run-${n}`, VDT_URL: 'http://127.0.0.1:1', ...env },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

describe('e2e/gaps.mjs', () => {
  it('XFAIL: an open gap that fails with its fails_with text passes the run', () => {
    const r = run([entry('open', 'gap-open')], ['gap-open']);
    expect(r.out).toMatch(/^XFAIL +open +open as registered, expires 2026-11-18, owner repo owner/m);
    expect(r.out).toContain('PASS known gaps: 1 open as registered, 0 problem(s), today 2026-10-18');
    expect(r.status, r.out).toBe(0);
  });
  it('STALE: a gap journey that passes fails the run and says to delete the entry', () => {
    const r = run([entry('fixed', 'gap-fixed')], ['gap-fixed']);
    expect(r.out).toMatch(/^STALE +fixed +gap-fixed passes: the gap is fixed\. Delete the entry and move the journey into the suite\./m);
    expect(r.status).toBe(1);
  });
  it('WRONG: a failure without the fails_with text fails the run and shows the error', () => {
    const r = run([entry('other', 'gap-other')], ['gap-other']);
    expect(r.out).toMatch(/^WRONG +other +gap-other failed without "gap open \(2 of 2\): the wanted thing": TimeoutError: locator\.click/m);
    expect(r.status).toBe(1);
  });
  it('WRONG: a half-fixed gap (1 of 2 still missing) does not match the registered count and says the gap moved', () => {
    const r = run([entry('half', 'gap-half')], ['gap-half']);
    expect(r.out).toMatch(/^WRONG +half +gap-half failed without "gap open \(2 of 2\): the wanted thing" \(the gap moved: .*new count in fails_with\): Error: gap open \(1 of 2\)/m);
    expect(r.status).toBe(1);
  });
  it('WRONG: the registered words in an error that is not the journey\'s own `gap open` line do not XFAIL', () => {
    const r = run([entry('sentence', 'gap-sentence', { fails_with: 'gap open (2 of 2): the wanted thing' })], ['gap-sentence']);
    expect(r.out).not.toContain('XFAIL');
    expect(r.status).toBe(1);
  });
  it('WRONG, not XFAIL: a result.json left by an earlier run with the same VDT_RUN_ID is deleted before the journey runs', () => {
    const ev = join(dir, 'evidence-stale');
    mkdirSync(join(ev, 'same-run', 'gap-dies'), { recursive: true });
    writeFileSync(join(ev, 'same-run', 'gap-dies', 'result.json'), JSON.stringify({ ok: false, error: 'Error: gap open (2 of 2): the wanted thing' }));
    const r = run([entry('dies', 'gap-dies')], ['gap-dies'], { VDT_EVIDENCE: ev, VDT_RUN_ID: 'same-run' });
    expect(r.out).toMatch(/^WRONG +dies +gap-dies died before writing result\.json/m);
    expect(r.status).toBe(1);
  });
  it('WRONG: a journey that dies before writing result.json is a labelled line with its output, not a crash', () => {
    const r = run([entry('dies', 'gap-dies')], ['gap-dies']);
    expect(r.out).toMatch(/^WRONG +dies +gap-dies died before writing result\.json \(exit 1\): Error: cannot find module playwright/m);
    expect(r.out).not.toMatch(/at JSON\.parse|node:internal/);
    expect(r.status).toBe(1);
  });
  it('EXPIRED: an entry past its date fails the run without running the journey', () => {
    const r = run([entry('open', 'gap-open')], ['gap-open'], { GAPS_TODAY: '2026-12-01' });
    expect(r.out).toMatch(/^EXPIRED +open +expired 2026-11-18 \(today 2026-12-01\), owner repo owner: a product call/m);
    expect(r.out).not.toContain('XFAIL');
    expect(r.status).toBe(1);
    expect(run([entry('open', 'gap-open')], ['gap-open'], { GAPS_TODAY: '2026-11-18' }).status, 'the expiry day itself is still open').toBe(0);
  });
  it('GAPS_TODAY that is not a date is refused, not compared as text', () => {
    const r = run([entry('open', 'gap-open')], ['gap-open'], { GAPS_TODAY: 'tomorrow' });
    expect(r.out).toContain('GAPS_TODAY must be a date, YYYY-MM-DD (it is "tomorrow")');
    expect(r.out).not.toContain('EXPIRED');
    expect(r.status).toBe(2);
  });
  it('MALFORMED: empty or missing fields, a bad date, an unknown field, a repeated id, and a registry that is not an array', () => {
    const r = run([entry('blank', 'gap-open', { owner: ' ' }), { id: 'short', journey: 'gap-open' }, entry('date', 'gap-open', { expires: '18/11/2026' }),
      entry('extra', 'gap-open', { note: 'x' }), entry('twice', 'gap-open'), entry('twice', 'gap-open'), entry('nocount', 'gap-open', { fails_with: 'the wanted thing' })], ['gap-open']);
    expect(r.out).toContain('MALFORMED blank: owner must be non-empty strings');
    expect(r.out).toContain('MALFORMED short: why, owner, expires, fixed_by, fails_with must be non-empty strings');
    expect(r.out).toContain('MALFORMED date: expires must be a date, YYYY-MM-DD (it is "18/11/2026")');
    expect(r.out).toContain('MALFORMED extra: unknown field(s) note');
    expect(r.out).toContain('MALFORMED twice: the id is used twice');
    expect(r.out).toContain('MALFORMED nocount: fails_with must start with the journey\'s own count, "gap open (N of M): " (it is "the wanted thing")');
    expect(r.status).toBe(1);
    expect(run('{ "id": "x" }', []).out).toMatch(/^MALFORMED .*: the registry is a JSON array of entries$/m);
    expect(run('[{', []).out).toMatch(/^MALFORMED .*JSON/m);
  });
  it('MISSING and UNREGISTERED: an entry whose journey does not exist, a gap journey with no entry, an unknown id', () => {
    const r = run([entry('gone', 'gap-renamed')], ['gap-open']);
    expect(r.out).toMatch(/^MISSING gone: no gap journey gap-renamed in .*fake-drive\.mjs \(--list-gaps\)$/m);
    expect(r.out).toMatch(/^UNREGISTERED gap-open: a gap journey with no entry in /m);
    expect(r.status).toBe(1);
    const spawn = spawnSync(process.execPath, [SCRIPT, 'nope'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GAPS_FILE: join(dir, 'gaps-1.json'), GAPS_DRIVE: FAKE, FAKE_GAPS: 'gap-open', GAPS_TODAY: '2026-10-18', VDT_EVIDENCE: join(dir, 'evidence') } });
    expect(spawn.stdout).toContain('MISSING nope: no such gap id');
    expect(spawn.status).toBe(1);
  });
  it('the real registry is well formed and every entry names a gap journey with meta in drive.mjs', () => {
    const gaps = JSON.parse(readFileSync(join(ROOT, 'e2e/known-gaps.json'), 'utf8'));
    const drive = driveText();
    for (const g of gaps) {
      expect(Object.keys(g).sort()).toEqual(['expires', 'fails_with', 'fixed_by', 'id', 'journey', 'owner', 'why']);
      expect(g.journey).toMatch(/^gap-/);
      expect(drive).toContain(`'${g.journey}': journey({ id: '${g.journey}'`);
      expect(g.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('each real fails_with is the journey\'s own text: `gap open (N of M): ` then words the journey writes, M its gap.want count', () => {
    const gaps = JSON.parse(readFileSync(join(ROOT, 'e2e/known-gaps.json'), 'utf8'));
    const drive = driveText();
    expect(drive).toContain('`gap open (${open.length} of ${total}): ${open.join(\'; \')}`');
    for (const g of gaps) {
      const [, n, m, words] = g.fails_with.match(/^gap open \((\d+) of (\d+)\): (.+)$/) ?? [];
      expect(words, `${g.id}: fails_with starts with "gap open (N of M): "`).toBeTruthy();
      const start = drive.indexOf(`'${g.journey}': journey(`);
      const body = drive.slice(start, drive.indexOf('gap.end();', start));
      expect(body, `${g.id}: "${words}" is written by ${g.journey}`).toContain(words);
      expect(Number(m), `${g.id}: M is the number of gap.want calls in ${g.journey}`).toBe(body.split('gap.want(').length - 1);
      expect(Number(n)).toBeGreaterThanOrEqual(1);
      expect(Number(n)).toBeLessThanOrEqual(Number(m));
    }
  });
});
