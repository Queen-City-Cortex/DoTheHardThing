// check-imports.mjs on small fixture trees (IMPORTS_ROOT). The import lines in the fixtures are built from pieces, so this
// file does not import anything it does not declare either.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./check-imports.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const from = (names, spec) => `import ${names} from '${spec}';\n`;
const dyn = (spec) => `const m = await ${'import'}('${spec}');\n`;
const req = (spec) => `const r = ${'require'}('${spec}');\n`;
const PKG = { dependencies: { react: '^18.0.0' }, devDependencies: { vitest: '^2.0.0', '@playwright/test': '^1.0.0' } };

/** Write the files into a fresh tree and run the check there. */
function run(files, pkg = PKG) {
  const dir = mkdtempSync(join(tmpdir(), 'check-imports-'));
  dirs.push(dir);
  for (const [f, text] of Object.entries({ 'package.json': JSON.stringify(pkg), ...files })) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, IMPORTS_ROOT: dir } });
}

describe('check:imports', () => {
  it('passes when every package is declared, builtins, relative paths and repo paths are not packages', () => {
    const r = run({
      'src/a.ts': from('React', 'react') + from('{ x }', './b.ts') + from('{ y }', 'react/jsx-runtime'),
      'scripts/a.test.mjs': from('{ it }', 'vitest') + from('fs', 'node:fs') + from('path', 'path') + from('{ z }', 'fs/promises') + from('{ w }', 'src/state.ts'),
      'e2e/a.mjs': from('{ test }', '@playwright/test') + from('{ t }', '@playwright/test/reporter'),
      'worker/a.ts': from('x', 'cloudflare:workers') + from('{ y }', 'virtual:pwa-register'),
      'vite.config.ts': from('{ defineConfig }', 'vitest') + 'export default {};\n',
    });
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('check:imports OK: 5 files');
    expect(r.status).toBe(0);
  });

  it('fails on a package that is not declared, naming the file, the line and the command, once per package', () => {
    const r = run({
      'scripts/a.mjs': 'const a = 1;\n' + from('yaml', 'js-yaml'),
      'scripts/b.mjs': from('yaml', 'js-yaml/dist/x'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('check:imports FAIL: scripts/a.mjs:2 imports `js-yaml`, but `js-yaml` is not in package.json');
    expect(r.stderr).toContain('npm install -D js-yaml@');
    expect(r.stderr).toContain('1 undeclared package(s)');
  });

  it('sees a scoped package by its first two segments, a dynamic import, a re-export, a side-effect import and a multi-line import', () => {
    const r = run({
      'src/a.ts': from('{ a }', '@scope/pkg/deep') + dyn('left-pad') + `export * from 'right-pad';\n` + `import 'side-effect';\n` + `import {\n  a,\n  b,\n} from 'multi-line';\n`,
    });
    expect(r.status).toBe(1);
    for (const p of ['@scope/pkg', 'left-pad', 'right-pad', 'side-effect', 'multi-line']) expect(r.stderr).toContain(`but \`${p}\` is not in package.json`);
    expect(r.stderr).toContain('5 undeclared package(s)');
  });

  it('sees require forms, createRequire and import.meta.resolve', () => {
    const r = run({
      'scripts/a.mjs': `import { createRequire } from 'node:module';\nconst r2 = ${'create'}Require(import.meta.url)('via-create-require');\nconst u = import.meta.${'resolve'}('via-resolve');\n` + req('via-require'),
    });
    expect(r.status).toBe(1);
    for (const p of ['via-create-require', 'via-resolve', 'via-require']) expect(r.stderr).toContain(`but \`${p}\` is not in package.json`);
    expect(r.stderr).toContain('3 undeclared package(s)');
  });

  it('is not blinded by a /* inside a string, a glob or a line comment (they are not block comments)', () => {
    const r = run({
      'scripts/a.mjs': `const rule = '/*';\n` + from('h', 'hidden-by-string-opener') + `const close = '*/';\n`,
      'scripts/b.mjs': `const glob = ['src/**/*.ts'];\n` + from('h', 'hidden-by-glob') + `const x = 1; /* a comment */\n`,
      'scripts/c.mjs': `// the ../src/* files\n` + from('h', 'hidden-by-line-comment') + `/** a doc comment */\n`,
    });
    expect(r.status).toBe(1);
    for (const p of ['hidden-by-string-opener', 'hidden-by-glob', 'hidden-by-line-comment']) expect(r.stderr).toContain(`but \`${p}\` is not in package.json`);
  });

  it('says -D for tooling and tests, and no -D for src/ and worker/ code that ships; a package named like a root dir is still reported', () => {
    const r = run({ 'src/a.ts': from('a', 'ships-one'), 'src/a.test.ts': from('a', 'test-one'), 'worker/w.ts': from('a', 'docs') + from('a', 'ships-two'), 'e2e/a.mjs': from('a', 'tool-one'), 'docs/readme.md': '' });
    expect(r.stderr).toMatch(/npm install ships-one@/);
    expect(r.stderr).toMatch(/npm install docs@/);
    expect(r.stderr).toMatch(/npm install -D test-one@/);
    expect(r.stderr).toMatch(/npm install -D tool-one@/);
  });

  it('skips a #subpath import only when package.json maps imports, and explains a missing package.json', () => {
    expect(run({ 'src/a.ts': from('a', '#util') }).status).toBe(1);
    expect(run({ 'src/a.ts': from('a', '#util') }, { ...PKG, imports: { '#util': './src/util.ts' } }).status).toBe(0);
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, IMPORTS_ROOT: join(tmpdir(), 'check-imports-nowhere') } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('check:imports: cannot read package.json');
    expect(r.stderr).not.toContain('    at ');
  });

  it('counts dependencies, devDependencies, optionalDependencies and peerDependencies as declared', () => {
    const r = run(
      { 'src/a.ts': from('a', 'p-dep') + from('b', 'p-dev') + from('c', 'p-opt') + from('d', 'p-peer') },
      { dependencies: { 'p-dep': '1' }, devDependencies: { 'p-dev': '1' }, optionalDependencies: { 'p-opt': '1' }, peerDependencies: { 'p-peer': '1' } },
    );
    expect(r.status).toBe(0);
  });

  it('ignores an import that is only in a comment, and keeps line numbers right after a block comment', () => {
    const r = run({
      'scripts/a.mjs': `// ${from('x', 'only-in-a-line-comment')}/* ${from('x', 'only-in-a-block-comment')}\n * ${dyn('also-in-it')}*/\n` + from('y', 'really-imported'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('scripts/a.mjs:6 imports `really-imported`');
    expect(r.stderr).not.toContain('only-in');
    expect(r.stderr).not.toContain('also-in-it');
  });

  it('skips node_modules and dot directories, and reads root config files', () => {
    const r = run({
      'src/node_modules/x/index.js': from('a', 'ignored-one'),
      'src/.cache/a.ts': from('a', 'ignored-two'),
      'eslint.config.js': from('js', '@eslint/js'),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('eslint.config.js:1 imports `@eslint/js`');
    expect(r.stderr).not.toContain('ignored-');
    expect(r.stderr).toContain('1 undeclared package(s)');
  });

  it('passes on this repo, and fails the moment acorn or js-yaml is dropped from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    for (const name of ['acorn', 'js-yaml']) expect(pkg.devDependencies[name], `${name} is declared`).toBeTypeOf('string');
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: repo }).status).toBe(0);
    // the repo's own code in a temp tree under a package.json without the two
    const { acorn, 'js-yaml': yaml, ...rest } = pkg.devDependencies;
    expect([acorn, yaml].every(Boolean)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'check-imports-repo-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, devDependencies: rest }));
    for (const f of ['scripts/check-maps.mjs', 'scripts/check-workflows.mjs', 'scripts/check-workflows/common.mjs']) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), readFileSync(join(repo, f), 'utf8')); }
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, IMPORTS_ROOT: dir } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('`acorn` is not in package.json');
    expect(r.stderr).toContain('`js-yaml` is not in package.json');
  });
});
