// check:quotes: every rule in src/method.ts that quotes the talk quotes it verbatim, on the transcript line for its ref.
// Local only: the transcript is not in the repo, so this is not part of `npm run check`; without one it skips (exit 0).
// A transcript line starts with its timestamp in brackets, e.g. `[4:36] ... So write down those three to five things.`
// Whitespace is normalized on both sides before comparing.
// Usage: npm run check:quotes -- path/to/transcript.txt   (or set TRANSCRIPT)
import { existsSync, readFileSync } from 'node:fs';

const path = process.argv[2] ?? process.env.TRANSCRIPT;
if (!path || !existsSync(path)) {
  console.log('check:quotes skipped: no transcript (pass a path or set TRANSCRIPT)');
  process.exit(0);
}
// method.ts imports nothing and uses only erasable syntax, so Node runs it with its types stripped
const { RULES } = await import('../src/method.ts');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const lines = readFileSync(path, 'utf8').split(/\r?\n/);
const problems = [];
let checked = 0;
for (const [id, rule] of Object.entries(RULES)) {
  if (rule.quote == null) continue;
  checked++;
  const line = lines.find((l) => l.startsWith(`[${rule.ref}]`));
  if (line === undefined) problems.push(`${id}: no transcript line starts with [${rule.ref}]; fix the ref in src/method.ts`);
  else if (!norm(line).includes(norm(rule.quote))) {
    problems.push(`${id}: the quote is not on the [${rule.ref}] line; copy it verbatim into src/method.ts or fix the ref\n  quote: ${rule.quote}\n  line:  ${line}`);
  }
}
if (problems.length) {
  for (const p of problems) console.error(`check:quotes FAIL: ${p}`);
  process.exit(1);
}
console.log(`check:quotes OK: ${checked} quotes found verbatim on their transcript lines in ${path}`);
