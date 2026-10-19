// Seeded random action sequences over the screen state (BG-1). No new dependency: a small PRNG (mulberry32).
// Three parts:
//  (a) the App.tsx before this reducer (8f5dbaa, "the old App.tsx" below) written out as a model over logic.ts
//      (`legacyStep`): its handlers, then its effects in their order, each effect running when its dependencies changed,
//      as React runs them. Switches leave out each repair (validChoice on item edits and on Start, screenForBlock,
//      clearing the overlay stack, settling in an effect);
//  (b) the reducer in state.ts against the same invariants, with any action at any time (no UI gating) and UI-gated;
//  (c) the reducer inside a model of the new App.tsx (`app`: the rollover check that saves the day being left, the first
//      tick, the notification) and the model of the old App.tsx fed the same UI-gated sequences, compared after every
//      action and again after every interval check: same screen, same way back from the overlays, same Day JSON, same
//      stored days, same number of "block done" notifications, and the same toggle while planning.
// The UI-gated sequences come in two mixes (see Mix): UNIFORM, the first one, which the pinned seeds depend on, and
// WEIGHTED, which reaches the block, Close and midnight often enough that the weighted comparison asserts how often each
// action changed the state and each screen was on show. In (b) and (c) another tab sometimes saved a record for the new
// date before the check after midnight (aheadOf), so the rollover has to open it.
// The comparison proves the reducer equals the MODEL of the old App.tsx, not the old App.tsx itself: a mistake in the
// model would hide a change.
// `small` is compared only on the planning screens: the reducer drops the toggle once a block starts, the old App.tsx
// kept it through the block, Close and Closed, but every way back to planning (a new day, Start today over, a reload)
// resets it.
// Without its repairs the model reaches the 6ef125f state "End block leaves the user on the timer" first at seed 82,
// step 21, and without validChoice alone a stale choice at seed 38359, step 31; both are asserted. REPLAY=1 also runs the
// invariants as a must-pass check on the model without its repairs, which fails on seed 82, step 21. SEEDS=100000 widens

import * as L from '../logic';
import * as S from '../state';

export const SEQUENCES = 5000;
export const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
export const SEEDS = Number(ENV.SEEDS ?? SEQUENCES);
export const MAX_LEN = 40;
const BASE_SCREENS = ['welcome', 'name', 'ask', 'pick', 'block', 'close', 'closed'] as const;
export const PLANNING = ['welcome', 'name', 'ask', 'pick'];
const OVERLAYS = ['about', 'days'] as const;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rnd = () => number;
export const pickOf = <T,>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

// ---------- a view every model can be read through ----------
/** `back` is the way Done goes back: the day screen under the overlays, then each overlay opened before this one. */
export type View = { screen: string; day: L.Day; small: boolean; under: string | null; back: string[]; store: L.Day[]; notified: number };
export const MIN = 60_000;
// time moves in uneven steps: seconds, a short break, a broken break, hours (a block's end, midnight)
const STEPS = [0, 1000, 30_000, 5 * MIN, 11 * MIN, 60 * MIN, 3 * 60 * MIN, 20 * 60 * MIN];
const WEIGHTS = [20, 30, 20, 10, 6, 8, 5, 1]; // mostly seconds, so a sequence gets through a whole day before midnight
export function dt(r: Rnd): number {
  let x = r() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < STEPS.length; i++) { x -= WEIGHTS[i]; if (x < 0) return STEPS[i]; }
  return 0;
}
const TEXTS = ['Taxes', 'Ask for the raise', 'Call mom', 'taxes ', 'Write the essay', 'Quit', ''];
const TAGS: L.Tag[] = ['pushed', 'risky', 'anxious'];
export const LENGTHS = { any: [60, 90, 120, 150, 180, 7], small: [60, 90, 120], full: [120, 150, 180] };

/** An item edit as the Name screen makes one: add or tag (`add` of the time), untag, remove. Half the removals and untags
 *  hit the chosen item. */
export function editItems(r: Rnd, items: L.Item[], n: number, chosenId: string | null = null, add = 0.6): L.Item[] {
  const k = r();
  if (k < add || !items.length) return L.addOrTag(items, pickOf(r, TEXTS), pickOf(r, TAGS), `i${n}`).items;
  const it = (r() < 0.5 && items.find((i) => i.id === chosenId)) || pickOf(r, items);
  if (k < 0.8) return items.filter((i) => L.norm(i.text) !== L.norm(it.text));
  return L.removeTag(items, it.id, pickOf(r, TAGS));
}

/** A generator of the next action. */
export type Gen = (r: Rnd, v: View, n: number) => S.Action;

