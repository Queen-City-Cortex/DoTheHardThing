// verify:live: read-only checks of a deployed site. GET only; it never POSTs to /api/event, so it adds
// nothing to the anonymous counts. Usage:
//   SITE=https://dothehardthing.app node scripts/verify-live.mjs [--retries N] [--post-deploy] [--www | --require-www]   (default SITE is the production URL)
// Checks (FAIL exits 1): / is 200 with the root div; when dist/index.html exists, the live page serves the same hashed
// entry script (so this is the build you just made); GET /api/event is 405 (the Worker answers, not the SPA fallback);
// /og-image.png is image/png with the same bytes as public/og-image.png; /sw.js is served (and equals dist/sw.js when
// dist exists). INFO lines report the headers left out on purpose (LEFT_OUT in scripts/headers-policy.mjs).
// Checks of this build's files (the manifest; robots.txt, which must be 200 text/plain with the bytes of dist/robots.txt,
// or public/robots.txt without a dist; the headers on /, which must equal what dist/_headers gives `/`, or
// public/_headers without a dist, content-type aside, compared per name with whitespace collapsed) are strict only with
// --post-deploy ("I just deployed this build; live must now serve what dist says"): then a mismatch is a FAIL. Without
// it a mismatch prints PENDING, which never fails the run on its own, so the checks can run against the current live
// site before a deploy. The entry script cannot tell: a change to _headers, the manifest or robots.txt alone leaves it the same.
// --www (opt in; CI does not pass it): GET https://www.<SITE host> `/` and `/?x=1` without following redirects and want a
// 301 to SITE plus the same path and query (docs/www-redirect.md). Only when SITE is the production apex; another SITE
// skips it with a note. The www origin can be overridden with WWW_SITE (the tests point it at a local server). A www that
// still serves the app (no redirect rule yet) is PENDING, which never fails the run; --require-www makes it a FAIL. A
// redirect to the wrong place, or no answer, is a FAIL either way.
// --retries N: right after a deploy the edge may still serve the old build; retry the failing round N times, 15 s apart.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { LEFT_OUT, display, headersFor, norm, parseHeaders } from './headers-policy.mjs';
import { SITE_URL } from '../src/copy.ts'; // Node 22.18+ strips the types, so this still runs as plain `node scripts/verify-live.mjs`

const SITE = (process.env.SITE ?? SITE_URL).replace(/\/$/, '');
const ri = process.argv.indexOf('--retries');
const RETRIES = ri > 0 ? Number(process.argv[ri + 1]) || 0 : 0;
const WAIT_MS = 15_000;
const POST_DEPLOY = process.argv.includes('--post-deploy');
const REQUIRE_WWW = process.argv.includes('--require-www');
const WWW = REQUIRE_WWW || process.argv.includes('--www');
const APEX = new URL(SITE_URL).host;
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function get(path, origin = SITE) { // GET only: no method parameter, so no call can POST
  const res = await fetch(origin + path, { redirect: 'manual', headers: { 'user-agent': 'verify-live (read-only)', 'cache-control': 'no-cache' } });
  return { res, body: Buffer.from(await res.arrayBuffer()) };
}

