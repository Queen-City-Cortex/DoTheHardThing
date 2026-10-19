// check:file-size: the pre-commit hook (.githooks/pre-commit) refuses a staged file over 5,000 tokens, where a token is
// 4 bytes. Big files are hard for an agent to read and edit whole, so the commit stops and says how to split them.
// It measures the staged blob (what the commit would contain), not the working tree, so a partly staged file counts as staged.
// Skipped: deleted files, symlinks, submodules, binary files, files matched by .filesizeignore (lockfiles, generated code,
// data), and files whose first lines say `@generated` or `DO NOT EDIT`.
// Usage: node scripts/check-file-size.mjs          the staged files (what the hook runs)
//        node scripts/check-file-size.mjs --all    every tracked file as it is in the index (a report; nothing is staged)
// Exit code: 0 all fit, 1 a file is over the limit, 2 git failed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN_LIMIT = 5000;
export const BYTES_PER_TOKEN = 4;
export const IGNORE_FILE = '.filesizeignore';
export const LIST_MAX = 5; // offenders named in the message; the rest are counted
const HEADER_LINES = 10;
const GENERATED = /@generated|DO NOT EDIT/;

/** Tokens as the rule counts them: bytes / 4, rounded up for display. */
export const tokensOf = (bytes) => Math.ceil(bytes / BYTES_PER_TOKEN);
/** Over the limit when bytes / 4 is more than 5,000: exactly 20,000 bytes passes, 20,001 fails. */
export const isOverLimit = (bytes) => bytes / BYTES_PER_TOKEN > TOKEN_LIMIT;

const escapeRe = (s) => s.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
function globToSource(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escapeRe(c);
  }
  return out;
}

/** The text of .filesizeignore as rules: [{ re, negate }]. gitignore-style globs, the last matching rule wins. */
export function parseIgnore(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes('/');
    line = line.replace(/^\//, '');
    if (!line) continue;
    const head = anchored ? '^' : '^(?:.*/)?';
    const tail = dirOnly ? '/.*$' : '(?:/.*)?$'; // a directory pattern covers everything under it
    rules.push({ re: new RegExp(head + globToSource(line) + tail), negate });
  }
  return rules;
}

/** True when the path (relative to the repo root, with `/`) is matched by the ignore rules. */
export function isIgnored(path, rules) {
  let ignored = false;
  for (const r of rules) if (r.re.test(path)) ignored = !r.negate;
  return ignored;
}

/** True when one of the first lines marks the file as generated. */
export const hasGeneratedHeader = (text) => text.split('\n', HEADER_LINES).some((l) => GENERATED.test(l));
/** A NUL byte in the first 8000 bytes: the same test git uses for binary. */
export const looksBinary = (buf) => buf.subarray(0, 8000).includes(0);

const n = (x) => x.toLocaleString('en-US');
function kindOf(path) {
  if (/\.(test|spec)\.[^/.]+$/.test(path)) return 'test';
  if (/\.(md|mdx|markdown|txt|rst)$/i.test(path)) return 'doc';
  return 'code';
}
// src/App.tsx -> { dir: 'src', base: 'App', ext: '.tsx' }; src/logic.test.ts -> { dir: 'src', base: 'logic', ext: '.test.ts' }
function parts(path) {
  const slash = path.lastIndexOf('/');
  const dir = slash < 0 ? '' : path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const m = file.match(/^(.*?)((?:\.(?:test|spec))?\.[^.]+)$/);
  return { dir, base: m ? m[1] : file, ext: m ? m[2] : '' };
}

