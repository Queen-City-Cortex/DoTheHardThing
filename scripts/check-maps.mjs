// check:maps: the feature maps in e2e/features and the journeys in e2e/drive.mjs must agree. drive.mjs and the files it
// imports (e2e/drive/*.mjs and e2e/journeys/*.mjs: the journey groups, the helpers, the registry holding J) are parsed, never
// run, so this needs no browser and does not load Playwright. Every problem prints file:line and the fix.
//   - every journey in J (and in objects merged with Object.assign(J, x)) is 'name': journey({ id, feature, proves, strings }, fn)
//     with a plain-literal meta (`note` is an allowed optional key); meta.id is its name; `feature` names a map; every `proves`
//     id is a Sub-features id of some map; every `strings` id is in src/copy.ts and the journey really asserts it: its code,
//     or a top-level helper or journey it uses, has t('id'), the bare id, or a literal equal to the id's text;
//   - every journey is listed exactly once, in its `feature` map, as "Run `vdt journey <name>`" (any code span with
//     `vdt journey <name>` in it counts, such as `e2e/vdt journey x` or `VDT_PORT=4401 vdt journey x`); other maps write
//     "see `<name>` in [map.md](./map.md)". Every name after `vdt journey`, and every "see `x` in [text](./map.md)" (matched
//     by the link target), is a real journey (or sub-feature) whose home is that map;
//   - a sub-feature id is listed under Sub-features in one map only;
//   - every sub-feature of every map is proved by some journey's meta.proves, or its line says "not verified by vdt"
//     (those are printed on success, so they stay visible);
//   - every backticked kebab-case token in a map (`like-this`) is a journey, a sub-feature id, or in PROSE_ALLOW below, so a
//     rename cannot leave the old name behind in a Proof or prose line.
// Reported, since the journeys they add would be invisible here: `J.x = ...`, an alias of J (`const J2 = J`), and an
// Object.assign(J, x) whose x is neither an object literal nor a top-level const holding one.
// Not caught: a journey added in some other way outside J, prose that describes a journey without naming it, and a helper
// that asserts a string on one branch only (the reach check follows every helper a journey calls). `proves` and `strings`
// are claims: this checks that each id exists and that the journey's code reaches each string, not that the journey really
// verifies the sub-feature. Not cross-checked with `node e2e/drive.mjs --list`: that imports Playwright and costs about
// 340 ms more than this whole check (measured), so the parse above has to see every journey.
// Usage: node scripts/check-maps.mjs   (npm run check:maps). MAPS_DRIVE and MAPS_FEATURES (relative to the repo root, or
// absolute) point it at other files, for the tests.
import fs from 'node:fs';
import path from 'node:path';
import { COPY } from '../src/copy.ts';

