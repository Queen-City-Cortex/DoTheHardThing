// check:dist: run after `npm run build`. Fails when the built PWA and hosting config disagree with each other:
// a file the page needs is missing from the service worker precache (so it fails offline), the manifest theme_color
// differs from the page's theme-color, public/_headers does not give `/`, `/index.html` and `/sw.js` a no-cache
// Cache-Control, or a manifest icon is missing from dist. Every failure names the file and the fix.
// Assumes the site is served from the root (vite `base: '/'`): references are matched as /path.
// Usage: node scripts/check-dist.mjs [distDir]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const problems = [];
const notes = [];
const read = (f) => readFileSync(join(dist, f), 'utf8');
if (!existsSync(join(dist, 'index.html'))) { console.error(`check:dist: ${dist}/index.html not found; run \`npm run build\` first`); process.exit(1); }

// Owner decision pending: the manifest theme_color is the icon's dark color (#1f2329) and the page's light theme-color is
// the paper color (#f4f3ef). Current behavior is kept, and reported as a note, until the owner picks one; then delete this.
const THEME_COLOR_PENDING_OWNER_DECISION = '#1f2329';

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

// 2. Manifest: theme_color matches the page's theme-color, and every icon exists.
const manifest = JSON.parse(read('manifest.webmanifest'));
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))?.slice(1).find((v) => v !== undefined);
const metaColors = [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).filter((t) => attr(t, 'name') === 'theme-color').map((t) => ({ color: (attr(t, 'content') ?? '').toLowerCase(), media: attr(t, 'media') ?? '' }));
const pageColor = (metaColors.find((m) => !m.media) ?? metaColors.find((m) => m.media.includes('light')))?.color;
const manifestColor = String(manifest.theme_color ?? '').toLowerCase();
if (pageColor === undefined) problems.push('index.html has no <meta name="theme-color">: add one (light theme-color) to index.html');
else if (manifestColor !== pageColor) {
  const msg = `manifest theme_color ${manifestColor} differs from index.html <meta name="theme-color"> ${pageColor}: make manifest.theme_color in vite.config.ts equal the light theme-color`;
  if (manifestColor === THEME_COLOR_PENDING_OWNER_DECISION) notes.push(`${msg} (allowed for now: THEME_COLOR_PENDING_OWNER_DECISION)`);
  else problems.push(msg);
}
for (const icon of manifest.icons ?? []) {
  if (typeof icon.src !== 'string') { problems.push(`a manifest icon has no src: fix manifest.icons in vite.config.ts`); continue; }
  const f = strip(icon.src.startsWith('/') ? icon.src : `/${icon.src}`);
  if (!existsSync(join(dist, f))) problems.push(`manifest icon ${icon.src} (${icon.sizes}${icon.purpose ? ', ' + icon.purpose : ''}) is missing from ${dist}: add it to public/ or fix manifest.icons in vite.config.ts`);
}

// 3. _headers: the app shell must revalidate. Cloudflare matches the request path, and the app is served at `/`,
//    so an /index.html rule never applies to it (measured with wrangler dev: `/` got the default Cache-Control).
//    `/`, `/index.html` and `/sw.js` each need a matching rule whose Cache-Control says no-cache.
const headersFile = existsSync(join(dist, '_headers')) ? read('_headers') : '';
const rules = []; // { re, headers: Map(lowercase name -> value) }
for (const line of headersFile.split('\n')) {
  if (line.startsWith('/')) rules.push({ re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+') + '$'), headers: new Map() });
  else if (/^\s+[\w-]+:/.test(line) && rules.length) {
    const i = line.indexOf(':');
    rules.at(-1).headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
}
// Cloudflare applies every matching rule and joins duplicate header values with a comma
const cacheControl = (path) => rules.filter((r) => r.re.test(path)).map((r) => r.headers.get('cache-control')).filter(Boolean).join(', ');
for (const path of ['/', '/index.html', '/sw.js']) {
  const value = cacheControl(path);
  if (!/\bno-cache\b/.test(value) || /\bimmutable\b|\bmax-age=[1-9]/.test(value)) {
    problems.push(`public/_headers gives ${path} \`Cache-Control: ${value || '(nothing)'}\`, not no-cache alone: give ${path} a rule with \`Cache-Control: no-cache\` and no other matching rule that caches it (Cloudflare matches the request path, so an /index.html rule does not apply to \`/\`)`);
  }
}

for (const n of notes) console.log(`check:dist note: ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`check:dist FAIL: ${p}`);
  console.error(`check:dist: ${problems.length} problem(s) in ${dist}`);
  process.exit(1);
}
console.log(`check:dist OK: ${precache.size} precache entries cover ${needed.size} needed files; manifest icons present; the app shell is served with no-cache`);
