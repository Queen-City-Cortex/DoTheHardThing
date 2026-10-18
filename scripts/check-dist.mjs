// check:dist: run after `npm run build`. Fails when the built PWA and hosting config disagree with each other:
// a file the page needs is missing from the service worker precache (so it fails offline), the manifest theme_color or
// background_color, or the built CSS's light --paper, differs from the page's light theme-color (index.html owns it),
// public/_headers does not give `/`, `/index.html` and `/sw.js` a no-cache Cache-Control, a path class the app serves
// lacks a security header of POLICY (scripts/headers-policy.mjs) or has another value, or a manifest icon is missing
// from dist. Every failure names the file and the fix.
// Assumes the site is served from the root (vite `base: '/'`): references are matched as /path.
// Usage: node scripts/check-dist.mjs [distDir]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { POLICY, display, headersFor, norm, parseHeaders } from './headers-policy.mjs';

const dist = process.argv[2] ?? 'dist';
const problems = [];
const read = (f) => readFileSync(join(dist, f), 'utf8');
if (!existsSync(join(dist, 'index.html'))) { console.error(`check:dist: ${dist}/index.html not found; run \`npm run build\` first`); process.exit(1); }

const html = read('index.html');
const local = (u) => u.startsWith('/') && !u.startsWith('//');
const strip = (u) => u.replace(/^\//, '').split(/[?#]/)[0];

// 1. Precache: everything the page loads (scripts, styles, icons, manifest, and what the CSS loads) plus every
//    file in dist/assets must be in sw.js, or it fails offline.
const sw = read('sw.js');
const precache = new Set([...sw.matchAll(/\{(?:revision:[^,}]*,)?url:"([^"]+)"/g)].map((m) => m[1]));
if (precache.size === 0) problems.push(`${dist}/sw.js has no precache list; is vite-plugin-pwa still generating it (generateSW)?`);
const needed = new Map(); // file -> why
for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) if (local(m[1])) needed.set(strip(m[1]), 'loaded by index.html');
const assets = existsSync(join(dist, 'assets'))
  ? readdirSync(join(dist, 'assets'), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !e.name.endsWith('.map')).map((e) => join(e.parentPath, e.name).slice(join(dist, 'assets').length + 1))
  : [];
for (const f of assets.filter((f) => f.endsWith('.css'))) {
  for (const m of read(`assets/${f}`).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) if (local(m[1])) needed.set(strip(m[1]), `loaded by assets/${f}`);
}
for (const f of assets) if (!needed.has(`assets/${f}`)) needed.set(`assets/${f}`, 'in dist/assets');
needed.set('index.html', 'the offline navigation fallback');
for (const [f, why] of needed) {
  if (!existsSync(join(dist, f))) { problems.push(`${f} (${why}) does not exist in ${dist}; fix the reference or add the file to public/`); continue; }
  if (!precache.has(f)) {
    const fix = f.startsWith('assets/') ? `add '${f.split('.').pop()}' to workbox.globPatterns in vite.config.ts` : `add '${f}' to includeAssets in vite.config.ts`;
    problems.push(`${f} (${why}) is not in the sw.js precache, so it fails offline: ${fix}`);
  }
}

// 2. Manifest: theme_color and background_color match the page's light theme-color (the paper the page is drawn on, so
//    the installed app's title bar and splash are the page's color), and every icon exists.
const manifest = JSON.parse(read('manifest.webmanifest'));
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))?.slice(1).find((v) => v !== undefined);
const metaColors = [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).filter((t) => attr(t, 'name') === 'theme-color').map((t) => ({ color: (attr(t, 'content') ?? '').toLowerCase(), media: attr(t, 'media') ?? '' }));
const pageColor = (metaColors.find((m) => !m.media) ?? metaColors.find((m) => m.media.includes('light')))?.color;
if (pageColor === undefined) problems.push('index.html has no <meta name="theme-color">: add one (light theme-color) to index.html');
else {
  for (const key of ['theme_color', 'background_color']) {
    const color = String(manifest[key] ?? '(none)').toLowerCase();
    if (color !== pageColor) problems.push(`manifest ${key} ${color} differs from index.html <meta name="theme-color"> ${pageColor}: make manifest.${key} in vite.config.ts equal the light theme-color`);
  }
  // the first --paper in the built CSS is the light one (dark mode overrides it later, inside a media query)
  const paper = assets.filter((f) => f.endsWith('.css')).map((f) => read(`assets/${f}`).match(/--paper:\s*(#[0-9a-fA-F]{3,8})/)?.[1]).find(Boolean)?.toLowerCase();
  if (paper !== pageColor) problems.push(`the built CSS's light --paper is ${paper ?? '(not found)'}, but index.html <meta name="theme-color"> is ${pageColor}: keep --paper in src/index.css and the light theme-color the same color`);
}
for (const icon of manifest.icons ?? []) {
  if (typeof icon.src !== 'string') { problems.push(`a manifest icon has no src: fix manifest.icons in vite.config.ts`); continue; }
  const f = strip(icon.src.startsWith('/') ? icon.src : `/${icon.src}`);
  if (!existsSync(join(dist, f))) problems.push(`manifest icon ${icon.src} (${icon.sizes}${icon.purpose ? ', ' + icon.purpose : ''}) is missing from ${dist}: add it to public/ or fix manifest.icons in vite.config.ts`);
}

// 3. _headers: the app shell must revalidate. Cloudflare matches the request path, and the app is served at `/`,
//    so an /index.html rule never applies to it (measured with wrangler dev: `/` got the default Cache-Control).
//    `/`, `/index.html` and `/sw.js` each need a matching rule whose Cache-Control says no-cache.
const { rules, errors } = parseHeaders(existsSync(join(dist, '_headers')) ? read('_headers') : '');
for (const e of errors) problems.push(`public/_headers ${e}: fix the line (see the parser in scripts/headers-policy.mjs)`);
for (const path of ['/', '/index.html', '/sw.js']) {
  const value = headersFor(rules, path).get('cache-control') ?? '';
  if (!/\bno-cache\b/.test(value) || /\bimmutable\b|\bmax-age=[1-9]/.test(value)) {
    problems.push(`public/_headers gives ${path} \`Cache-Control: ${value || '(nothing)'}\`, not no-cache alone: give ${path} a rule with \`Cache-Control: no-cache\` and no other matching rule that caches it (Cloudflare matches the request path, so an /index.html rule does not apply to \`/\`)`);
  }
}

// 4. _headers: every path class the app serves gets each security header in POLICY (scripts/headers-policy.mjs) with
//    exactly its value: the shell, the service worker, the manifest, a hashed asset, and an unknown path (the SPA
//    fallback serves index.html there, and Cloudflare matches the request path, not the file).
const js = assets.find((f) => f.endsWith('.js'));
const paths = ['/', '/sw.js', '/manifest.webmanifest', js ? `/assets/${js}` : '/assets/index.js', '/nope'];
for (const [name, want] of Object.entries(POLICY)) {
  const wrong = new Map(); // what the path gets -> the paths that get it
  for (const path of paths) {
    const got = headersFor(rules, path).get(name);
    if (norm(got) !== want) { const k = got === undefined ? `no ${display(name)}` : `\`${display(name)}: ${got}\``; wrong.set(k, [...(wrong.get(k) ?? []), path]); }
  }
  for (const [k, ps] of wrong) problems.push(`public/_headers gives ${ps.join(', ')} ${k}, want \`${display(name)}: ${want}\`: give the \`/*\` rule exactly that line, and no other matching rule the same header (POLICY in scripts/headers-policy.mjs)`);
}

if (problems.length) {
  for (const p of problems) console.error(`check:dist FAIL: ${p}`);
  console.error(`check:dist: ${problems.length} problem(s) in ${dist}`);
  process.exit(1);
}
console.log(`check:dist OK: ${precache.size} precache entries cover ${needed.size} needed files; manifest colors match the page; manifest icons present; the app shell is served with no-cache; ${paths.length} path classes get the ${Object.keys(POLICY).length} security headers`);