let acorn;
try { acorn = await import('acorn'); } catch {
  console.error('check:maps: cannot import acorn. acorn is a devDependency, so run npm ci (or npm install -D acorn if package.json lost it)');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const DRIVE = path.resolve(ROOT, process.env.MAPS_DRIVE ?? 'e2e/drive.mjs');
const FEATURES = path.resolve(ROOT, process.env.MAPS_FEATURES ?? 'e2e/features');
const NOT_MAPS = ['README.md', 'copy.md'];
const META_KEYS = ['id', 'feature', 'proves', 'strings', 'note'];
const NOT_VERIFIED = 'not verified by vdt';
// backticked kebab-case words in the maps that are neither a journey nor a sub-feature id
const PROSE_ALLOW = new Set([
  'aria-pressed', // the ARIA attribute of the toggle rows (first-visit.md, returning-user.md)
  'color-contrast', // an axe-core rule id (resilience.md)
  'aria-prohibited-attr', // an axe-core rule id (resilience.md)
  'answer-yes', // a step label, the evidence file name of history-from-close-and-about's Yes step (close-day.md)
  'close-first-yes', // a deleted journey, named on purpose: close-day.md says history-from-close-and-about replaced it
]);
const rel = (f) => (f.startsWith(ROOT + path.sep) ? path.relative(ROOT, f) : f);
const D = rel(DRIVE); // the entry file, named in messages that are about the whole set of journey files
const problems = [];

// ---- read drive.mjs and the files it imports (next to it: drive/ and journeys/) ----
const DRIVE_FILES = [DRIVE, ...['drive', 'journeys'].flatMap((d) => {
  const dir = path.join(path.dirname(DRIVE), d);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().map((f) => path.join(dir, f)) : [];
})];
const parsed = DRIVE_FILES.map((file) => {
  const src = fs.readFileSync(file, 'utf8');
  return { file: rel(file), src, ast: acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) };
});
const walk = (n, f) => {
  if (!n || typeof n.type !== 'string') return;
  f(n);
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, f)); else if (v && typeof v.type === 'string') walk(v, f); }
};
const key = (p) => p.key.value ?? p.key.name;
function literal(n, at) {
  if (n.type === 'Literal') return n.value;
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return n.quasis[0].value.cooked;
  if (n.type === 'ArrayExpression') return n.elements.map((e) => literal(e, at));
  if (n.type === 'ObjectExpression' && n.properties.every((p) => p.type === 'Property' && !p.computed)) return Object.fromEntries(n.properties.map((p) => [key(p), literal(p.value, at)]));
  throw new Error(`${at}:${n.loc.start.line}`);
}
// top-level functions and consts of every file by name (`export` or not), and the object literals among them with their file
const tops = {}; const objects = {}; const objectFile = {};
for (const { ast, file } of parsed) for (const top of ast.body) {
  const st = top.type === 'ExportNamedDeclaration' && top.declaration ? top.declaration : top;
  const decls = st.type === 'FunctionDeclaration' ? [[st.id.name, st]] : st.type === 'VariableDeclaration' ? st.declarations.map((d) => [d.id.name, d.init]) : [];
  for (const [name, init] of decls) { tops[name] = init; if (init?.type === 'ObjectExpression') { objects[name] = init; objectFile[name] = file; } }
}
// J plus every object merged into it with Object.assign(J, x); `J.x = ...` is reported, since the meta would be invisible here
const merged = [{ name: 'J', node: objects.J, file: objectFile.J }];
for (const { ast, src, file: D } of parsed) walk(ast, (n) => {
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.callee.property.name === 'assign' && n.arguments[0]?.name === 'J')
    for (const a of n.arguments.slice(1)) {
      const node = a.type === 'ObjectExpression' ? a : a.type === 'Identifier' ? objects[a.name] : undefined;
      if (node) merged.push({ name: a.name ?? 'Object.assign', node, file: a.type === 'Identifier' ? objectFile[a.name] : D });
      else problems.push(`${D}:${a.loc.start.line}: Object.assign(J, ${src.slice(a.start, a.end)}) merges journeys this check cannot read; write the journeys as an object literal assigned to a top-level const, then Object.assign(J, thatConst)`);
    }
  const alias = n.type === 'VariableDeclarator' && n.init?.type === 'Identifier' && n.init.name === 'J' ? n.id.name
    : n.type === 'AssignmentExpression' && n.right.type === 'Identifier' && n.right.name === 'J' ? src.slice(n.left.start, n.left.end) : null;
  if (alias) problems.push(`${D}:${n.loc.start.line}: ${alias} is another name for J, so journeys added through it are invisible here; use J itself (const J = { ... }, or Object.assign(J, x))`);
  if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.name === 'J')
    problems.push(`${D}:${n.loc.start.line}: a journey is added with J.x = ...; move it into const J = { ... } (or an object merged with Object.assign(J, x)) as 'name': journey({ ... }, fn), so its meta is checked`);
});
if (!objects.J) problems.push(`${rel(DRIVE)}: no const J = { ... }; the journeys must be the properties of J`);
const journeys = new Map();
for (const { name: obj, node, file: D } of merged) for (const p of node?.properties ?? []) {
  if (p.type !== 'Property') { problems.push(`${D}:${p.loc.start.line}: a spread in ${obj} hides its journeys from this check; write each journey as 'name': journey({ ... }, fn)`); continue; }
  const name = key(p); const v = p.value; const line = p.loc.start.line;
  if (v.type !== 'CallExpression' || v.callee.name !== 'journey' || v.arguments.length !== 2) {
    problems.push(`${D}:${line}: journey '${name}' has no meta: write '${name}': journey({ id: '${name}', feature: '<map>', proves: [], strings: [] }, async (s) => { ... })`);
    journeys.set(name, { name, line, file: D, fn: v, meta: null }); continue;
  }
  let meta = null;
  try { meta = literal(v.arguments[0], D); } catch (e) { problems.push(`${e.message}: the meta of '${name}' is not a plain literal; write it with strings, arrays and objects only (no variables, calls or templates with values)`); }
  journeys.set(name, { name, line, file: D, fn: v.arguments[1], meta });
}

