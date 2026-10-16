// check:dist must fail on each real defect it exists for, and pass on a good dist. Runs against a tiny synthetic dist.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./check-dist.mjs', import.meta.url).pathname;
const HEADERS = '/\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
let dir;

function build({ precache = ['assets/app.js', 'assets/app.css', 'assets/font.woff2', 'index.html'], headers = HEADERS, themeColor = '#f4f3ef', icon = true } = {}) {
  dir = mkdtempSync(join(tmpdir(), 'check-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<html><head><meta name="theme-color" content="#f4f3ef"><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></head><body></body></html>');
  writeFileSync(join(dir, 'assets/app.js'), '');
  writeFileSync(join(dir, 'assets/app.css'), '@font-face{src:url(/assets/font.woff2)}');
  writeFileSync(join(dir, 'assets/font.woff2'), '');
  if (icon) writeFileSync(join(dir, 'pwa-192.png'), '');
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ theme_color: themeColor, icons: [{ src: 'pwa-192.png', sizes: '192x192' }] }));
  writeFileSync(join(dir, 'sw.js'), `precacheAndRoute([${precache.map((u) => `{url:"${u}",revision:null}`).join(',')}])`);
  writeFileSync(join(dir, '_headers'), headers);
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
}

afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('check:dist', () => {
  it('passes on a good dist', () => {
    const r = build();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('fails when a font the CSS loads is not precached (PF-1)', () => {
    const r = build({ precache: ['assets/app.js', 'assets/app.css', 'index.html'] });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("assets/font.woff2 (loaded by assets/app.css) is not in the sw.js precache");
    expect(r.stderr).toContain("add 'woff2' to workbox.globPatterns in vite.config.ts");
  });
  it('fails when `/` has no no-cache rule, even if /index.html has one (PF-1)', () => {
    const r = build({ headers: '/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('public/_headers gives / no `Cache-Control: no-cache`');
  });
  it('fails when the rule for `/` has a different Cache-Control value', () => {
    const r = build({ headers: HEADERS.replace('/\n  Cache-Control: no-cache', '/\n  Cache-Control: public, max-age=31536000') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('gives / no `Cache-Control: no-cache`');
  });
  it('fails when a manifest icon is missing from dist', () => {
    const r = build({ icon: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('manifest icon pwa-192.png');
  });
  it('fails when theme_color differs from the page, except the parked owner decision', () => {
    expect(build({ themeColor: '#123456' }).status).toBe(1);
    const parked = build({ themeColor: '#1f2329' });
    expect(parked.status).toBe(0);
    expect(parked.stdout).toContain('THEME_COLOR_PENDING_OWNER_DECISION');
  });
});
