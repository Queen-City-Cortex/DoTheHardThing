import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY_FILES } from '../../eslint.config.js';
import { MOVE_TEXT, COPY_ESCAPE, restricted } from './helpers.mjs';

// The src files outside the copy lint, each with its reason. Every other non-test .ts/.tsx file directly under src/ must be
// in COPY_FILES (eslint.config.js), so dropping an entry or adding a file nobody listed fails the test below.
const NOT_COPY_FILES = {
  'src/copy.ts': 'the home of the copy: its entries are the text, checked by src/copy.test.ts (kinds, refs, the talk, and no sentence in fmt)',
  'src/method.ts': 'the method rules, each with its talk source and quote, checked against the transcript by scripts/check-method-quotes.mjs',
  'src/vite-env.d.ts': 'type declarations only, no code and no text',
};
describe('app copy: COPY_FILES is every src file except the listed exclusions', () => {
  const srcFiles = readdirSync(new URL('../../src', import.meta.url), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)).map((e) => `src/${e.name}`);
  it.each(srcFiles)('%s is in COPY_FILES or NOT_COPY_FILES', (file) => {
    expect(COPY_FILES.includes(file) || Object.hasOwn(NOT_COPY_FILES, file),
      `${file} is not covered by the copy lint: add it to COPY_FILES in eslint.config.js, or to NOT_COPY_FILES in scripts/boundaries.test.mjs with the reason it holds no app text`).toBe(true);
  });
  it.each(Object.keys(NOT_COPY_FILES))('%s (excluded) exists and is not also in COPY_FILES', (file) => {
    expect(srcFiles, `${file} is in NOT_COPY_FILES but does not exist: remove it from NOT_COPY_FILES in scripts/boundaries.test.mjs`).toContain(file);
    expect(COPY_FILES, `${file} is in both COPY_FILES and NOT_COPY_FILES: keep it in one`).not.toContain(file);
  });
  it('COPY_FILES has no repeats', () => expect(new Set(COPY_FILES).size).toBe(COPY_FILES.length));
});

describe('app copy: every file in COPY_FILES exists and is still linted for inline text', () => {
  it.each(COPY_FILES)('%s', async (file) => {
    expect(existsSync(new URL(`../../${file}`, import.meta.url)), `${file} does not exist any more, so the copy lint covers nothing there: update COPY_FILES in eslint.config.js`).toBe(true);
    // the file as it is, plus one hand-typed sentence: the lint must report the sentence and nothing else
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const msgs = await restricted(file, `${src}\nexport const zzLine = 'Five words in a row.';\n`);
    expect(msgs, `${file} is not covered by the copy lint (or has other no-restricted-* errors): ${JSON.stringify(msgs)}`).toEqual([`${MOVE_TEXT} ${COPY_ESCAPE}`]);
  });
});