import { describe, expect, it } from 'vitest';
import * as L from '../logic';
import * as S from '../state';
import { SEEDS, MIN, anyAction, uiAction, uiWeighted, brokenState } from './generators.testlib';
import { ALL, legacyView, legacy } from './legacy-model.testlib';
import { bare, AppM, app } from './app-model.testlib';
import { T0, run, key, sameView, show } from './runner.testlib';
import { compared } from './comparison.testlib';

describe('BG-1 invariants, the reducer (state.ts)', () => {
  it('any action at any time: no invalid state in 5000 sequences', () => {
    expect(show(run(bare, anyAction, { seeds: SEEDS, extra: (m) => brokenState(m.s), ahead: true }))).toBe('none');
  });
  // the comparison below replays exactly these sequences through the same model, so it checks them once for both
  it('UI-gated, inside the model of App.tsx: no invalid state in 5000 sequences', () => {
    expect(show(compared(uiAction).invalid)).toBe('none');
  });
  it('UI-gated with the weighted mix (through the block, Close and midnight), inside the model of App.tsx: no invalid state in 5000 sequences', () => {
    expect(show(compared(uiWeighted).invalid)).toBe('none');
  });

  const go = (s: S.State, as: S.Action[], at = T0) => as.reduce((x, a) => S.reduce(x, a, at), s);
  const two = () => L.addOrTag(L.addOrTag([], 'Taxes', 'risky', 'a').items, 'Call mom', 'risky', 'b').items;
  const yes = (id: string): S.Action[] => [{ type: 'answer', id, field: 'satisfied', value: true }, { type: 'answer', id, field: 'leverage', value: true }];
  const toPick = (s: S.State) => go(s, [{ type: 'start' }, { type: 'editItems', items: two() }, { type: 'namingDone' }, ...yes('a'), ...yes('b'), { type: 'askDone' }]);

  it('a stale choice after a reload (0fd3abe): a choice made, reloaded, then edited away is dropped, so Start stays off', () => {
    let s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }]);
    expect(S.dayOf(s).chosenId).toBe('a');
    s = S.init([S.dayOf(s)], T0); // reload: Welcome, with the stored choice
    expect(S.dayOf(s).chosenId).toBe('a'); // kept as stored, as the old App.tsx kept it
    s = go(s, [{ type: 'start' }, { type: 'editItems', items: S.dayOf(s).items.filter((i) => i.id !== 'a') }]);
    expect(S.dayOf(s).chosenId).toBe(null); // withItems drops it on the edit, as the old App.tsx did, so the stored record agrees
    s = go(s, [{ type: 'namingDone' }, { type: 'askDone' }]);
    expect(s.screen === 'pick' && s.chosen).toBe(null);
    expect(go(s, [{ type: 'startBlock', min: 120 }])).toBe(s); // Start does nothing without a choice
  });
  it('End block leaves the user on the timer (6ef125f): End block moves to Close, in one step', () => {
    const s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }, { type: 'startBlock', min: 120 }]);
    expect(s.screen).toBe('block');
    const ended = S.reduce(s, { type: 'stop' }, T0 + 5 * MIN);
    expect(ended.screen).toBe('close');
    expect(S.dayOf(ended).block?.endReason).toBe('stopped');
    expect(S.completed(s, ended)).toBe(false); // End block never says "Your block is done"
    // under an overlay a block action does nothing (the block screen is not showing), and Done goes back to the block
    const about = S.reduce(s, { type: 'open', to: 'about' }, T0);
    expect(S.reduce(about, { type: 'stop' }, T0)).toBe(about);
    expect(S.reduce(about, { type: 'back' }, T0)).toBe(s);
  });
  it('a block that reaches its target settles to Close on the tick, and only that says "Your block is done"', () => {
    const s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }, { type: 'startBlock', min: 120 }]);
    const early = S.reduce(s, { type: 'tick' }, T0 + 60 * MIN);
    expect(early.screen === 'block' && early.day).toBe(S.dayOf(s)); // a tick keeps the day object: nothing is saved each second
    const done = S.reduce(early, { type: 'tick' }, T0 + 120 * MIN);
    expect(done.screen).toBe('close');
    expect(S.completed(early, done)).toBe(true);
    expect(S.dayOf(done).gotBlock).toBe(true);
    // a reload after the block ended opens on the block screen; the first tick (App.tsx sends it on opening) settles it
    const reloaded = S.init([S.dayOf(s)], T0 + 3 * 60 * MIN);
    expect(reloaded.screen).toBe('block');
    expect(S.completed(reloaded, S.reduce(reloaded, { type: 'tick' }, T0 + 3 * 60 * MIN))).toBe(true);
    // in the model of App.tsx that first tick gives the old App.tsx's first render: Close, settled, and one notification
    const opened = app.init(T0 + 3 * 60 * MIN, [S.dayOf(s)]);
    expect([opened.s.screen, opened.notified]).toEqual(['close', 1]);
    expect(key(app.view(opened))).toBe(key(legacyView(legacy(ALL).init(T0 + 3 * 60 * MIN, [S.dayOf(s)]))));
  });
  it('closing a day carried past midnight: closeDay, then rollover, gives the old App.tsx\'s new day and store', () => {
    const late = new Date('2026-10-14T23:00:00').getTime();
    const after = new Date('2026-10-15T01:30:00').getTime();
    const s0 = go(toPick(S.init([], late)), [{ type: 'choose', id: 'a' }, { type: 'startBlock', min: 120 }], late);
    let a: AppM = app.init(late, []);
    let m = legacy(ALL).init(late, []);
    const acts: S.Action[] = [{ type: 'start' }, { type: 'editItems', items: two() }, { type: 'namingDone' }, ...yes('a'), ...yes('b'), { type: 'askDone' }, { type: 'choose', id: 'a' }, { type: 'startBlock', min: 120 }];
    for (const x of acts) { a = app.step(a, x, late); m = legacy(ALL).step(m, x, late); }
    for (const x of [{ type: 'tick' }, { type: 'didIt', didIt: true }, { type: 'closeDay' }] as S.Action[]) { a = app.step(a, x, after); m = legacy(ALL).step(m, x, after); }
    expect(S.dayOf(s0).date).toBe('2026-10-14');
    expect(a.s.screen).toBe('welcome');
    expect(S.dayOf(a.s).date).toBe('2026-10-15');
    expect(key(app.view(a))).toBe(key(legacyView(m)));
    expect(a.notified).toBe(1);
    expect(a.store.find((d) => d.date === '2026-10-14')).toMatchObject({ closed: true, didIt: true, doneText: 'Taxes' });
    // the reducer alone stops on Closed: the move to the real today is App's rollover, sent before paint
    const closed = go(S.reduce(S.reduce(s0, { type: 'tick' }, after), { type: 'didIt', didIt: true }, after), [{ type: 'closeDay' }], after);
    expect(closed.screen).toBe('closed');
    expect(S.reduce(closed, { type: 'rollover', stored: [] }, after).screen).toBe('welcome');
  });
  it('the comparison key is JSON.stringify of what it compares', () => {
    const v = app.view(app.init(T0, [{ ...L.newDay('2026-10-13', T0 - 24 * 60 * MIN), items: two() }]));
    expect(key(v)).toBe(JSON.stringify([v.screen, v.back, v.day, [...v.store].sort((x, y) => (x.date < y.date ? -1 : 1)), v.notified, v.small]));
    expect(sameView(v, { ...v, store: [...v.store, S.dayOf(S.init([], T0))] })).toBe(false);
    expect(sameView(v, { ...v, day: { ...v.day } })).toBe(true); // by value, not by object
  });
  it('choose with an id that is not on the list clears the choice (the UI only offers listed items)', () => {
    const s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }]);
    const off = S.reduce(s, { type: 'choose', id: 'nope' }, T0);
    expect(off.screen === 'pick' && off.chosen).toBe(null);
    expect(S.dayOf(off).chosenId).toBe(null);
  });
  it('known difference, hand-edited store only: a closed day with a running block stays Closed (the old App.tsx settled it on load and showed Close)', () => {
    // no tab writes this: closing needs an ended block. The old settle effect ran on any screen, so on the next load it
    // ended the block, sent "Your block is done" and showed Close on a closed day; the reducer opens Closed and leaves it
    const day: L.Day = { ...L.newDay('2026-10-14', T0), items: two(), chosenId: 'a', block: L.startBlock(120, T0), closed: true };
    const later = T0 + 3 * 60 * MIN;
    const a = app.init(later, [day]);
    const m = legacy(ALL).init(later, [day]);
    expect([a.s.screen, a.notified, S.dayOf(a.s).block?.endedAt]).toEqual(['closed', 0, null]);
    expect([m.screen, m.notified, m.day.block?.endReason]).toEqual(['close', 1, 'complete']);
  });
  it('a closed day ignores item edits and answers', () => {
    const closed: S.State = { screen: 'closed', day: { ...L.newDay('2026-10-14', T0), closed: true } };
    for (const a of [{ type: 'editItems', items: [] }, { type: 'answer', id: 'x', field: 'satisfied', value: true }, { type: 'namingDone' }] as S.Action[])
      expect(S.reduce(closed, a, T0)).toBe(closed);
  });
  describe('rollover', () => {
    const late = new Date('2026-10-14T23:00:00').getTime();
    const after = new Date('2026-10-15T01:30:00').getTime();
    const plan: S.PlanDay = { ...L.newDay('2026-10-14', late), items: two(), chosenId: null, block: null, closed: false };
    const running: S.RunningDay = { ...plan, chosenId: 'a', block: { ...L.startBlock(120, late), endedAt: null }, closed: false };
    const ended: S.EndedDay = { ...running, block: { ...running.block, endedAt: late + 30 * MIN, endReason: 'stopped' } };
    const closedDay: S.ClosedDay = { ...ended, didIt: true, closed: true };
    const blockS: S.BlockScreen = { screen: 'block', day: running, now: late };
    const closeS: S.Close = { screen: 'close', day: ended };
    const closedS: S.Closed = { screen: 'closed', day: closedDay };
    const welcomeS: S.Welcome = { screen: 'welcome', day: plan, small: true };
    const overlays = (b: S.Base): S.State[] => [b, { screen: 'about', under: b, prev: [] }, { screen: 'days', under: b, prev: ['about'] }];
    const roll = (s: S.State, stored: L.Day[] = []) => S.reduce(s, { type: 'rollover', stored }, after);
    // what another tab saved for the new date: the rollover opens it where it stands
    const theirs = { ...L.newDay('2026-10-15', after - MIN), items: two() };
    const theirBlock = L.startBlock(120, after - 10 * MIN);
    const theirRunning: L.Day = { ...theirs, chosenId: 'a', block: theirBlock };
    const theirEnded: L.Day = { ...theirRunning, block: L.stop(theirBlock, after - 5 * MIN) };
    /** A rollover at `after` with nothing stored opens Welcome on the new date; an open overlay stays open over it. */
    const expectMoved = (s: S.State) => {
      const n = roll(s);
      expect([n.screen, S.base(n).screen, S.dayOf(n).date]).toEqual([S.isOverlay(s) ? s.screen : 'welcome', 'welcome', '2026-10-15']);
    };

    it('opens a record stored for the new date: an ended block on Close, a running block on the block screen at now, a closed day on Closed', () => {
      expect(roll(welcomeS, [theirEnded])).toEqual({ screen: 'close', day: theirEnded });
      expect(roll(welcomeS, [theirRunning])).toEqual({ screen: 'block', day: theirRunning, now: after });
      const theirClosed = { ...theirEnded, didIt: false, closed: true };
      expect(roll(welcomeS, [plan, theirClosed])).toEqual({ screen: 'closed', day: theirClosed });
      // a stored plan opens on Welcome as stored, without the toggle
      expect(roll(welcomeS, [theirs])).toEqual({ screen: 'welcome', day: theirs, small: false });
    });
    it('with nothing stored for the new date, opens Welcome on a new day', () => {
      expect(roll(welcomeS, [plan])).toEqual({ screen: 'welcome', small: false, day: L.newDay('2026-10-15', after) });
    });
    it('under an overlay, opens the new day under it, and Done goes straight to it', () => {
      const s = roll({ screen: 'days', under: welcomeS, prev: ['about'] }, [theirEnded]);
      expect(s).toEqual({ screen: 'days', under: { screen: 'close', day: theirEnded }, prev: [] });
      expect(S.reduce(s, { type: 'back' }, after)).toEqual({ screen: 'close', day: theirEnded });
    });
    it('never moves a running block or an ended one that is not closed yet (block and Close, also under About or Your days)', () => {
      for (const s of [...overlays(blockS), ...overlays(closeS)]) expect(roll(s, [theirs])).toBe(s);
    });
    it('always moves a closed day, and a day still being planned on every planning screen', () => {
      for (const s of overlays(closedS)) expectMoved(s);
      // a closed day whose block still runs (a hand-edited store) moves too
      expectMoved({ screen: 'closed', day: { ...running, closed: true } });
      const picking = S.pick({ ...plan, items: plan.items.map((i) => ({ ...i, satisfied: true })), chosenId: 'a' }, false);
      for (const b of [welcomeS, { ...welcomeS, screen: 'name' } as S.Name, { ...welcomeS, screen: 'ask' } as S.Ask, picking])
        for (const s of overlays(b)) expectMoved(s);
    });
    it('on the same date, changes nothing', () => {
      for (const s of [...overlays(welcomeS), ...overlays(blockS), ...overlays(closedS)]) expect(S.reduce(s, { type: 'rollover', stored: [theirs] }, late + 30 * MIN)).toBe(s);
    });
  });
  it('invalid states do not compile (each case breaks one rule)', () => {
    const day = L.newDay('2026-10-14', T0);
    const plan: S.PlanDay = { ...day, block: null, closed: false };
    const list = L.pickOrder(plan.items);
    const running: S.RunningDay = { ...plan, block: { ...L.startBlock(120, T0), endedAt: null }, closed: false };
    const welcome: S.Welcome = { screen: 'welcome', day: plan, small: false };
    const ok: S.State[] = [welcome, { screen: 'pick', day: plan, small: false, list, chosen: null }, { screen: 'block', day: running, now: T0 }];
    // @ts-expect-error the block screen needs a running block (0fd3abe: the block screen with no block)
    const a: S.State = { screen: 'block', day: plan, now: T0 };
    // @ts-expect-error Close needs an ended block, not a running one
    const b: S.State = { screen: 'close', day: running };
    // @ts-expect-error an overlay goes back to a day screen, not to another overlay
    const c: S.State = { screen: 'about', under: { screen: 'days', under: welcome, prev: [] }, prev: [] };
    // @ts-expect-error Pick carries its list (a planning day, the toggle and the choice are all here)
    const d: S.State = { screen: 'pick', day: plan, small: false, chosen: null };
    // @ts-expect-error Pick plans a day with no block yet: a plain Day may have one (the list, the toggle and the choice are all here)
    const e: S.State = { screen: 'pick', day, small: false, list, chosen: null };
    // @ts-expect-error the shorter-block toggle exists only while planning
    const f: S.State = { screen: 'closed', day: { ...day, closed: true }, small: true };
    // @ts-expect-error the block screen draws the countdown from its own `now`
    const g: S.State = { screen: 'block', day: running };
    expect([...ok, a, b, c, d, e, f, g]).toHaveLength(10);
  });
});

/** How often each action type changed the reducer's state, and how often each screen was on show after a step. Both are
 *  full Records over the union types, so a new action or screen without an entry here is a compile error, and then a
 *  coverage failure until a generator reaches it. */