async function round() {
  const fails = []; const warns = []; const oks = []; const pendings = [];
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

  // A check of this build's files: a mismatch is a FAIL with --post-deploy, PENDING without it
  const ofBuild = (what, mismatch, okMsg) => {
    if (!mismatch) ok(okMsg);
    else if (POST_DEPLOY) fail(mismatch);
    else pendings.push(`${what}: ${mismatch}; run with --post-deploy after the deploy`);
  };

  const mf = await get('/manifest.webmanifest');
  const wantMf = existsSync('dist/manifest.webmanifest') ? readFileSync('dist/manifest.webmanifest') : null;
  const themeOf = (buf) => { try { return JSON.parse(buf.toString('utf8')).theme_color; } catch { return '(not JSON)'; } };
  ofBuild('manifest.webmanifest',
    !wantMf ? 'no dist/manifest.webmanifest to compare with (run npm run build first)'
      : mf.res.status !== 200 ? `GET /manifest.webmanifest is ${mf.res.status}, want 200`
        : !mf.body.equals(wantMf) ? `live manifest.webmanifest (theme_color ${themeOf(mf.body)}, sha ${sha(mf.body)}) != dist/manifest.webmanifest (theme_color ${themeOf(wantMf)}, sha ${sha(wantMf)}): a stale deploy` : null,
    'manifest.webmanifest 200, equal to dist/manifest.webmanifest');

  // robots.txt is a static file: before it was deployed the SPA fallback answered it with the app HTML
  const rb = await get('/robots.txt');
  const robotsFile = ['dist/robots.txt', 'public/robots.txt'].find((f) => existsSync(f));
  const wantRb = robotsFile ? readFileSync(robotsFile) : null;
  const rbType = rb.res.headers.get('content-type') ?? '(no content-type)';
  ofBuild('robots.txt',
    !wantRb ? 'no dist/robots.txt or public/robots.txt to compare with'
      : rb.res.status !== 200 || !rbType.startsWith('text/plain') ? `GET /robots.txt is ${rb.res.status} ${rbType}, want 200 text/plain${rbType.startsWith('text/html') ? ' (the SPA fallback answered: robots.txt is not deployed)' : ''}`
        : !rb.body.equals(wantRb) ? `live robots.txt (${rb.body.length} bytes, sha ${sha(rb.body)}) != ${robotsFile} (${wantRb.length} bytes, sha ${sha(wantRb)}): a stale deploy` : null,
    `robots.txt 200 ${rbType}, equal to ${robotsFile}`);

  // the edge may add headers of its own (server, cf-ray, ...): only the ones _headers gives `/` are compared
  const h = home.res.headers;
  const headersFile = ['dist/_headers', 'public/_headers'].find((f) => existsSync(f));
  const wantH = headersFile ? [...headersFor(parseHeaders(readFileSync(headersFile, 'utf8')).rules, '/')].filter(([n]) => n !== 'content-type') : [];
  const diff = wantH.filter(([n, v]) => norm(h.get(n)) !== norm(v)).map(([n, v]) => `${display(n)}: ${h.get(n) ?? '(none)'}, want ${v}`);
  ofBuild('headers on /',
    !headersFile ? 'no dist/_headers or public/_headers to compare with'
      : diff.length ? `/ does not get what ${headersFile} gives it: ${diff.join('; ')}` : null,
    `/ gets the ${wantH.length} headers ${headersFile} gives it (${wantH.map(([n]) => display(n)).join(', ')})`);
  for (const [n, why] of Object.entries(LEFT_OUT)) warns.push(h.has(n) ? `/ has ${n}: ${h.get(n).slice(0, 80)} (not from _headers)` : `/ has no ${n}, left out on purpose: ${why} (docs/architecture.md, Hosting)`);
  for (const n of ['server', 'cf-ray', 'age', 'etag']) if (h.has(n)) warns.push(`/ ${n}: ${h.get(n)}`);
  if (WWW) {
    const site = new URL(SITE);
    const www = process.env.WWW_SITE?.replace(/\/$/, '') ?? (site.host === APEX ? `https://www.${APEX}` : null);
    if (!www) warns.push(`www check skipped: SITE host ${site.host} is not the production apex ${APEX} (set WWW_SITE to name a www origin)`);
    else {
      for (const path of ['/', '/?x=1']) {
        const want = SITE + path;
        let r;
        try { r = (await get(path, www)).res; } catch (e) { fail(`GET ${www}${path} failed (${e.cause?.code ?? e.message}): want 301 to ${want}`); continue; }
        const loc = r.headers.get('location');
        if (r.status === 301 && loc === want) ok(`${www}${path} 301 to ${want}`);
        else if (r.status >= 300 && r.status < 400) fail(`${www}${path} is ${r.status} to ${loc ?? '(no location)'}, want 301 to ${want}: fix the redirect rule (docs/www-redirect.md)`);
        else (REQUIRE_WWW ? fail : (m) => pendings.push(m))(`www redirect: not created yet (${www}${path} answers ${r.status}, want 301 to ${want}; see docs/www-redirect.md)`);
      }
    }
  }
  return { fails, warns, oks, pendings, liveEntry };
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
for (const m of r.pendings) console.log(`PENDING ${m}`);
for (const m of r.warns) console.log(`INFO  ${m}`);
for (const m of r.fails) console.log(`FAIL  ${m}`);
const pending = r.pendings.length ? ` (${r.pendings.length} pending)` : '';
console.log(`verify:live ${r.fails.length ? 'FAIL' : 'OK'} ${SITE} serves ${r.liveEntry ?? '(no entry)'}${pending} in ${Date.now() - t0} ms`);
process.exit(r.fails.length ? 1 : 0);