// copy ids a journey reaches: t('id'), the bare id or the exact text as a literal, in its own code and in every top-level helper or journey it uses
const TEXT = new Map(Object.entries(COPY).map(([id, e]) => [e.text, id]));
const isJ = new Set(merged.map((m) => m.name));
const reachCache = new Map();
function reach(node, seen = new Set()) {
  const ids = new Set();
  walk(node, (x) => {
    if (x.type === 'Literal' && typeof x.value === 'string') { if (Object.hasOwn(COPY, x.value)) ids.add(x.value); if (TEXT.has(x.value)) ids.add(TEXT.get(x.value)); }
    if (x.type === 'TemplateLiteral') for (const q of x.quasis) if (TEXT.has(q.value.cooked)) ids.add(TEXT.get(q.value.cooked));
    let next = null;
    if (x.type === 'Identifier' && tops[x.name] && !isJ.has(x.name)) next = x.name;
    if (x.type === 'MemberExpression' && x.object.name === 'J' && x.property.type === 'Literal') next = 'J:' + x.property.value;
    if (next && !seen.has(next)) {
      seen.add(next);
      const target = next.startsWith('J:') ? journeys.get(next.slice(2))?.fn : tops[next];
      if (target) for (const i of reach(target, seen)) ids.add(i);
    }
  });
  return ids;
}
const reached = (j) => { if (!reachCache.has(j.name)) reachCache.set(j.name, reach(j.fn)); return reachCache.get(j.name); };

