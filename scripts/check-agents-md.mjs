// check:agents-md: every row in AGENTS.md must name an enforcer that exists. Fails when a cited file is missing,
// an `npm run <script>` is not in package.json, or a named journey is not in e2e/drive.mjs. It checks existence only,
// not that the enforcer really enforces the rule. Run from the repo root.
// Usage: node scripts/check-agents-md.mjs [file]   (default AGENTS.md; paths in it are relative to the repo root)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'AGENTS.md';
const md = readFileSync(file, 'utf8');
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const journeys = new Set(execFileSync(process.execPath, ['e2e/drive.mjs', '--list'], { encoding: 'utf8' }).trim().split('\n'));
const problems = new Set();
const codes = [...md.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const journey = (n) => { if (!journeys.has(n)) problems.add(`${file} names journey \`${n}\`, which is not in e2e/drive.mjs: fix the row`); };
for (const c of codes) {
  for (const f of c.match(/(?:^|\s)((?:src|e2e|scripts|worker|\.github)\/[\w./*-]+|[\w.-]+\.(?:md|json|jsonc|js|mjs|ts))(?=\s|$)/g) ?? []) {
    const p = f.trim();
    if (!p.includes('*') && !existsSync(p)) problems.add(`${file} cites \`${p}\`, which does not exist: fix the path or drop the row`);
  }
  for (const m of c.matchAll(/npm run ([\w:-]+)/g)) if (!scripts[m[1]]) problems.add(`${file} runs \`npm run ${m[1]}\`, which is not a package.json script: add it or fix the row`);
  const j = c.match(/npm run journeys -- (.+)$/);
  if (j) for (const n of j[1].split(/\s+/)) journey(n);
}
for (const m of md.matchAll(/journeys? ((?:`[\w-]+`(?:, | and )?)+)/g)) for (const n of m[1].match(/[\w-]+/g)) journey(n);
if (problems.size) { for (const p of problems) console.error(`check:agents-md FAIL: ${p}`); process.exit(1); }
console.log(`check:agents-md OK: ${codes.length} code spans, every cited file, script and journey exists`);
