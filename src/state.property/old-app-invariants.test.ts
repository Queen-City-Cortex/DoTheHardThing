import { describe, expect, it } from 'vitest';
import { ENV, SEEDS, anyAction, uiAction } from './generators.testlib';
import { ALL, NONE, legacy } from './legacy-model.testlib';
import { run, show } from './runner.testlib';

describe('BG-1 invariants, the App.tsx before this reducer (8f5dbaa, a model over logic.ts)', () => {
  it('with its repairs, UI-gated: no invalid state in 5000 sequences', () => {
    expect(show(run(legacy(ALL), uiAction))).toBe('none');
  });
  it('with its repairs, ungated (an action the screen does not offer): reaches an invalid state', () => {
    const f = run(legacy(ALL), anyAction);
    console.log('[legacy, repairs, ungated] first invalid state:', show(f));
    expect(f).not.toBeNull();
  });
  it('without the repairs (0fd3abe logic), UI-gated: the 6ef125f state, End block leaves the user on the timer (seed 82, step 21)', () => {
    const f = run(legacy(NONE), uiAction);
    console.log('[legacy, no repairs] first invalid state:', show(f));
    expect(show(f)).toMatch(/^seed 82, step 21: block screen without a running block \(block ended: stopped\)/);
  });
  // each repair left out on its own, the others kept. The seeds are the first ones of the uniform mix that find a state;
  // a change to that mix or to the runner's use of the random stream moves them
  it('without screenForBlock alone: the same state, seed 82, step 21', () => {
    expect(show(run(legacy({ ...ALL, screenForBlock: false }), uiAction))).toMatch(/^seed 82, step 21: block screen without a running block \(block ended: stopped\)/);
  });
  it('without validChoice alone: a stale choice before a block, seed 38359, step 31 (the first of 100000; run alone here)', () => {
    expect(show(run(legacy({ ...ALL, validChoice: false }), uiAction, { seeds: [38359] }))).toMatch(/^seed 38359, step 31: before a block, chosen item i14 is not in the pick list/);
  });
  it('without the stack clearing alone: no invalid state (the invariants cannot see it; the step comparison and the mutation runs do)', () => {
    // a stale stack only changes where Done goes back to, and every place it goes is a valid screen; the comparison's
    // `back` is what catches it, which is why this repair has no seed of its own
    const f = run(legacy({ ...ALL, stack: false }), uiAction, { seeds: SEEDS });
    console.log('[legacy, without stack] first invalid state:', show(f));
    expect(show(f)).toBe('none');
  });
  it('logs what validChoice, left out on its own, lets through in SEEDS sequences (none in 5000; SEEDS=100000 finds seed 38359)', () => {
    console.log('[legacy, without validChoice] first invalid state:', show(run(legacy({ ...ALL, validChoice: false }), uiAction, { seeds: SEEDS })));
  });
  it.runIf(ENV.REPLAY)('REPLAY: the invariants as a must-pass check on the 0fd3abe logic (expected to fail)', () => {
    expect(show(run(legacy(NONE), uiAction))).toBe('none');
  });
});
