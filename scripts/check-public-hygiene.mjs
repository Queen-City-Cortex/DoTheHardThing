// check:public-hygiene: this repository is public. Fails when a tracked text file carries internal or private language:
// the owner's or company's name outside the author lines, working notes written for agents ("link card A", "the bug"),
// names of the coding agents and tools that worked on it, absolute machine paths, Cloudflare ids or tokens, and the
// names of the private repositories. Every hit prints file:line, the matched text and the fix.
// Usage: node scripts/check-public-hygiene.mjs [dir]   (dir defaults to the repo root; it lists tracked and new, not ignored files with `git ls-files`
// when dir is a git checkout, otherwise it walks the tree, so it also runs on a `git archive` export)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? '.';
// these two hold the patterns and the fixtures that prove them
const SELF = ['scripts/check-public-hygiene.mjs', 'scripts/check-public-hygiene.test.mjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler', 'coverage']);
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp4|webm|pdf|zip|gz)$/i;
const NEUTRAL = 'use neutral wording that a stranger reading the public repo understands';

// The only lines that may name the owner or the company: the copyright line, the README license line, the package.json
// author. Matched per line, so a note added elsewhere in README.md still fails. A new entry needs a reason next to it.
const AUTHOR_LINES = [
  ['LICENSE', /^Copyright \(c\) \d{4} /],
  ['README.md', /^\[MIT\]\(LICENSE\) © \d{4} /],
  ['package.json', /^\s*"author": /],
];
const RULES = [
  { id: 'owner-company', re: /\bQCC\b|Queen City Cortex/g, allow: AUTHOR_LINES,
    fix: 'the company name belongs only in the package.json author, LICENSE and the README license line; use a neutral example (fixtures: "Ask for the raise")' },
  { id: 'owner-name', re: /\bJeff(?:ery)?\b|\bHoffman\b/g, allow: AUTHOR_LINES,
    fix: 'the owner is named only in the package.json author, LICENSE and the README license line; elsewhere write "the owner" or "the maintainer"' },
  { id: 'agent-notes', re: /\blink card [A-Z]\b|\blink card\b|\bthe (?:original |reported )?bug\b|\bthe review(?:'s|er)?\b|\bthe executor\b|\bsubagent\b/gi,
    fix: `this reads like a note to the agents who worked on the repo; say what the code does or why, ${NEUTRAL}` },
  { id: 'agent-names', re: /\b(?:Claude|Codex|Fable|Grok|ChatGPT|Copilot)\b/g,
    fix: 'do not name the coding agents or tools in public files; describe the change, not who made it (keep agent notes out of the repo)' },
  { id: 'abs-path', re: /(?<![\w.])\/(?:workspace|home\/[\w.-]+|Users\/[\w.-]+|root)\/[\w./-]*/g,
    fix: 'absolute paths from one machine do not exist for anyone else; use a path relative to the repo root, or $TMPDIR' },
  { id: 'cf-account-id', re: /\b(?:account_id|CLOUDFLARE_ACCOUNT_ID)\b["']?\s*[:=]\s*["']?[0-9a-f]{32}\b|\b[0-9a-f]{32}\b/g,
    fix: 'looks like a Cloudflare account or zone id (32 hex); keep ids in GitHub secrets (CLOUDFLARE_ACCOUNT_ID), never in a tracked file' },
  { id: 'cf-token', re: /\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|api_token)\b["']?\s*[:=]\s*["']?(?!\$\{\{)[A-Za-z0-9_-]{20,}/g,
    fix: 'an API token in a tracked file is a leaked secret: revoke it in the Cloudflare dashboard, then read it from secrets.CLOUDFLARE_API_TOKEN' },
  { id: 'private-repo', re: /Queen-City-Cortex\/(?:do-the-hard-thing|one-thing)\b|(?<![\w:-])one-thing(?:\.git|\/)(?!v\d)|\bproto-history\b/g,
    fix: 'the private repositories are not public; link the public repo (github.com/Queen-City-Cortex/DoTheHardThing) or drop the reference' },
];

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

const t0 = performance.now();
const files = listFiles(root).filter((f) => !SELF.includes(f) && !BINARY.test(f) && f !== 'package-lock.json'); // the lockfile is generated
const hits = [];
for (const f of files) {
  const p = join(root, f);
  if (!existsSync(p) || statSync(p).isDirectory()) continue;
  const text = readFileSync(p, 'utf8');
  if (text.includes('\0')) continue; // binary
  const lines = text.split('\n');
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (rule.allow?.some(([file, re]) => file === f && re.test(line))) return;
      for (const m of line.matchAll(rule.re)) hits.push({ f, line: i + 1, col: m.index + 1, rule, text: m[0] });
    });
  }
}
const ms = Math.round(performance.now() - t0);
if (hits.length) {
  for (const h of hits) console.error(`${h.f}:${h.line}:${h.col}  [${h.rule.id}] "${h.text}"\n  fix: ${h.rule.fix}`);
  console.error(`check:public-hygiene FAIL: ${hits.length} hit(s) in ${new Set(hits.map((h) => h.f)).size} file(s), ${files.length} files scanned in ${ms} ms`);
  process.exit(1);
}
console.log(`check:public-hygiene OK: ${files.length} files scanned in ${ms} ms, no internal language, machine paths, ids or private repo names`);