/** The message for the offenders ([{ path, bytes }]), written for a coding agent. At most 25 lines. */
export function formatReport(offenders, { all = false } = {}) {
  const sorted = [...offenders].sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1));
  const shown = sorted.slice(0, LIST_MAX);
  const first = (kind) => sorted.find((o) => kindOf(o.path) === kind);
  const lines = [
    `check-file-size: ${all ? 'report' : 'commit blocked'}. ${sorted.length} ${all ? 'tracked' : 'staged'} file${sorted.length === 1 ? ' is' : 's are'} over ${n(TOKEN_LIMIT)} tokens (bytes / ${BYTES_PER_TOKEN}, so over ${n(TOKEN_LIMIT * BYTES_PER_TOKEN)} bytes):`,
    ...shown.map((o) => `  ${n(tokensOf(o.bytes)).padStart(7)} tokens  ${o.path}  (limit ${n(TOKEN_LIMIT)})`),
    ...(sorted.length > shown.length ? [`  ...and ${sorted.length - shown.length} more`] : []),
    '',
    'How to split each file (aim for pieces of 2,000 to 3,000 tokens):',
  ];
  const ex = first('code') ?? sorted[0];
  const { dir, base, ext } = parts(ex.path);
  const folder = `${dir}${base}/`;
  const piece = kindOf(ex.path) === 'code' ? ext.replace(/x$/, '') : '.ts'; // types and helpers hold no JSX
  lines.push(
    '  1. Read the file and list its distinct responsibilities: types, pure logic, UI components, hooks, constants, tests.',
    `  2. Create one new file per responsibility next to it, named for it: ${ex.path} -> ${folder}types${piece}, ${folder}helpers${piece}, ${folder}<Responsibility>${ext}`,
    '  3. MOVE the code. Do not rewrite, rename or "improve" it while moving.',
    `  4. Keep the original path as a thin file that re-exports the pieces (export * from './${base}/<Responsibility>';) or update every import, so nothing else breaks.`,
    '  5. Run npm test and npm run build; npm run check runs both plus typecheck and lint. Fix only what the move broke.',
    '  6. git add the new files and the original, then commit again.',
  );
  const t = first('test');
  if (t) {
    const p = parts(t.path);
    lines.push(`  Test files: split by describe block, one file per block: ${t.path} -> ${p.dir}${p.base}/<describe name>${p.ext}. Put shared setup in ${p.dir}${p.base}/helpers.ts. Delete the original once empty.`);
  }
  const d = first('doc');
  if (d) {
    const p = parts(d.path);
    lines.push(`  Docs and markdown: split by heading into linked files: ${d.path} -> ${p.dir}${p.base}/<heading>${p.ext}. Keep ${d.path} as a short index that links each one.`);
  }
  lines.push(
    `Not written by an agent (a lockfile, generated code, data)? Add its path to ${IGNORE_FILE}, one glob per line, and stage that file too.`,
    '`git commit --no-verify` is not the fix: it skips the check and leaves the file too big to read.',
  );
  return lines.join('\n');
}

const git = (cwd, args, opts = {}) => execFileSync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, ...opts });

/** Staged additions, copies, modifications and renames: [{ path, mode, sha }] from the index (`git diff --cached --raw`). */
function stagedEntries(cwd) {
  const out = git(cwd, ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--diff-filter=ACMR'], { encoding: 'utf8' }).split('\0');
  const entries = [];
  for (let i = 0; i < out.length; i++) {
    if (!out[i].startsWith(':')) continue;
    const [, mode, , sha, status] = out[i].split(' ');
    const two = status[0] === 'R' || status[0] === 'C'; // a rename or copy lists the old path, then the new one
    entries.push({ mode, sha, path: out[i + (two ? 2 : 1)] });
    i += two ? 2 : 1;
  }
  return entries;
}
/** Every tracked file as the index has it. */
function trackedEntries(cwd) {
  return git(cwd, ['ls-files', '-s', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map((l) => {
    const [meta, path] = l.split('\t');
    const [mode, sha] = meta.split(' ');
    return { mode, sha, path };
  });
}

/** The offenders among the entries: [{ path, bytes }]. Blob sizes come from one `git cat-file --batch-check`. */
export function findOffenders(cwd, entries, rules) {
  const regular = entries.filter((e) => (e.mode === '100644' || e.mode === '100755') && !/^0+$/.test(e.sha) && !isIgnored(e.path, rules));
  if (!regular.length) return [];
  const sizes = git(cwd, ['cat-file', '--batch-check=%(objectname) %(objectsize)'], { input: regular.map((e) => e.sha).join('\n') + '\n', encoding: 'utf8' })
    .split('\n').filter(Boolean).map((l) => Number(l.split(' ')[1]));
  const offenders = [];
  regular.forEach((e, i) => {
    if (!isOverLimit(sizes[i])) return;
    const blob = git(cwd, ['cat-file', 'blob', e.sha]);
    if (looksBinary(blob) || hasGeneratedHeader(blob.subarray(0, 4096).toString('utf8'))) return;
    offenders.push({ path: e.path, bytes: sizes[i] });
  });
  return offenders;
}

function main(argv) {
  let root;
  try { root = git(process.cwd(), ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch {
    console.error('check-file-size: not inside a git repository, nothing to check');
    return 2;
  }
  try {
    const ignorePath = join(root, IGNORE_FILE);
    const rules = parseIgnore(existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '');
    const all = argv.includes('--all');
    const entries = all ? trackedEntries(root) : stagedEntries(root);
    const offenders = findOffenders(root, entries, rules);
    if (!offenders.length) {
      if (all) console.log(`check-file-size OK: no tracked file is over ${n(TOKEN_LIMIT)} tokens`);
      return 0;
    }
    console.error(formatReport(offenders, { all }));
    return 1;
  } catch (e) {
    console.error(`check-file-size: git failed: ${e.message}`);
    return 2;
  }
}

// run only as a script, not when a test imports the functions above
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
