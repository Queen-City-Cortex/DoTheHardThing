// check:imports: every package imported by the repo's own code is declared in package.json (dependencies or
// devDependencies), not just present in node_modules because something else depends on it. A transitive-only import works
// until the package that brought it is upgraded (an eslint bump once threatened to remove acorn and js-yaml, which
// check:maps and check:workflows import) and then fails far from the cause. The message names the exact install command.
// Scans src/, worker/, scripts/, e2e/ and the root *.js, *.mjs, *.ts and *.mts config files for static imports, re-exports and
// `import('x')`, `require('x')`, `createRequire(...)('x')` and `import.meta.resolve('x')` with a string literal. It does not see
// packages used by name only (a CLI run with npx, a Vite plugin named in a string, `types` references in tsconfig), an import
// that is not first on its line (`a(); import b from 'x'`), or anything under a dot directory, and it reads no lockfile: it
// checks the declaration, not the version. Comments are blanked only when they start a line (a line comment, or a block comment
// that opens a line): a `/*` inside a string or a glob is not a comment, and a mid-line comment that mentions an import is
// reported rather than trusted, so the check errs loud, never silent.
// Usage: node scripts/check-imports.mjs   (IMPORTS_ROOT=<dir> to scan another tree; the tests do)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';

const ROOT = process.env.IMPORTS_ROOT ?? '.';
const DIRS = ['src', 'worker', 'scripts', 'e2e'];
const EXT = /\.(?:[cm]?[jt]sx?)$/;
let pkg;
try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch (e) { console.error(`check:imports: cannot read package.json in ${ROOT === '.' ? 'the repo root' : ROOT}: ${e.message}`); process.exit(1); }
const declared = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap((k) => Object.keys(pkg[k] ?? {})));
const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, '').split('/')[0]));

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...files(p)); } else if (EXT.test(e.name) && !e.name.endsWith('.d.ts') && !e.name.endsWith('.d.mts')) out.push(p);
  }
  return out;
}
const roots = readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile() && EXT.test(e.name)).map((e) => join(ROOT, e.name));
const all = [...roots, ...DIRS.filter((d) => existsSync(join(ROOT, d)) && statSync(join(ROOT, d)).isDirectory()).flatMap((d) => files(join(ROOT, d)))];

const STATIC = /^[ \t]*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|^[ \t]*import\s*['"]([^'"]+)['"]|\b(?:import|require|import\.meta\.resolve)\(\s*['"]([^'"]+)['"]\s*\)|\bcreateRequire\([^()]*\)\(\s*['"]([^'"]+)['"]\s*\)/gm;
const problems = [];
const seen = new Set(); // packages already reported (once each, at the first file:line)
for (const file of all) {
  // comments that start a line out (newlines kept, so line numbers stay right): a commented-out or documented import is not an import
  const src = readFileSync(file, 'utf8').replace(/^[ \t]*\/\/.*$/gm, '').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (c) => c.replace(/[^\n]/g, ' '));
  for (const m of src.matchAll(STATIC)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (spec.startsWith('.') || spec.startsWith('/') || spec.includes(':')) continue; // relative, absolute, node:, cloudflare:, virtual:
    if (spec.startsWith('#') && pkg.imports) continue; // a subpath import this package maps itself
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (builtins.has(name) || DIRS.includes(name)) continue; // a Node builtin, or a path in this repo's own source dirs (a test fixture)
    if (declared.has(name) || seen.has(name)) continue;
    seen.add(name);
    const line = src.slice(0, m.index).split('\n').length;
    const dev = !/^(?:src|worker)\//.test(relative(ROOT, file)) || /\.test\.[cm]?[jt]sx?$/.test(file); // app code ships what it imports; tooling does not
    problems.push(`${relative(ROOT, file)}:${line} imports \`${spec}\`, but \`${name}\` is not in package.json: it only works while another package happens to install it. Declare it: npm install${dev ? ' -D' : ''} ${name}@<the version npm ls ${name} shows>`);
  }
}
if (problems.length) {
  for (const p of problems) console.error(`check:imports FAIL: ${p}`);
  console.error(`check:imports: ${problems.length} undeclared package(s)`);
  process.exit(1);
}
console.log(`check:imports OK: ${all.length} files import only declared packages`);
