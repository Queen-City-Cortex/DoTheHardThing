// The runner: runs a model over seeded action sequences and reports the first invariant that breaks.

import * as L from '../logic';
import * as S from '../state';
import { SEQUENCES, MAX_LEN, PLANNING, mulberry32, Rnd, pickOf, View, MIN, dt, LENGTHS, Gen, broken } from './generators.testlib';
import { keyOf } from './legacy-model.testlib';

// ---------- runner ----------
/** `put` is another tab saving a day into the store this tab holds. */
export type Model<M> = { init: (now: number, stored: L.Day[]) => M; view: (m: M) => View; step: (m: M, a: S.Action, at: number) => M; put: (m: M, d: L.Day) => M };
export const T0 = new Date('2026-10-14T06:00:00').getTime();
/** A reload: the app starts again from what is stored. */
export const RELOAD = 0.04;
/** After midnight, how often another tab has already saved a record for the new date before the check runs. */
const STORED_AHEAD = 0.3;
const STORED_KINDS = ['plan', 'running', 'ended', 'closed'] as const;
export type StoredKind = (typeof STORED_KINDS)[number];
/** A record another tab saved for `date`: a plan, a running block, an ended block or a closed day. Its openedAt is one
 *  second before `now`, so the runner can tell it from a new day the rollover opened. */
function storedAhead(r: Rnd, date: string, now: number): { kind: StoredKind; day: L.Day } {
  const kind = pickOf(r, STORED_KINDS);
  const items = L.addOrTag(L.addOrTag([], 'Taxes', 'risky', 's1').items, 'Call mom', 'anxious', 's2').items;
  // s1 has a yes, so it is on the pick list: the only choice a tab can save before a block
  const plan: L.Day = { ...L.newDay(date, now - 1000), items: items.map((i) => (i.id === 's1' ? { ...i, satisfied: true } : i)), chosenId: r() < 0.5 ? 's1' : null };
  if (kind === 'plan') return { kind, day: plan };
  const started = L.startBlock(pickOf(r, LENGTHS.full), now - pickOf(r, [0, 1000, 5 * MIN]));
  if (kind === 'running') return { kind, day: { ...plan, chosenId: 's1', block: started } };
  const ended: L.Day = { ...plan, chosenId: 's1', block: L.stop(started, now - 1000), gotBlock: false };
  if (kind === 'ended') return { kind, day: ended };
  return { kind, day: { ...ended, didIt: true, doneText: 'Taxes', closed: true } };
}
/** Puts a record for the date of `now` into the store before the check, now and then, when the open day is an earlier
 *  date and nothing is stored for it yet: the check (and every model's rollover) then has to open it. It draws from its
 *  own random stream, so the actions each seed generates are the same with it or without it. */
export function aheadOf<M>(model: Model<M>, r: Rnd, m: M, now: number): { m: M; ahead: { kind: StoredKind; day: L.Day } | null } {
  const v = model.view(m);
  const date = keyOf(now);
  if (r() >= STORED_AHEAD || v.day.date >= date || v.store.some((d) => d.date === date)) return { m, ahead: null };
  const ahead = storedAhead(r, date, now);
  // a running block is put only when this check opens it at once: opened later (after closing a day carried past
  // midnight) the App.tsx before this reducer settles it with the time of its last tick, a known difference (docs/architecture.md)
  if (ahead.kind === 'running' && !L.shouldRollOver(v.day, (v.under ?? v.screen) as L.DayScreen, now)) return { m, ahead: null };
  return { m: model.put(m, ahead.day), ahead };
}
export type Found = { seed: number; step: number; why: string; trail: string[] };
export const label = (a: S.Action) => (a.type === 'editItems' ? `editItems(${a.items.map((i) => i.text).join('|')})` : a.type);
/** The seeds 1 to n, or exactly the ones listed. */
const seedsOf = (seeds: number | number[]) => (Array.isArray(seeds) ? seeds : Array.from({ length: seeds }, (_, i) => i + 1));
type RunOpts<M> = { seeds?: number | number[]; extra?: (m: M) => string | null; ahead?: boolean };
/** Runs seeded sequences of one model; after every step the interval check runs (the App.tsx before this reducer checks
 *  every minute and on focus). With `ahead`, another tab sometimes saved the new date's record first (aheadOf). */
export function run<M>(model: Model<M>, gen: Gen, { seeds = SEQUENCES, extra, ahead = false }: RunOpts<M> = {}): Found | null {
  for (const seed of seedsOf(seeds)) {
    const r = mulberry32(seed);
    const r2 = mulberry32(seed + 0x9e3779b9);
    let now = T0 + Math.floor(r() * 18 * 60) * MIN;
    let m = model.init(now, []);
    const trail: string[] = [];
    const len = 1 + Math.floor(r() * MAX_LEN);
    for (let n = 0; n < len; n++) {
      const v = model.view(m);
      now += dt(r);
      if (r() < RELOAD) {
        trail.push('reload');
        m = model.init(now, v.store);
        const why = broken(null, null, model.view(m)) ?? extra?.(m) ?? null;
        if (why) return { seed, step: n, why, trail };
        continue;
      }
      const a = gen(r, v, n);
      trail.push(label(a));
      m = model.step(m, a, now);
      if (ahead) { const x = aheadOf(model, r2, m, now); m = x.m; if (x.ahead) trail.push(`stored ${x.ahead.kind}`); }
      m = model.step(m, { type: 'rollover', stored: [] }, now);
      const why = broken(v, a, model.view(m)) ?? extra?.(m) ?? null;
      if (why) return { seed, step: n, why, trail };
    }
  }
  return null;
}
/** What the comparison compares; the toggle only while planning (see the header). */
// The key is JSON.stringify of [screen, back, day, the store by date, notified, small], built from parts: each day's JSON
// is kept per day object (a day is never changed in place), and two views are compared part by part, so an unchanged
// store is neither written out nor joined again at every step.
const json = new WeakMap<L.Day, string>();
const dayJson = (d: L.Day) => { let j = json.get(d); if (j === undefined) json.set(d, (j = JSON.stringify(d))); return j; };
const parts = (w: View) => [JSON.stringify([w.screen, w.back]).slice(1, -1), dayJson(w.day), `[${w.store.length}`,
  ...[...w.store].sort((x, y) => (x.date < y.date ? -1 : 1)).map(dayJson), JSON.stringify([w.notified, PLANNING.includes(w.under ?? w.screen) ? w.small : null]).slice(1, -1)];
export const key = (w: View) => { const [head, day, , ...rest] = parts(w); const tail = rest.pop(); return `[${head},${day},[${rest.join(',')}],${tail}]`; };
export const sameView = (v: View, w: View) => { const a = parts(v), b = parts(w); return a.length === b.length && a.every((x, i) => x === b[i]); };
export const show = (f: Found | null) => (f ? `seed ${f.seed}, step ${f.step}: ${f.why}\n  after ${f.trail.join(' > ')}` : 'none');