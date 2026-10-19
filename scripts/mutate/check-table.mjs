// Checks the table against a tree without running it (scripts/mutate.test.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { REPO, fileText, count } from './common.mjs';
import { MUTATIONS } from './table.mjs';

/** Journey names in e2e/drive.mjs and the journey groups it imports (e2e/journeys/*.mjs), read the cheap way: each is `'name': journey(` at the start of a line. */
export const journeyNames = (root = REPO) => new Set([...['e2e/drive.mjs', ...fs.readdirSync(path.join(root, 'e2e/journeys')).sort().map((f) => `e2e/journeys/${f}`)].map((f) => fileText(root, f)).join('\n').matchAll(/^\s*'([a-z0-9-]+)': journey\(/gm)].map((m) => m[1]));

/** Every way the table can be wrong against a tree: an empty list means it is OK. */
export function checkTable(root = REPO, rows = MUTATIONS) {
  const problems = [];
  const names = journeyNames(root);
  const seen = new Set();
  for (const m of rows) {
    if (seen.has(m.id)) problems.push(`${m.id}: duplicate id`);
    seen.add(m.id);
    if (!m.edits.length) problems.push(`${m.id}: no edits`);
    const text = fs.existsSync(path.join(root, m.file)) ? fileText(root, m.file) : '';
    for (const [find] of m.edits) if (count(text, find) !== 1) problems.push(`${m.id}: ${m.file} has ${count(text, find)} of ${JSON.stringify(find.slice(0, 70))}`);
    for (const j of m.journeys) if (!names.has(j)) problems.push(`${m.id}: no journey ${j} in e2e/drive.mjs`);
    if (!m.journeys.length && !(['lint', 'types', 'unit'].includes(m.only) && m.why)) problems.push(`${m.id}: no journey, and no only (lint, types or unit) with a why`);
  }
  return problems;
}