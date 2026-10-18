// check:dist must fail on each real defect it exists for, and pass on a good dist. Runs against a tiny synthetic dist.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-dist.mjs', import.meta.url));
const HEADERS = '/\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const dirs = [];

function build({ precache = ['assets/app.js', 'assets/app.css', 'assets/font.woff2', 'index.html'], headers = HEADERS, themeColor = '#f4f3ef', backgroundColor = '#f4f3ef', css = '@font-face{src:url(/assets/font.woff2)}:root{--paper:#f4f3ef}@media (prefers-color-scheme:dark){:root{--paper:#15181d}}', icon = true, meta = '<meta name="theme-color" content="#f4f3ef">', extraLink = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-dist-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), `<html><head>${meta}${extraLink}<script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></head><body></body></html>`);
  writeFileSync(join(dir, 'assets/app.js'), '');
  writeFileSync(join(dir, 'assets/app.css'), css);
  writeFileSync(join(dir, 'assets/font.woff2'), '');
  if (icon) writeFileSync(join(dir, 'pwa-192.png'), '');
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ theme_color: themeColor, background_color: backgroundColor, icons: [{ src: 'pwa-192.png', sizes: '192x192' }] }));
  writeFileSync(join(dir, 'sw.js'), `precacheAndRoute([${precache.map((u) => `{url:"${u}",revision:null}`).join(',')}])`);
  writeFileSync(join(dir, '_headers'), headers);
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
}

afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('check:dist', () => {
  it('passes on a good dist', () => {
    const r = build();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('fails when a font the CSS loads is not precached', () => {
    const r = build({ precache: ['assets/app.js', 'assets/app.css', 'index.html'] });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("assets/font.woff2 (loaded by assets/app.css) is not in the sw.js precache");
    expect(r.stderr).toContain("add 'woff2' to workbox.globPatterns in vite.config.ts");
  });
  it('fails when `/` has no no-cache rule, even if /index.html has one', () => {
    const r = build({ headers: '/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('public/_headers gives / `Cache-Control: (nothing)`, not no-cache alone');
  });
  it('fails when the rule for `/` has a different Cache-Control value', () => {
    const r = build({ headers: HEADERS.replace('/\n  Cache-Control: no-cache', '/\n  Cache-Control: public, max-age=31536000') });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('gives / `Cache-Control: public, max-age=31536000`, not no-cache alone');
  });
  it('fails when a manifest icon is missing from dist', () => {
    const r = build({ icon: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('manifest icon pwa-192.png');
  });
  it('fails when theme_color differs from the page, the old charcoal included (no exception)', () => {
    expect(build({ themeColor: '#123456' }).status).toBe(1);
    const old = build({ themeColor: '#1f2329' });
    expect(old.status).toBe(1);
    expect(old.stderr).toContain('manifest theme_color #1f2329 differs from index.html <meta name="theme-color"> #f4f3ef: make manifest.theme_color in vite.config.ts equal the light theme-color');
    expect(old.stdout).toBe('');
  });
  it('fails when background_color differs from the page', () => {
    const r = build({ backgroundColor: '#ffffff' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('manifest background_color #ffffff differs');
  });
  it('fails when the light --paper in the CSS differs from the page, and when there is none', () => {
    const r = build({ css: '@font-face{src:url(/assets/font.woff2)}:root{--paper:#ffffff}' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the built CSS's light --paper is #ffffff");
    expect(build({ css: '@font-face{src:url(/assets/font.woff2)}' }).stderr).toContain("light --paper is (not found)");
  });
});

describe('check:dist, more cases', () => {
  it('fails when the page has no theme-color meta tag', () => {
    const r = build({ meta: '', themeColor: '#1f2329' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('index.html has no <meta name="theme-color">');
  });
  it('reads a theme-color meta with single quotes and content first', () => {
    expect(build({ meta: "<meta content='#f4f3ef' name='theme-color'>" }).status).toBe(0);
  });
  it('tells a file outside assets/ to go in includeAssets, not the glob', () => {
    const r = build({ precache: ['assets/app.js', 'assets/app.css', 'assets/font.woff2', 'index.html'], extraLink: '<link rel="icon" href="/favicon.svg">' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("favicon.svg");
    expect(r.stderr).not.toContain("add 'svg' to workbox.globPatterns");
  });
  it('fails when another rule makes the shell cacheable (Cloudflare joins matching rules)', () => {
    const r = build({ headers: HEADERS + '/*\n  Cache-Control: public, max-age=31536000, immutable\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not no-cache alone');
  });
});
