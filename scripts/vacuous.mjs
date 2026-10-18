// Lists journey assertions in e2e/drive.mjs that cannot fail on today's tree, by pattern. A lower bound, not an
// inventory: it knows only the shapes below (one rule matches a literal from today's drive.mjs), so a new kind of
// assertion that cannot fail goes unseen. scripts/mutate.mjs is the check that measures what the journeys catch.
//   swallowed    `.click().catch(() => {})`: a missing control is silently skipped
//   conditional  `if (await x.count()) await x.click()`: the step passes whether or not the control exists
//   absent-text  `getByText('<literal>')...toHaveCount(0)` where the literal appears nowhere in src/ (a reintroduction
//                guard, not a behavior check; text built from pieces in src/ shows up here too)
//   any-text     `toHaveText(/./)`: satisfied by any non-empty text
//   input-text   `getByText` used to prove an input's typed value is gone (getByText never reads input values)
// Usage: node scripts/vacuous.mjs   (one line per hit and a count per kind; always exits 0, it reports, it does not gate)
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(REPO, 'e2e/drive.mjs'), 'utf8').split('\n');
const src = fs.readdirSync(path.join(REPO, 'src')).filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('.test.'))
  .map((f) => fs.readFileSync(path.join(REPO, 'src', f), 'utf8')).join('\n');
const hits = [];
const add = (kind, i, text) => hits.push({ kind, line: i + 1, text: text.trim().slice(0, 150) });
for (const [i, l] of lines.entries()) {
  if (/\.click\(\)\.catch\(\(\) => \{\}\)/.test(l)) add('swallowed', i, l);
  if (/if \(await \w+\.count\(\)\) await \w+\.click\(\)/.test(l)) add('conditional', i, l);
  if (/toHaveText\(\/\.\/\)/.test(l)) add('any-text', i, l);
  if (/getByText\('typed but not added'\)/.test(l)) add('input-text', i, l);
  for (const m of l.matchAll(/getByText\((['"])((?:(?!\1).)+)\1(?:, \{[^}]*\})?\)\)\.toHaveCount\(0\)/g)) {
    const lit = m[2].replace(/\\'/g, "'");
    if (!src.includes(lit) && !src.includes(lit.replace(/'/g, "\\'"))) add('absent-text', i, `"${lit}"`);
  }
}
for (const h of hits) console.log(`${h.kind.padEnd(12)} drive.mjs:${h.line}  ${h.text}`);
const by = hits.reduce((a, h) => ({ ...a, [h.kind]: (a[h.kind] ?? 0) + 1 }), {});
console.log('\n' + Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ') + `, total ${hits.length}`);
