// Shared by the pieces of scripts/check-workflows.mjs: the paths, the problem list, the YAML reader and the small predicates.

import fs from 'node:fs';
import path from 'node:path';


export let yaml;
try { yaml = (await import('js-yaml')).default; } catch {
  console.error('check:workflows: cannot import js-yaml. js-yaml is a devDependency, so run npm ci (or npm install -D js-yaml if package.json lost it)');
  process.exit(1);
}

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DIR = path.resolve(ROOT, process.env.WORKFLOWS_DIR ?? '.github/workflows');
export const DEPENDABOT = path.resolve(ROOT, process.env.DEPENDABOT_FILE ?? '.github/dependabot.yml');
export const RULES = 'abcdefghijkl';
export const DEPLOY_RUN = 'npx --yes "wrangler@${WRANGLER_VERSION}" deploy';
export const rel = (f) => (f.startsWith(ROOT + path.sep) ? path.relative(ROOT, f) : f);
export const problems = [];
export const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export const isMap = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Read and parse one YAML file; `line(needle, from)` is the first 1-based line at or after `from` that contains needle
 * (a string, or a regex that matches the line). */
export function open(file) {
  const name = rel(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    problems.push(`${name}:1 cannot read it (${e.code ?? e.message}): make it a readable file`);
    return null;
  }
  const lines = text.split('\n');
  const line = (needle, from = 1) => {
    for (let i = Math.max(from, 1) - 1; i < lines.length; i++) if (typeof needle === 'string' ? lines[i].includes(needle) : needle.test(lines[i])) return i + 1;
    return from;
  };
  const fail = (rule, at, msg) => problems.push(`${name}:${at} [${rule}] ${msg}`);
  /** Run one rule's checks; a shape it cannot read becomes a problem with the file and the rule, not a stack trace. */
  const rule = (r, at, fn) => {
    try { fn(); } catch (e) { fail(r, at, `the check could not read this file's shape (${e.message}): write it the way the GitHub documentation shows`); }
  };
  let doc;
  try { doc = yaml.load(text) ?? {}; } catch (e) {
    problems.push(`${name}:${(e.mark?.line ?? 0) + 1} not valid YAML (${e.reason ?? e.message}): fix the syntax`);
    return null;
  }
  if (!isMap(doc)) { problems.push(`${name}:1 the top level is not a mapping: write the keys GitHub documents (on, permissions, jobs)`); return null; }
  return { doc, text, lines, name, line, fail, rule };
}

/** Every string in a parsed value, with its path. */
export function strings(v, p = [], out = []) {
  if (typeof v === 'string') out.push([p, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, [...p, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, [...p, k], out);
  return out;
}
/** Every key in a parsed value, with its path (the key is the last element). */
export function keys(v, p = [], out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => keys(x, [...p, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push([...p, k]); keys(x, [...p, k], out); }
  return out;
}
export const firstLine = (s) => s.split('\n').find((l) => l.trim()) ?? s;
/** The shell commands of a run string: split on newlines, &&, ||, ; and pipes. */
export const commands = (run) => run.split(/\n|&&|\|\||[;|]/);
export const isWranglerDeploy = (run) => commands(run).some((c) => /\bwrangler\b.*\s(?:deploy|publish)\b/.test(c) && !/--dry-run\b/.test(c));
export const callsWrangler = (s) => /\bnpx\b[^\n;&|]*\bwrangler\b|\bwrangler(?:@\S+)?\s+-{0,2}[a-z]/.test(s);
/** A value reads secrets when the word is inside a ${{ }} expression, or anywhere in an `if` (an expression without ${{ }}). */
export const readsSecrets = (p, s) => (p.at(-1) === 'if' ? [s] : [...s.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[1])).some((e) => /\bsecrets\b/.test(e));

export function checkPermissions(f, perms, at, where) {
  if (perms == null) return;
  const bad = typeof perms === 'string' ? [perms] : Object.entries(perms).filter(([k, v]) => !['read', 'none'].includes(v) || k === 'id-token' && v !== 'none').map(([k, v]) => `${k}: ${v}`);
  if (bad.length) f.fail('c', at, `${where} permissions grant ${bad.join(', ')}: grant read only (contents: read); a write or id-token permission is a change to review on its own`);
}