/** Any action at all, ids included that are on no list: the reducer has to hold on its own. */
export function anyAction(r: Rnd, v: View, n: number): S.Action {
  const ids = [...v.day.items.map((i) => i.id), 'nope'];
  switch (Math.floor(r() * 21)) {
    case 0: return { type: 'start' };
    case 1: return { type: 'setSmall', small: r() < 0.5 };
    case 2: return { type: 'editItems', items: editItems(r, v.day.items, n, v.day.chosenId) };
    case 3: return { type: 'namingDone' };
    case 4: return { type: 'answer', id: pickOf(r, ids), field: r() < 0.5 ? 'satisfied' : 'leverage', value: r() < 0.6 };
    case 5: return { type: 'askDone' };
    case 6: return { type: 'stepBack' };
    case 7: return { type: 'choose', id: pickOf(r, ids) };
    case 8: return { type: 'startBlock', min: pickOf(r, LENGTHS.any) };
    case 9: return { type: 'pause' };
    case 10: return { type: 'resume' };
    case 11: return { type: 'drift' };
    case 12: return { type: 'stop' };
    case 13: return { type: 'tick' };
    case 14: return { type: 'didIt', didIt: r() < 0.5 };
    case 15: return { type: 'closeDay' };
    case 16: return { type: 'startOver' };
    case 17: return { type: 'open', to: pickOf(r, OVERLAYS) };
    case 18: return { type: 'back' };
    case 19: return { type: 'rollover', stored: [] };
    default: return { type: 'otherTabClosed', theirs: { ...v.day, closed: true, openedAt: v.day.openedAt + (r() < 0.8 ? 0 : -1) } };
  }
}

/** How the UI-gated generator weighs what a screen offers. UNIFORM is the first distribution and stays as it is: the
 *  invariants runs, the pinned per-repair seeds (seed 82, seed 38359) and the first comparison use it, and changing it
 *  moves those seeds. It spends most steps on Welcome, Name and the overlays (another tab closes the day 5% of the time,
 *  `open` weighs as much as a screen's own buttons, and Name offers two item edits), so it rarely reaches a block.
 *  WEIGHTED gets sequences through Pick, the block, Close, Closed and midnight: another tab closes the day 0.5% of the
 *  time, a screen's own buttons weigh 3 against 1 for opening an overlay and 1 for Back on Name and Ask, Name offers one
 *  item edit, and an edit adds an item 80% of the time. */
type Mix = { otherTab: number; own: number; open: number; stepBack: number; edits: number; add: number };
const UNIFORM: Mix = { otherTab: 0.05, own: 1, open: 1, stepBack: 1, edits: 2, add: 0.6 };
const WEIGHTED: Mix = { otherTab: 0.005, own: 3, open: 1, stepBack: 1, edits: 1, add: 0.8 };

/** Only what the screen on show offers, and only when its button is enabled (the App.tsx before this reducer relies on this). */
const gated = (mix: Mix): Gen => (r, v, n) => {
  const opts: { f: () => S.Action | null; w: number }[] = [];
  const d = v.day;
  const b = d.block;
  const add = (...fs: (() => S.Action | null)[]) => opts.push(...fs.map((f) => ({ f, w: mix.own })));
  const back = () => opts.push({ f: () => ({ type: 'stepBack' }), w: mix.stepBack });
  const open = (to: S.OverlayName) => opts.push({ f: () => ({ type: 'open', to }), w: mix.open });
  const edit = () => ({ type: 'editItems' as const, items: editItems(r, d.items, n, d.chosenId, mix.add) });
  // focus or visibility: another tab may have closed this day (or saved nothing for it). A tab closes a day only from
  // Close, so its copy never has a running block (that exists only in a hand-edited store: see the example test below)
  if (r() < mix.otherTab) return { type: 'otherTabClosed', theirs: r() < 0.5 ? { ...d, block: b && b.endedAt == null ? L.stop(b, b.startedAt) : b, closed: true } : undefined };
  switch (v.screen) {
    case 'welcome': add(() => ({ type: 'start' }), () => ({ type: 'setSmall', small: r() < 0.5 })); open('about'); break;
    case 'name': add(...Array.from({ length: mix.edits }, () => edit), () => (L.filled(d.items).length ? { type: 'namingDone' } : null)); back(); open('about'); break;
    case 'ask': {
      const items = L.filled(d.items);
      add(() => { const it = pickOf(r, items); return it ? { type: 'answer', id: it.id, field: r() < 0.5 ? 'satisfied' : 'leverage', value: r() < 0.6 } : null; },
        () => (L.allAnswered(d.items) ? { type: 'askDone' } : null));
      back();
      open('about');
      break;
    }
    case 'pick': {
      const list = L.pickOrder(d.items);
      add(() => (list.length ? { type: 'choose', id: pickOf(r, list).id } : null), () => (list.length ? null : { type: 'stepBack' }),
        () => (L.validChoice(d.items, d.chosenId) ? { type: 'startBlock', min: pickOf(r, v.small ? LENGTHS.small : LENGTHS.full) } : null));
      open('about');
      break;
    }
    case 'block':
      add(() => (b && L.canPause(b) ? { type: 'pause' } : null), () => (b?.pausedAt != null ? { type: 'resume' } : null),
        () => (b?.pausedAt == null ? { type: 'drift' } : null), () => ({ type: 'stop' }), () => ({ type: 'tick' }), () => ({ type: 'tick' }));
      open('about');
      break;
    case 'close': add(() => ({ type: 'didIt', didIt: r() < 0.5 }), () => (d.didIt !== null ? { type: 'closeDay' } : null)); open('about'); open('days'); break;
    case 'closed': add(() => ({ type: 'startOver' })); open('days'); open('about'); break;
    case 'about': add(() => ({ type: 'back' })); open('days'); break;
    case 'days': add(() => ({ type: 'back' })); break;
  }
  const total = opts.reduce((x, o) => x + o.w, 0);
  for (;;) {
    let x = r() * total;
    const o = opts.find((p) => (x -= p.w) < 0) ?? opts[opts.length - 1];
    const a = o.f();
    if (a) return a;
  }
};
export const uiAction = gated(UNIFORM);
export const uiWeighted = gated(WEIGHTED);

