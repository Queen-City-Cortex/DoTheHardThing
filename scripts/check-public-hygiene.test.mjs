// check:public-hygiene must flag each kind of leak it exists for, and let the author lines through. Runs the script on
// small synthetic trees (no .git, so it walks the files). This file holds the fixtures, so the script skips it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-public-hygiene.mjs', import.meta.url));
const AUTHORS = {
  'LICENSE': 'MIT License\n\nCopyright (c) 2026 Jeffery Hoffman (Queen City Cortex)\n',
  'README.md': '# App\n\n## License\n\n[MIT](LICENSE) © 2026 Jeffery Hoffman (Queen City Cortex).\n',
  'package.json': '{\n  "name": "app",\n  "author": "Jeffery Hoffman (Queen City Cortex)"\n}\n',
};
const dirs = [];

function scan(files) {
  const dir = mkdtempSync(join(tmpdir(), 'hygiene-'));
  dirs.push(dir);
  for (const [f, text] of Object.entries({ ...AUTHORS, ...files })) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
}

afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('check:public-hygiene', () => {
  it('passes a clean tree whose only owner and company names are the author lines', () => {
    const r = scan({ 'src/app.ts': 'export const one = 1;\n' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('flags the owner name outside the author lines', () => {
    const r = scan({ 'docs/notes.md': 'Jeffery Hoffman asked for this.\nJeff did too.\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/notes.md:1:1  [owner-name] "Jeffery"');
    expect(r.stderr).toContain('docs/notes.md:1:9  [owner-name] "Hoffman"');
    expect(r.stderr).toContain('docs/notes.md:2:1  [owner-name] "Jeff"');
  });
  it('allows the author line in README.md but not another README line', () => {
    const r = scan({ 'README.md': `${AUTHORS['README.md']}\nThanks to Jeffery Hoffman at Queen City Cortex.\n` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('README.md:7:11  [owner-name] "Jeffery"');
    expect(r.stderr).toContain('README.md:7:30  [owner-company] "Queen City Cortex"');
    expect(r.stderr).not.toContain('README.md:5:');
  });
  it('flags an absolute machine path', () => {
    const r = scan({ 'scripts/x.mjs': "const f = '/workspace/notes/transcript.txt';\nconst g = '/home/box/.cache/chrome';\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('scripts/x.mjs:1:12  [abs-path] "/workspace/notes/transcript.txt"');
    expect(r.stderr).toContain('scripts/x.mjs:2:12  [abs-path] "/home/box/.cache/chrome"');
  });
  it('flags a private repo name', () => {
    const r = scan({ 'e2e/README.md': 'Copied from proto-history and git@github.com:Queen-City-Cortex/do-the-hard-thing.git\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[private-repo] "proto-history"');
    expect(r.stderr).toContain('[private-repo] "Queen-City-Cortex/do-the-hard-thing"');
  });
  it('flags a Cloudflare token and account id, but not the secrets expression', () => {
    const r = scan({
      '.env.example': 'CLOUDFLARE_API_TOKEN=Abc123def456ghi789jkl012mno345pq\naccount_id = "0123456789abcdef0123456789abcdef"\n',
      'ci.yml': 'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('.env.example:1:1  [cf-token]');
    expect(r.stderr).toContain('.env.example:2:1  [cf-account-id]');
    expect(r.stderr).not.toContain('ci.yml');
  });
});
