// The agent loop: one command that says whether a change is done. Steps run cheapest first and stop at the first
// failure, which is printed with the command to rerun it alone.
// Usage: node scripts/check.mjs [fast|default|full]   (npm run check:fast | check | check:full)
//   fast     public hygiene, text rules, every imported package is declared (check:imports), the feature maps agree with the
//            journeys (check:maps), the social card was built from its current inputs (check:og), AGENTS.md enforcers exist,
//            the CI workflow and Dependabot policy keep the deploy gate (check:workflows), typecheck, lint, unit tests (no build)
//   default  fast + build + dist check
//   full     default + every journey against the fresh build (e2e/run.mjs --serve)
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'default';
const FAST = [
  ['check:public-hygiene', 'node scripts/check-public-hygiene.mjs'],
  ['check:text', 'node scripts/check-text.mjs'],
  ['check:imports', 'node scripts/check-imports.mjs'],
  ['check:maps', 'node scripts/check-maps.mjs'],
  ['check:og', 'node scripts/check-og.mjs'],
  ['check:agents-md', 'node scripts/check-agents-md.mjs'],
  ['check:workflows', 'node scripts/check-workflows.mjs'],
  ['typecheck', 'tsc -b'],
  ['lint', 'eslint .'],
  ['test', 'vitest run'],
];
const BUILD = [
  ['build', 'vite build'], // typecheck already ran tsc -b; `npm run build` would run it again
  ['check:dist', 'node scripts/check-dist.mjs'],
];
const JOURNEYS = [['journeys', 'node e2e/run.mjs --serve']];
const STEPS = { fast: FAST, default: [...FAST, ...BUILD], full: [...FAST, ...BUILD, ...JOURNEYS] }[mode];
if (!STEPS) { console.error(`unknown mode ${mode}: use fast, default or full`); process.exit(2); }

const name = `check${mode === 'default' ? '' : ':' + mode}`;
const t0 = Date.now();
const times = [];
for (const [step, cmd] of STEPS) {
  const t = Date.now();
  console.log(`\n> ${step}: ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, PATH: `node_modules/.bin:${process.env.PATH}` } });
  times.push(`${step} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  if (r.status !== 0) {
    console.error(`\n${name} FAIL at ${step} after ${((Date.now() - t0) / 1000).toFixed(1)}s (${times.join(', ')})`);
    console.error(`fix it, then rerun the step alone with \`npm run ${step}\`, then the whole loop`);
    process.exit(1);
  }
}
console.log(`\n${name} OK in ${((Date.now() - t0) / 1000).toFixed(1)}s (${times.join(', ')})`);
