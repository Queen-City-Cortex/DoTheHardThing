// verify:live: read-only checks of a deployed site. GET only; it never POSTs to /api/event, so it adds
// nothing to the anonymous counts. Usage:
//   SITE=https://dothehardthing.app node scripts/verify-live.mjs [--retries N]   (default SITE is the production URL)
// Checks (FAIL exits 1): / is 200 with the root div; when dist/index.html exists, the live page serves the same hashed
// entry script (so this is the build you just made); GET /api/event is 405 (the Worker answers, not the SPA fallback);
// /og-image.png is image/png with the same bytes as public/og-image.png; /sw.js is served (and equals dist/sw.js when
// dist exists). Headers on / are reported (WARN): cache-control and the security headers that are missing.
// --retries N: right after a deploy the edge may still serve the old build; retry the failing round N times, 15 s apart.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const SITE = (process.env.SITE ?? 'https://dothehardthing.app').replace(/\/$/, '');
const ri = process.argv.indexOf('--retries');
const RETRIES = ri > 0 ? Number(process.argv[ri + 1]) || 0 : 0;
const WAIT_MS = 15_000;
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const SECURITY_HEADERS = ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'content-security-policy', 'permissions-policy', 'x-frame-options'];

async function get(path, method = 'GET') {
  const res = await fetch(SITE + path, { method, redirect: 'manual', headers: { 'user-agent': 'verify-live (read-only)', 'cache-control': 'no-cache' } });
  return { res, body: Buffer.from(await res.arrayBuffer()) };
}

async function round() {
  const fails = []; const warns = []; const oks = [];
  const fail = (m) => fails.push(m); const ok = (m) => oks.push(m);

  const home = await get('/');
  const html = home.body.toString('utf8');
  if (home.res.status !== 200) fail(`GET / is ${home.res.status}, want 200`);
  else if (!html.includes('<div id="root">')) fail('GET / is 200 but has no <div id="root">: not the app shell');
  else ok('GET / 200 with <div id="root">');
  const liveEntry = html.match(/assets\/index-[\w-]+\.js/)?.[0];
  if (existsSync('dist/index.html')) {
    const localEntry = readFileSync('dist/index.html', 'utf8').match(/assets\/index-[\w-]+\.js/)?.[0];
    if (!localEntry) fail('dist/index.html has no assets/index-*.js entry script');
    else if (liveEntry !== localEntry) fail(`live entry ${liveEntry ?? '(none)'} != local dist ${localEntry}: the live site is not serving this build (not deployed yet, or a stale edge; retry with --retries 4)`);
    else ok(`live entry ${liveEntry} equals dist/index.html`);
  } else ok(`live entry ${liveEntry ?? '(none)'} (no local dist to compare; run npm run build first to prove which build is live)`);

  const api = await get('/api/event');
  if (api.res.status !== 405) fail(`GET /api/event is ${api.res.status}, want 405 (the Worker rejects GET); a 200 means the SPA fallback answered and the Worker route is missing`);
  else ok('GET /api/event 405 (the Worker answers /api/*)');

  const img = await get('/og-image.png');
  const ctype = img.res.headers.get('content-type') ?? '';
  const want = existsSync('public/og-image.png') ? readFileSync('public/og-image.png') : null;
  if (img.res.status !== 200 || !ctype.startsWith('image/png')) fail(`GET /og-image.png is ${img.res.status} ${ctype}, want 200 image/png`);
  else if (want && !img.body.equals(want)) fail(`og-image.png live ${img.body.length} bytes sha ${sha(img.body)} != public/og-image.png ${want.length} bytes sha ${sha(want)}: a stale deploy or an unregenerated image`);
  else ok(`og-image.png 200 ${ctype}, ${img.body.length} bytes${want ? ', equal to public/og-image.png' : ''}`);

  const sw = await get('/sw.js');
  if (sw.res.status !== 200) fail(`GET /sw.js is ${sw.res.status}, want 200`);
  else if (existsSync('dist/sw.js') && !sw.body.equals(readFileSync('dist/sw.js'))) fail('live sw.js differs from dist/sw.js: the precache list served is not this build\'s');
  else ok(`sw.js 200${existsSync('dist/sw.js') ? ', equal to dist/sw.js' : ''}`);

  const h = home.res.headers;
  const cc = h.get('cache-control');
  warns.push(`/ cache-control: ${cc ?? '(none)'}`);
  const missing = SECURITY_HEADERS.filter((n) => !h.has(n));
  const present = SECURITY_HEADERS.filter((n) => h.has(n)).map((n) => `${n}: ${h.get(n).slice(0, 80)}`);
  for (const p of present) warns.push(`/ has ${p}`);
  if (missing.length) warns.push(`/ is missing ${missing.join(', ')} (add them to the \`/\` rule in public/_headers)`);
  for (const n of ['server', 'cf-ray', 'age', 'etag']) if (h.has(n)) warns.push(`/ ${n}: ${h.get(n)}`);
  return { fails, warns, oks, liveEntry };
}

const t0 = Date.now();
let r;
for (let attempt = 0; ; attempt++) {
  r = await round();
  if (!r.fails.length || attempt >= RETRIES) break;
  console.log(`attempt ${attempt + 1}: ${r.fails.length} failing; waiting ${WAIT_MS / 1000}s (propagation)`);
  await new Promise((res) => setTimeout(res, WAIT_MS));
}
for (const m of r.oks) console.log(`OK    ${m}`);
for (const m of r.warns) console.log(`INFO  ${m}`);
for (const m of r.fails) console.log(`FAIL  ${m}`);
console.log(`verify:live ${r.fails.length ? 'FAIL' : 'OK'} ${SITE} serves ${r.liveEntry ?? '(no entry)'} in ${Date.now() - t0} ms`);
process.exit(r.fails.length ? 1 : 0);