// ---- read the maps ----
const maps = new Map(); // name -> { file, lines, subs: Map(id -> { line, unverified }) }
for (const f of fs.readdirSync(FEATURES).filter((f) => f.endsWith('.md') && !NOT_MAPS.includes(f)).sort()) {
  const file = path.join(FEATURES, f); const lines = fs.readFileSync(file, 'utf8').split('\n');
  const subs = new Map(); let inSubs = false;
  lines.forEach((l, i) => {
    if (/^## /.test(l)) inSubs = /^## Sub-features\s*$/.test(l);
    const m = inSubs && l.match(/^- `([a-z0-9-]+)`/);
    if (!m) return;
    if (subs.has(m[1])) problems.push(`${rel(file)}:${i + 1}: sub-feature \`${m[1]}\` is listed twice in this map (also line ${subs.get(m[1]).line}); drop one`);
    else subs.set(m[1], { line: i + 1, unverified: l.includes(NOT_VERIFIED) });
  });
  maps.set(f.replace(/\.md$/, ''), { file, lines, subs });
}
const subOwner = new Map();
for (const [m, { file, subs }] of maps) for (const [s, { line }] of subs) {
  const first = subOwner.get(s);
  if (first) problems.push(`sub-feature \`${s}\` is listed in two maps (${rel(maps.get(first).file)}:${maps.get(first).subs.get(s).line} and ${rel(file)}:${line}); an id has one home: keep it in one map and write "see \`${s}\` in [map.md](./map.md)" in the other`);
  else subOwner.set(s, m);
}
const mapList = [...maps.keys()].join(', ');

// ---- meta ----
for (const j of journeys.values()) {
  const at = `${j.file}:${j.line}: '${j.name}'`; const m = j.meta;
  if (!m) continue;
  for (const k of Object.keys(m)) if (!META_KEYS.includes(k)) problems.push(`${at}: unknown meta key '${k}'; the keys are ${META_KEYS.join(', ')}`);
  for (const k of META_KEYS.slice(0, 4)) if (!(k in m)) problems.push(`${at}: meta has no '${k}'; write ${k}: ${k === 'id' ? `'${j.name}'` : k === 'feature' ? "'<map>'" : '[]'}`);
  for (const k of ['proves', 'strings']) if (k in m && !(Array.isArray(m[k]) && m[k].every((x) => typeof x === 'string'))) { problems.push(`${at}: meta.${k} must be an array of id strings`); m[k] = []; }
  if ('id' in m && m.id !== j.name) problems.push(`${at}: meta.id is '${m.id}'; it must equal the journey name: write id: '${j.name}'`);
  if ('feature' in m && !maps.has(m.feature)) problems.push(`${at}: meta.feature '${m.feature}' is not a map in ${rel(FEATURES)}; use one of ${mapList}`);
  for (const id of m.proves ?? []) if (!subOwner.has(id)) problems.push(`${at}: proves '${id}', which no map lists under Sub-features; fix the id or add the sub-feature to its map`);
  for (const id of m.strings ?? []) {
    if (!Object.hasOwn(COPY, id)) problems.push(`${at}: strings has '${id}', which is not an id in src/copy.ts; fix the id or drop it`);
    else if (!reached(j).has(id)) problems.push(`${at}: strings has '${id}' but the journey never asserts it (no t('${id}') and no literal ${JSON.stringify(COPY[id].text)} in it or its helpers); assert it or drop it`);
  }
}

// ---- the maps: listings, cross-references, prose tokens ----
const listedIn = new Map();
for (const [name, m] of maps) m.lines.forEach((line, i) => {
  const at = `${rel(m.file)}:${i + 1}`;
  const named = [...line.matchAll(/`([^`]*)`/g)].flatMap((span) => span[1].match(/(?:^|[\s/])vdt journey((?: +[a-z0-9][a-z0-9-]*)+)/)?.[1].trim().split(/ +/) ?? []);
  for (const j of named) {
    if (!journeys.has(j)) problems.push(`${at}: names journey '${j}', which is not in J in ${D} (renamed or deleted?); write its current name or drop the line`);
    else (listedIn.get(j) ?? listedIn.set(j, []).get(j)).push({ map: name, at });
  }
  for (const hit of line.matchAll(/see `([a-z0-9-]+)` in \[[^\]]*\]\(\.\/([a-z0-9-]+)\.md\)/gi)) {
    const [, x, target] = hit;
    const home = journeys.get(x)?.meta?.feature ?? subOwner.get(x);
    if (!journeys.has(x) && !subOwner.has(x)) problems.push(`${at}: refers to '${x}', which is neither a journey in ${D} nor a sub-feature id; write its current name`);
    else if (home && home !== target) problems.push(`${at}: says see '${x}' in ${target}.md, but it lives in ${home}.md; write see \`${x}\` in [${home}.md](./${home}.md)`);
  }
  for (const hit of line.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)) {
    const x = hit[1];
    if (!journeys.has(x) && !subOwner.has(x) && !PROSE_ALLOW.has(x)) problems.push(`${at}: \`${x}\` looks like a journey name but is neither a journey in ${D} nor a sub-feature id (renamed?); write the current name, or add it to PROSE_ALLOW in scripts/check-maps.mjs with a comment saying what it is`);
  }
});
for (const j of journeys.values()) {
  const at = listedIn.get(j.name) ?? []; // every listing, so a second one in the same map counts
  const inMaps = new Set(at.map((l) => l.map)).size;
  const home = j.meta?.feature;
  if (!at.length) problems.push(`${j.file}:${j.line}: '${j.name}' is in no map: add a "- **<What it shows>.** Run \`vdt journey ${j.name}\`. ..." line to the Driving section of ${rel(path.join(FEATURES, (home ?? '<feature>') + '.md'))}`);
  else if (inMaps > 1) problems.push(`'${j.name}' is listed in ${inMaps} maps (${at.map((l) => l.at).join(', ')}); keep "Run \`vdt journey ${j.name}\`" in ${home}.md only and write "See \`${j.name}\` in [${home}.md](./${home}.md)" in the others`);
  else if (at.length > 1) problems.push(`'${j.name}' is listed ${at.length} times (${at.map((l) => l.at).join(', ')}); keep one "Run \`vdt journey ${j.name}\`" line, in ${home}.md`);
  else if (home && at[0].map !== home) problems.push(`${at[0].at}: lists '${j.name}', but its meta.feature (${j.file}:${j.line}) is '${home}'; move the line to ${home}.md or change the meta`);
}

// ---- every sub-feature is proved ----
const proved = new Set([...journeys.values()].flatMap((j) => j.meta?.proves ?? []));
const unverified = [];
for (const m of maps.values()) for (const [id, s] of m.subs) {
  const at = `${rel(m.file)}:${s.line}`;
  if (s.unverified && proved.has(id)) problems.push(`${at}: \`${id}\` says "${NOT_VERIFIED}", but ${[...journeys.values()].filter((j) => j.meta?.proves?.includes(id)).map((j) => j.name).join(', ')} proves it; drop the note`);
  else if (s.unverified) unverified.push(`${id} (${at})`);
  else if (!proved.has(id)) problems.push(`${at}: no journey proves \`${id}\`; add it to the meta.proves of the journey that shows it, or, if no journey can, say "${NOT_VERIFIED}" in its line and why in Gotchas`);
}

if (problems.length) { console.error(`check:maps FAIL: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n')); process.exit(1); }
console.log(`maps OK: ${journeys.size} journeys, ${maps.size} maps`);
if (unverified.length) console.log(`  not proved by any journey, as the map says ("${NOT_VERIFIED}"): ${unverified.join(', ')}`);
