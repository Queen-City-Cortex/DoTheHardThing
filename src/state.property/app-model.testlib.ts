// The reducer alone (bare) and inside a model of the new App.tsx (app): part (b) and (c) of the header in generators.testlib.ts.

import * as L from '../logic';
import * as S from '../state';
import { View } from './generators.testlib';
import { putDay } from './legacy-model.testlib';
import { Model } from './runner.testlib';

// ---------- the reducer, alone and inside a model of the new App.tsx ----------
const stateView = (s: S.State, store: L.Day[] = [], notified = 0): View => {
  const b = S.base(s);
  return { screen: s.screen, day: b.day, small: 'small' in b ? b.small : false, under: S.isOverlay(s) ? b.screen : null,
    back: S.isOverlay(s) ? [b.screen, ...s.prev] : [], store, notified };
};
/** The reducer alone: the store is every day it showed, and a rollover reads it. */
type Bare = { s: S.State; store: L.Day[] };
export const bare: Model<Bare> = {
  init: (now, stored) => ({ s: S.init(stored, now), store: stored }),
  view: (m) => stateView(m.s, m.store),
  step: (m, a, at) => {
    const s = S.reduce(m.s, a.type === 'rollover' ? { ...a, stored: m.store } : a, at);
    return { s, store: putDay(m.store, S.dayOf(s)) };
  },
  put: (m, d) => ({ ...m, store: putDay(m.store, d) }),
};
/** What App.tsx does around the reducer: send() runs it at `at`; then, as React commits, the rollover check (a layout
 *  effect on day, the day screen, store and screen: it saves the day being left, then sends `rollover`), the store put
 *  ([day]) and the notification ([state], through S.completed). On opening, one `tick`. */
export type AppM = { s: S.State; store: L.Day[]; notified: number; seen: { day: L.Day; under: string; screen: string; store: L.Day[] } | null; last: S.State };
function appCommit(m: AppM, at: number): AppM {
  let { s, store, notified, seen, last } = m;
  for (let round = 0; ; round++) {
    if (round > 10) throw new Error('app model: effects never settle');
    const day = S.dayOf(s), under = S.base(s).screen;
    const r0 = { day, under, screen: s.screen, store };
    const moved = !seen || seen.day !== day || seen.under !== under || seen.screen !== s.screen || seen.store !== store;
    const stale = !seen || seen.day !== day;
    if (!moved && last === s) break;
    // layout: rollOver(clockNow())
    let next = s;
    if (moved && L.shouldRollOver(day, under, at)) {
      store = putDay(store, day);
      next = S.reduce(s, { type: 'rollover', stored: r0.store }, at);
    }
    // passive, of the same commit: [day], then the notification
    if (stale) store = putDay(store, day);
    if (S.completed(last, s)) notified++;
    last = s;
    seen = r0;
    s = next;
  }
  return { s, store, notified, seen, last };
}
export const app: Model<AppM> = {
  init: (now, stored) => {
    const s = S.init(stored, now);
    const m = appCommit({ s, store: stored, notified: 0, seen: null, last: s }, now);
    return appCommit({ ...m, s: S.reduce(m.s, { type: 'tick' }, now) }, now); // the first tick
  },
  view: (m) => stateView(m.s, m.store, m.notified),
  step: (m, a, at) => {
    if (a.type === 'rollover') { // the interval, focus or visibility check: rollOver(clockNow())
      const day = S.dayOf(m.s), under = S.base(m.s).screen;
      if (!L.shouldRollOver(day, under, at)) return m;
      return appCommit({ ...m, store: putDay(m.store, day), s: S.reduce(m.s, { type: 'rollover', stored: m.store }, at) }, at);
    }
    const s = S.reduce(m.s, a, at);
    return s === m.s ? m : appCommit({ ...m, s }, at);
  },
  put: (m, d) => ({ ...m, store: putDay(m.store, d) }),
};