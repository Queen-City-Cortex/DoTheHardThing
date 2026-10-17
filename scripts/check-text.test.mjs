// check-text.mjs on small fixture trees. The fixtures are built from escapes and pieces, so this file passes the check too.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./check-text.mjs', import.meta.url));
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const EM = '\u2014';
const EN = '\u2013';
const domain = ['dothehardthing', 'app'].join('.');
const brand = (s) => s.split('_').join(' '); // brand('do_the_hard_thing')

/** Write the files into a fresh tree (not a git checkout, so the script walks it) and run the check there. */
function run(files, ...flags) {
  const dir = mkdtempSync(join(tmpdir(), 'check-text-'));
  dirs.push(dir);
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return spawnSync(process.execPath, [script, ...flags, dir], { encoding: 'utf8' });
}

describe('check:text', () => {
  it('passes clean text, URLs, hostname code spans and the display forms', () => {
    const r = run({
      'README.md': `Open https://${domain} or https://www.${domain}. Route \`${domain}\` and \`www.${domain}\`. Shown as DoTheHardThing.app, named Do The Hard Thing.\n`,
      'src/a.ts': `export const url = 'https://${domain}';\n`,
      'index.html': `<meta property="og:url" content="https://${domain}/">\n`,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('check:text OK: 3 files scanned');
  });
  it('fails an em or en dash with file:line:col and the fix', () => {
    const r = run({ 'docs/a.md': `ok\nfast ${EM} calm\n`, 'e2e/b.mjs': `// 320${EN}430\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/a.md:2:6  dash: use a comma, a period, a colon or "to" instead of an em or en dash');
    expect(r.stderr).toContain('e2e/b.mjs:1:7  dash:');
    expect(r.stderr).toContain('check:text FAIL: 2 problem(s)');
  });
  it('fails a dash written as an escape or entity in src and index.html, not elsewhere', () => {
    const r = run({ 'src/a.tsx': "export const s = 'a \\u2014 b';\n", 'index.html': '<p>a &mdash; b &#8211; c</p>\n', 'scripts/c.mjs': "const re = /\\u2014/;\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/a.tsx:1:');
    expect(r.stderr).toContain('index.html:1:6  dash');
    expect(r.stderr).toContain('index.html:1:16  dash');
    expect(r.stderr).not.toContain('scripts/c.mjs');
  });
  it('fails the domain in prose, in a code span with more than the hostname, and in any other casing', () => {
    const r = run({ 'README.md': `Visit ${domain} today.\nRun \`curl ${domain}\`.\nAlso ${'Dothehardthing'}.app.\n`, 'src/a.ts': `export const s = '${domain}';\n` });
    expect(r.status).toBe(1);
    for (const at of ['README.md:1:7  domain: write DoTheHardThing.app', 'README.md:2:11  domain', 'README.md:3:6  domain', 'src/a.ts:1:19  domain']) expect(r.stderr).toContain(at);
    expect(r.stderr).toContain('check:text FAIL: 4 problem(s)');
  });
  it('fails the brand in any casing but Title Case, also across a line wrap in spacing', () => {
    const r = run({ 'docs/a.md': `${brand('Do_the_hard_thing')}\n${brand('DO_THE_HARD_THING')}\nhelps you ${brand('do_the_hard_thing')}\nDo  The Hard Thing\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/a.md:1:1  brand: write the brand as Do The Hard Thing (Title Case)');
    expect(r.stderr).toContain('check:text FAIL: 4 problem(s)');
  });
  it('scans only what a person reads: src, e2e, scripts, docs, the top-level docs, index.html and vite.config.ts', () => {
    const r = run({ 'public/a.txt': EM, 'worker/a.ts': EM, 'notes.md': EM, 'vite.config.ts': EM, 'AGENTS.md': 'ok', 'CONTRIBUTING.md': 'ok', 'e2e/vdt': 'ok' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('vite.config.ts:1:1');
    expect(r.stderr).toContain('check:text FAIL: 1 problem(s), 4 files scanned');
  });
  it('--allowed lists the lowercase domains it let through', () => {
    const r = run({ 'README.md': `https://${domain} and \`${domain}\`\n` }, '--allowed');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('allowed lowercase domain (2):\n  README.md:1 (url)\n  README.md:1 (hostname code span)');
  });
  it('passes on this repo', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
    expect(r.status, r.stderr).toBe(0);
  });
});
