// check-method-quotes.mjs against a synthetic transcript: the real one is not in the repo.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { RULES } from '../src/method.ts';

const script = fileURLToPath(new URL('./check-method-quotes.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'check-quotes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Run the script with these arguments, ignoring any FERRISS_TRANSCRIPT or TRANSCRIPT set in the caller's environment. */
function run(args, extra = {}) {
  const env = { ...process.env };
  delete env.FERRISS_TRANSCRIPT;
  delete env.TRANSCRIPT;
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...env, ...extra } });
}
/** A transcript file with one line per quoted rule, plus an unrelated line; `edit` may change a rule's line. */
function transcript(name, edit = (id, line) => line) {
  const lines = ['[0:00] Some words before the rules.'];
  for (const [id, r] of Object.entries(RULES)) if (r.quote) lines.push(edit(id, `[${r.ref}] words   before ${r.quote} and after`));
  const p = join(dir, name);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

describe('check:quotes', () => {
  it('passes when every quote is on its ref line (whitespace normalized)', () => {
    const r = run([transcript('ok.txt', (_, line) => line.replace(/ /g, '  '))]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(`check:quotes OK: ${Object.values(RULES).filter((x) => x.quote).length} quotes`);
  });
  it('reads the path from FERRISS_TRANSCRIPT, and from TRANSCRIPT, its older name', () => {
    for (const name of ['FERRISS_TRANSCRIPT', 'TRANSCRIPT']) {
      const p = transcript(`env-${name}.txt`);
      const r = run([], { [name]: p });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain(`check:quotes OK: ${Object.values(RULES).filter((x) => x.quote).length} quotes found verbatim on their transcript lines in ${p}`);
    }
  });
  it('takes the argument first, then FERRISS_TRANSCRIPT, then TRANSCRIPT', () => {
    const good = transcript('good.txt');
    const bad = transcript('bad.txt', (id, line) => (id === 'three-to-five-items' ? '[4:36] So write down those three to seven things.' : line));
    expect(run([good], { FERRISS_TRANSCRIPT: bad, TRANSCRIPT: bad }).status).toBe(0);
    expect(run([], { FERRISS_TRANSCRIPT: good, TRANSCRIPT: bad }).status).toBe(0);
    expect(run([], { FERRISS_TRANSCRIPT: '', TRANSCRIPT: good }).status).toBe(0); // empty counts as unset
    expect(run([], { FERRISS_TRANSCRIPT: bad, TRANSCRIPT: good }).status).toBe(1);
  });
  it('fails with the rule id, ref and the actual line when a quote drifts', () => {
    const p = transcript('drift.txt', (id, line) => (id === 'three-to-five-items' ? '[4:36] So write down those three to seven things.' : line));
    const r = run([p]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('check:quotes FAIL: three-to-five-items: the quote is not on the [4:36] line');
    expect(r.stderr).toContain('line:  [4:36] So write down those three to seven things.');
  });
  it('fails when no line has the ref', () => {
    const r = run([transcript('noref.txt', (id, line) => (id === 'block-two-to-three-hours' ? '' : line))]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('block-two-to-three-hours: no transcript line starts with [5:17]');
  });
  it('skips with exit 0 when there is no transcript', () => {
    for (const r of [run([]), run([join(dir, 'missing.txt')])]) {
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('check:quotes skipped: no transcript (pass a path or set FERRISS_TRANSCRIPT)');
    }
  });
});
