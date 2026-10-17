// check:agents-md must fail when a row names a script, file or journey that does not exist. Runs from the repo root
// (it reads package.json and e2e/drive.mjs) on a synthetic AGENTS.md.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dirs = [];

function check(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'agents-md-'));
  dirs.push(dir);
  const file = join(dir, 'AGENTS.md');
  writeFileSync(file, `| Rule | Enforced by | Command |\n| --- | --- | --- |\n${rows.join('\n')}\n`);
  return spawnSync(process.execPath, ['scripts/check-agents-md.mjs', file], { cwd: ROOT, encoding: 'utf8' });
}

afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('check:agents-md', () => {
  it('passes when every enforcer exists', () => {
    const r = check(['| ok | `scripts/check.mjs`, journey `first-visit` | `npm run check`, `npm run journeys -- close-day` |']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('fails on a missing script', () => {
    const r = check(['| x | `scripts/check.mjs` | `npm run check:nothing` |']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('runs `npm run check:nothing`, which is not a package.json script');
  });
  it('fails on a missing file', () => {
    const r = check(['| x | `src/nothing.test.ts`, `storage.ts` | `npm test` |']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('cites `src/nothing.test.ts`, which does not exist');
    expect(r.stderr).toContain('cites `storage.ts`, which does not exist');
  });
  it('fails on a missing file under docs/ or public/, in parentheses or before a colon', () => {
    const r = check(['| x | `docs/nothing.md`, `public/nothing.png` | `(e2e/nothing.mjs)`, `e2e/missing.mjs:` |']);
    expect(r.status).toBe(1);
    for (const p of ['docs/nothing.md', 'public/nothing.png', 'e2e/nothing.mjs', 'e2e/missing.mjs']) expect(r.stderr).toContain(`cites \`${p}\`, which does not exist`);
  });
  it('accepts an existing path in parentheses or before a colon', () => {
    const r = check(['| ok | `(e2e/run.mjs)`, `scripts/check.mjs:` | `npm run check` |']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('fails on an unknown journey in the prose form "the `name` journey"', () => {
    const r = check(['| x | the `no-such-journey` journey, the `first-visit` journey | `npm test` |']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('names journey `no-such-journey`');
    expect(r.stderr).not.toContain('`first-visit`');
  });
  it('fails on an unknown journey, in prose or after npm run journeys --', () => {
    const r = check(['| x | journeys `first-visit`, `no-such-journey` | `npm run journeys -- close-day other-missing` |']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('names journey `no-such-journey`');
    expect(r.stderr).toContain('names journey `other-missing`');
    expect(r.stderr).not.toContain('`first-visit`');
  });
});
