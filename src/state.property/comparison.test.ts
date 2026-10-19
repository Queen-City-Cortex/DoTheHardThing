import { describe, expect, it } from 'vitest';
import * as S from '../state';
import { SEQUENCES, SEEDS, uiAction, uiWeighted } from './generators.testlib';
import { compared } from './comparison.testlib';

describe('the reducer behaves like the App.tsx before it (8f5dbaa): same UI-gated sequences, step by step', () => {
  it('uniform mix: same screen, way back, day, stored days, notifications and toggle after every action and every check of 5000 sequences', () => {
    const { diffs, cov } = compared(uiAction);
    expect(diffs).toEqual([]);
    console.log('[comparison, uniform] state changes by action:', JSON.stringify(cov.changed), '\n  views:', JSON.stringify(cov.views), '\n  stored records opened:', JSON.stringify(cov.opened));
  });
  it('weighted mix: the same, through Pick, the block, Close, Closed and midnight, and every action and screen is reached', () => {
    const { diffs, cov } = compared(uiWeighted);
    expect(diffs).toEqual([]);
    console.log('[comparison, weighted] state changes by action:', JSON.stringify(cov.changed), '\n  views:', JSON.stringify(cov.views), '\n  stored records opened:', JSON.stringify(cov.opened), '\n  sub-steps:', JSON.stringify(cov.substeps));
    if (SEEDS !== SEQUENCES) return; // the floors are for the 5000 sequences they were measured on
    // Each floor is about half of what these 5000 sequences give (in brackets), so a change that thins the evidence out
    // fails here instead of passing quietly. Every action type changes the state at least 200 times, except the rare
    // ones, which get a lower floor but never zero: a block action needs a whole day planned first (pause [179] is
    // offered once per block, resume [65] only after a pause, drift [211], stop [265]), closeDay [218] needs a block and
    // an answer, rollover [245] needs midnight on a day that can move, and otherTabClosed [254] is 0.5% of the steps.
    const RARE: Partial<Record<S.Action['type'], number>> = { pause: 90, resume: 30, drift: 100, stop: 130, closeDay: 100, rollover: 120, otherTabClosed: 120 };
    expect(Object.entries(cov.changed).filter(([k, n]) => n < (RARE[k as S.Action['type']] ?? 200)).map(([k, n]) => `${k} ${n}`)).toEqual([]);
    // every screen, overlays included, is on show after a step at least 300 times (the fewest is closed [648])
    expect(Object.entries(cov.views).filter(([, n]) => n < 300).map(([k, n]) => `${k} ${n}`)).toEqual([]);
    // a rollover opened each kind of record another tab saved for the new date (plan [16], running [19], ended [27], closed [15])
    expect(Object.entries(cov.opened).filter(([, n]) => n < 5).map(([k, n]) => `${k} ${n}`)).toEqual([]);
    // Name was on show opened on its last step, after Back from Ask's first item, at least 2000 times (nameLast [4533])
    expect(Object.entries(cov.substeps).filter(([, n]) => n < 2000).map(([k, n]) => `${k} ${n}`)).toEqual([]);
  });
});