// ---------- the invariants ----------
/** The first broken invariant, or null. `prev` and `action` are the step that led here. */
export function broken(prev: View | null, action: S.Action | null, v: View): string | null {
  const d = v.day;
  const screen = v.under ?? v.screen;
  if (v.under != null && !(BASE_SCREENS as readonly string[]).includes(v.under)) return `overlay ${v.screen} returns to "${v.under}", not a day screen`;
  if (!([...BASE_SCREENS, ...OVERLAYS] as readonly string[]).includes(v.screen)) return `unknown screen "${v.screen}"`;
  if (screen === 'block') {
    if (!d.block || d.block.endedAt != null) return `block screen without a running block (block ${d.block ? `ended: ${d.block.endReason}` : 'null'})`;
    if (!d.items.some((i) => i.id === d.chosenId)) return `block screen with no chosen item (chosenId ${d.chosenId})`;
  }
  if (PLANNING.includes(screen)) {
    if (d.block || d.closed) return `${screen} on a day with a block or closed`;
    if (d.chosenId != null && !L.pickOrder(d.items).some((i) => i.id === d.chosenId)) return `before a block, chosen item ${d.chosenId} is not in the pick list`;
  }
  if (screen === 'ask' && L.filled(d.items).length === 0) return 'ask with no item to show (blank screen)';
  if (screen === 'close' && (!d.block || d.block.endedAt == null)) return 'close without an ended block';
  if (screen === 'closed' && !d.closed) return 'closed screen on an open day';
  if (prev && action && prev.day.closed && prev.day.date === d.date && prev.day.openedAt === d.openedAt && prev.day.items !== d.items && JSON.stringify(prev.day.items) !== JSON.stringify(d.items))
    return `a closed day accepted an item edit (${action.type})`;
  return null;
}
/** The reducer's own state: what only the types promised, checked at run time too. */
export function brokenState(s: S.State): string | null {
  const b = S.base(s);
  if (S.isOverlay(b)) return 'an overlay under an overlay';
  if (S.isOverlay(s) && s.prev.some((p) => !(OVERLAYS as readonly string[]).includes(p))) return `overlay way back holds a day screen (${s.prev.join(', ')})`;
  if (('small' in b) !== PLANNING.includes(b.screen)) return `small on ${b.screen}`;
  if (b.screen === 'pick') {
    if (JSON.stringify(b.list) !== JSON.stringify(L.pickOrder(b.day.items))) return 'pick list is not pickOrder(items)';
    if (b.chosen ? !b.list.includes(b.chosen) || b.day.chosenId !== b.chosen.id : b.day.chosenId !== null) return `pick chosen ${b.chosen?.id ?? null} and day.chosenId ${b.day.chosenId} disagree`;
  }
  if (('opensAt' in b) !== (b.screen === 'name' || b.screen === 'ask')) return `opensAt on ${b.screen}`;
  if (S.isOverlay(s) && (s.under.screen === 'name' || s.under.screen === 'ask') && s.under.opensAt !== 'first') return `an overlay goes back to ${s.under.screen} on its last step (it remounts on its first)`;
  if (b.screen === 'block' && !S.isRunning(b.day)) return 'block screen without a running day';
  if (b.screen === 'close' && !S.isEnded(b.day)) return 'close without an ended day';
  if (b.screen === 'closed' && !S.isClosed(b.day)) return 'closed without a closed day';
  return null;
}
/** One reducer step: Name opens on its last step exactly when Back from Ask's first item brought the user there, and Ask
 *  on its last item exactly when Look again on Pick did (an item edit on Name, an answer on Ask keeps it). */
export function brokenStep(prev: S.State, a: S.Action, next: S.State): string | null {
  for (const [screen, from] of [['name', 'ask'], ['ask', 'pick']] as const) {
    const last = (x: S.State) => x.screen === screen && x.opensAt === 'last';
    if (prev.screen === from && a.type === 'stepBack' && !last(next)) return `stepBack on ${from} opens ${next.screen}, not ${screen} on its last step`;
    if (last(next) && !(prev.screen === from && a.type === 'stepBack') && !last(prev)) return `${screen} opens on its last step after ${a.type} on ${prev.screen}`;
  }
  return null;
}
