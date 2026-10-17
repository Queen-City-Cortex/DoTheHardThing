// check:text: the wording rules for everything a person reads. Fails on
//   an em or en dash (also written as a \u escape or an HTML entity in src/ and index.html, where it still renders as one),
//   the domain in any form but DoTheHardThing.app (lowercase only in a URL or a markdown code span that is only the hostname),
//   the brand in any casing but Do The Hard Thing.
// Every hit prints file:line:col, the fix and the line. Runs in `npm run lint` and in `npm run check:fast`.
// Usage: node scripts/check-text.mjs [--allowed] [dir]   (--allowed also lists the lowercase domains it let through;
// dir defaults to the repo root; it lists tracked and unignored files with `git ls-files` when dir is a git checkout,
// otherwise it walks the tree, like scripts/check-public-hygiene.mjs)
// The patterns below are written with escapes, so this file passes its own check.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const showAllowed = args.includes('--allowed');
const root = args.find((a) => !a.startsWith('--')) ?? '.';
// what a person reads: the app, the journeys and their maps, the scripts' messages, the docs
const TARGETS = [/^(src|e2e|scripts|docs)\//, /^(README|AGENTS|CONTRIBUTING)\.md$/, /^index\.html$/, /^vite\.config\.ts$/];
const TEXT = /\.(tsx?|m?js|mts|md|html|txt|css|json)$|(^|\/)vdt$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler', 'coverage']);

const DASH = /[\u2013\u2014]/g;
const DASH_ESCAPE = /\\u201[34]|&[mn]dash;|&#(8211|8212|x201[34]);/gi; // in src/ and index.html only
const DOMAIN = /dothehardthing\.app/gi;
const DISPLAY = 'DoTheHardThing.app';
const BRAND = /\bdo\s+the\s+hard\s+thing\b/gi;
const BRAND_FORM = 'Do The Hard Thing';
const FIX = {
  dash: 'use a comma, a period, a colon or "to" instead of an em or en dash',
  domain: `write ${DISPLAY} where people read it; lowercase only in a URL (https://dothehardthing.app) or a markdown code span that is only the hostname`,
  brand: `write the brand as ${BRAND_FORM} (Title Case), or SITE_URL / BRAND from src/copy.ts in code`,
};

// The lowercase domain is allowed in exactly two places:
//  1. a URL: right after "://" or "://www." (links, og:url, VDT_URL=https://...)
//  2. a markdown code span that is only the hostname, with or without www. (Cloudflare routes and zones in the README)
function domainAllowed(line, i, len, file) {
  const before = line.slice(0, i);
  if (/:\/\/(www\.)?$/.test(before)) return 'url';
  if (file.endsWith('.md') && /`(www\.)?$/.test(before) && line[i + len] === '`') return 'hostname code span';
  return null;
}

function listFiles(dir) {
  if (existsSync(join(dir, '.git'))) {
    return execFileSync('git', ['-C', dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  }
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out;
}

const files = listFiles(root).filter((f) => TARGETS.some((re) => re.test(f)) && TEXT.test(f)).sort();
const problems = [];
const allowed = [];
let scanned = 0;
for (const f of files) {
  const p = join(root, f);
  if (!existsSync(p) || statSync(p).isDirectory()) continue;
  scanned++;
  const escapes = f.startsWith('src/') || f === 'index.html';
  readFileSync(p, 'utf8').split('\n').forEach((line, n) => {
    const at = (m, rule) => problems.push(`${f}:${n + 1}:${m.index + 1}  ${rule}: ${FIX[rule]}\n  ${line.trim().slice(0, 160)}`);
    for (const m of line.matchAll(DASH)) at(m, 'dash');
    if (escapes) for (const m of line.matchAll(DASH_ESCAPE)) at(m, 'dash');
    for (const m of line.matchAll(DOMAIN)) {
      if (m[0] === DISPLAY) continue;
      const why = m[0] === m[0].toLowerCase() && domainAllowed(line, m.index, m[0].length, f);
      if (why) allowed.push(`${f}:${n + 1} (${why})`); else at(m, 'domain');
    }
    for (const m of line.matchAll(BRAND)) if (m[0] !== BRAND_FORM) at(m, 'brand');
  });
}
if (showAllowed) console.log(`allowed lowercase domain (${allowed.length}):\n  ${allowed.join('\n  ')}`);
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`check:text FAIL: ${problems.length} problem(s), ${scanned} files scanned`);
  process.exit(1);
}
console.log(`check:text OK: ${scanned} files scanned, no dashes, the domain shown as ${DISPLAY}, the brand as ${BRAND_FORM}`);
