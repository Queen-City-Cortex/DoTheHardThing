import { describe, expect, it } from 'vitest';
import { restricted } from './helpers.mjs';
import { BAD } from './bad-snippets.mjs';
import { FINE, GAPS } from './fine-snippets.mjs';

describe('module map: bad snippets are reported with the fix', () => {
  it.each(BAD)('%s: %s', async (file, code, want) => {
    const msgs = await restricted(file, code);
    expect(msgs.some((m) => m.includes(want)), `got: ${JSON.stringify(msgs)}`).toBe(true);
  });
});

describe('module map: fine snippets are clean', () => {
  it.each(FINE)('%s: %s', async (file, code) => {
    expect(await restricted(file, code)).toEqual([]);
  });
});

describe('module map: known gaps', () => {
  it.each(GAPS)('%s: %s (not caught)', async (file, code) => {
    expect(await restricted(file, code)).toEqual([]);
  });
});
