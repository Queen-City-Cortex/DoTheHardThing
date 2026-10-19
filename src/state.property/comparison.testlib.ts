// The reducer against the model of the old App.tsx, step by step (part (c) of the header in generators.testlib.ts); compared() memoises one comparison per generator.

import * as S from '../state';
import { SEEDS, MAX_LEN, mulberry32, View, MIN, dt, Gen, broken, brokenState, brokenStep } from './generators.testlib';
import { ALL, Legacy, legacy } from './legacy-model.testlib';
import { AppM, app } from './app-model.testlib';
import { Model, T0, RELOAD, StoredKind, aheadOf, Found, label, key, sameView } from './runner.testlib';

/** `substeps`: how often a screen was on show opened on a later sub-step (Name on its last step, after Back from Ask). */
type Coverage = { changed: Record<S.Action['type'], number>; views: Record<S.Screen, number>; opened: Record<StoredKind, number>; substeps: { nameLast: number } };
const coverage = (): Coverage => ({
  changed: { start: 0, setSmall: 0, editItems: 0, namingDone: 0, answer: 0, askDone: 0, stepBack: 0, choose: 0, startBlock: 0, pause: 0, resume: 0,
    drift: 0, stop: 0, tick: 0, didIt: 0, closeDay: 0, startOver: 0, open: 0, back: 0, rollover: 0, otherTabClosed: 0 },
  views: { welcome: 0, name: 0, ask: 0, pick: 0, block: 0, close: 0, closed: 0, about: 0, days: 0 },
  opened: { plan: 0, running: 0, ended: 0, closed: 0 },
  substeps: { nameLast: 0 },
});
/** Feeds the model of App.tsx around the reducer and the model of the App.tsx before it the same UI-gated sequences and
 *  compares them after every action, every reload and every check; stops at the first difference. The sequences are
 *  the ones run(app, gen, { ahead: true }) makes, and the model of App.tsx is held to the same invariants on the way
 *  (`invalid`, the first one broken), so the invariants tests read them from here instead of running them again. */
function compare(gen: Gen): { diffs: string[]; cov: Coverage; invalid: Found | null } {
  const M = legacy(ALL);
  const both: Model<{ s: AppM; m: Legacy }> = {
    init: (now, stored) => ({ s: app.init(now, stored), m: M.init(now, stored) }),
    view: (x) => app.view(x.s),
    step: (x, a, at) => ({ s: app.step(x.s, a, at), m: M.step(x.m, a, at) }),
    put: (x, d) => ({ s: app.put(x.s, d), m: M.put(x.m, d) }),
  };
  const diffs: string[] = [];
  const cov = coverage();
  let invalid: Found | null = null;
  for (let seed = 1; seed <= SEEDS && diffs.length === 0; seed++) {
    const r = mulberry32(seed);
    const r2 = mulberry32(seed + 0x9e3779b9);
    let now = T0 + Math.floor(r() * 18 * 60) * MIN;
    let x = both.init(now, []);
    const len = 1 + Math.floor(r() * MAX_LEN);
    const trail: string[] = [];
    const same = (n: number, when: string) => {
      const v = app.view(x.s), w = M.view(x.m);
      if (sameView(v, w)) return true;
      diffs.push(`seed ${seed} step ${n} ${when}, after ${trail.join(' > ')}\n  reducer ${key(v)}\n  before  ${key(w)}`);
      return false;
    };
    const holds = (n: number, prev: View | null, a: S.Action | null) => {
      const why = invalid ? null : broken(prev, a, app.view(x.s)) ?? brokenState(x.s.s);
      if (why) invalid = { seed, step: n, why, trail: [...trail] };
    };
    const step = (a: S.Action, n: number) => {
      const before = x.s.s;
      const why = invalid ? null : brokenStep(before, a, S.reduce(before, a, now));
      if (why) invalid = { seed, step: n, why, trail: [...trail] };
      x = both.step(x, a, now);
      if (x.s.s !== before) cov.changed[a.type]++;
    };
    for (let n = 0; n < len; n++) {
      const v = both.view(x);
      now += dt(r);
      if (r() < RELOAD) {
        trail.push('reload');
        x = both.init(now, v.store);
        holds(n, null, null);
        if (!same(n, 'after the reload')) break;
        continue;
      }
      const a = gen(r, v, n);
      trail.push(label(a));
      step(a, n);
      if (!same(n, 'after the action')) break;
      const { m, ahead } = aheadOf(both, r2, x, now);
      x = m;
      if (ahead) trail.push(`stored ${ahead.kind}`);
      step({ type: 'rollover', stored: [] }, n);
      holds(n, v, a);
      if (!same(n, 'after the check')) break;
      const d = S.dayOf(x.s.s);
      if (ahead && d.date === ahead.day.date && d.openedAt === ahead.day.openedAt) cov.opened[ahead.kind]++;
      cov.views[x.s.s.screen]++;
      if (x.s.s.screen === 'name' && x.s.s.opensAt === 'last') cov.substeps.nameLast++;
    }
  }
  return { diffs, cov, invalid };
}
const comparisons = new Map<Gen, ReturnType<typeof compare>>();
/** compare(gen), run once per mix and shared by the tests that read it. */
export function compared(gen: Gen): ReturnType<typeof compare> {
  const done = comparisons.get(gen) ?? compare(gen);
  comparisons.set(gen, done);
  return done;
}
