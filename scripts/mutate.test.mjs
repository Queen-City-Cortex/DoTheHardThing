// The mutation table in scripts/mutate.mjs, checked against this tree without running it: every find string occurs
// exactly once, every journey it names exists, ids are unique, and a row with no journey says which layer alone sees it.
// This is what keeps the table from rotting between the (slow, local) runs of `npm run mutate`.
import { describe, expect, it } from 'vitest';
import { checkTable, journeyNames, MUTATIONS } from './mutate.mjs';

describe('mutation table (scripts/mutate.mjs)', () => {
  it('has rows, and the journey names are read from e2e/drive.mjs', () => {
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(30);
    expect(journeyNames().size).toBeGreaterThan(40);
    expect(journeyNames().has('late-cutoffs')).toBe(true);
  });

  it('ids are unique', () => {
    expect(new Set(MUTATIONS.map((m) => m.id)).size).toBe(MUTATIONS.length);
  });

  it.each(MUTATIONS.map((m) => [m.id, m]))('%s applies to this tree and names real journeys', (_id, m) => {
    expect(checkTable(undefined, [m])).toEqual([]);
  });

  it('a row with no journey names the one layer that can see it, and why', () => {
    for (const m of MUTATIONS.filter((x) => !x.journeys.length)) {
      expect(['lint', 'types', 'unit'], m.id).toContain(m.only);
      expect(m.why, m.id).toBeTruthy();
    }
  });

  it('reports a find string that does not occur exactly once, a missing journey and a duplicate id', () => {
    const row = { id: 'x', what: 'x', file: 'src/logic.ts', edits: [['this text is not in logic.ts', '']], journeys: ['no-such-journey'] };
    const twice = { ...row, edits: [['export ', '']], journeys: [] };
    const problems = checkTable(undefined, [row, twice]);
    expect(problems).toEqual([
      expect.stringContaining('x: src/logic.ts has 0 of'),
      'x: no journey no-such-journey in e2e/drive.mjs',
      'x: duplicate id',
      expect.stringMatching(/^x: src\/logic\.ts has \d+ of "export "/),
      'x: no journey, and no only (lint, types or unit) with a why',
    ]);
  });
});
