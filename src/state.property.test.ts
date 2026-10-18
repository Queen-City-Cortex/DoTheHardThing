// Seeded random action sequences over the screen state (BG-1). No new dependency: a small PRNG (mulberry32).
// Three parts:
//  (a) master's App.tsx (8f5dbaa) written out as a model over logic.ts (`legacyStep`): its handlers, then its effects in
//      their order, each effect running when its dependencies changed, as React runs them. Switches leave out each repair
//      (validChoice on item edits and on Start, screenForBlock, clearing the overlay stack, settling in an effect);
//  (b) the reducer in state.ts against the same invariants, with any action at any time (no UI gating) and UI-gated;
//  (c) the reducer inside a model of the new App.tsx (`appStep`: the rollover check that saves the day being left, the
//      first tick, the notification) and the model of master fed the same UI-gated sequences, compared after every action
//      and again after every interval check: same screen, same way back from the overlays, same Day JSON, same stored days,
//      same number of "block done" notifications, and the same toggle while planning.
// The comparison proves the reducer equals the MODEL of master, not master itself: a mistake in the model would hide a change.
// `small` is compared only on the planning screens: the reducer drops the toggle once a block starts, master keeps it
// through the block, Close and Closed, but every way back to planning (a new day, Start today over, a reload) resets it.
// REPLAY=1 also runs the invariants as a must-pass check on the model without its repairs: it fails, on the
// 6ef125f state "End block leaves the user on the timer" (seed 82, step 21). SEEDS=100000 widens the per-repair search.
import { describe, expect, it } from 'vitest';
import * as L from './logic';
import * as S from './state';

const SEQUENCES = 5000;
const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SEEDS = Number(ENV.SEEDS ?? SEQUENCES);
const MAX_LEN = 40;
const BASE_SCREENS = ['welcome', 'name', 'ask', 'pick', 'block', 'close', 'closed'] as const;
const PLANNING = ['welcome', 'name', 'ask', 'pick'];
const OVERLAYS = ['about', 'days'] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rnd = () => number;
const pickOf = <T,>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

// ---------- a view every model can be read through ----------
/** `back` is the way Done goes back: the day screen under the overlays, then each overlay opened before this one. */
type View = { screen: string; day: L.Day; small: boolean; under: string | null; back: string[]; store: L.Day[]; notified: number };
const MIN = 60_000;
// time moves in uneven steps: seconds, a short break, a broken break, hours (a block's end, midnight)
const STEPS = [0, 1000, 30_000, 5 * MIN, 11 * MIN, 60 * MIN, 3 * 60 * MIN, 20 * 60 * MIN];
const WEIGHTS = [20, 30, 20, 10, 6, 8, 5, 1]; // mostly seconds, so a sequence gets through a whole day before midnight
function dt(r: Rnd): number {
  let x = r() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < STEPS.length; i++) { x -= WEIGHTS[i]; if (x < 0) return STEPS[i]; }
  return 0;
}
const TEXTS = ['Taxes', 'Ask for the raise', 'Call mom', 'taxes ', 'Write the essay', 'Quit', ''];
const TAGS: L.Tag[] = ['pushed', 'risky', 'anxious'];
const LENGTHS = { any: [60, 90, 120, 150, 180, 7], small: [60, 90, 120], full: [120, 150, 180] };

/** An item edit as the Name screen makes one: add or tag, untag, remove. Half the removals and untags hit the chosen item. */
function editItems(r: Rnd, items: L.Item[], n: number, chosenId: string | null = null): L.Item[] {
  const k = r();
  if (k < 0.6 || !items.length) return L.addOrTag(items, pickOf(r, TEXTS), pickOf(r, TAGS), `i${n}`).items;
  const it = (r() < 0.5 && items.find((i) => i.id === chosenId)) || pickOf(r, items);
  if (k < 0.8) return items.filter((i) => L.norm(i.text) !== L.norm(it.text));
  return L.removeTag(items, it.id, pickOf(r, TAGS));
}

/** Any action at all, ids included that are on no list: the reducer has to hold on its own. */
function anyAction(r: Rnd, v: View, n: number): S.Action {
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

/** Only what the screen on show offers, and only when its button is enabled (master's App relies on this). */
function uiAction(r: Rnd, v: View, n: number): S.Action {
  const opts: (() => S.Action | null)[] = [];
  const d = v.day;
  const b = d.block;
  const add = (...fs: (() => S.Action | null)[]) => opts.push(...fs);
  // focus or visibility: another tab may have closed this day (or saved nothing for it). A tab closes a day only from
  // Close, so its copy never has a running block (that exists only in a hand-edited store: see the example test below)
  if (r() < 0.05) return { type: 'otherTabClosed', theirs: r() < 0.5 ? { ...d, block: b && b.endedAt == null ? L.stop(b, b.startedAt) : b, closed: true } : undefined };
  switch (v.screen) {
    case 'welcome': add(() => ({ type: 'start' }), () => ({ type: 'setSmall', small: r() < 0.5 }), () => ({ type: 'open', to: 'about' })); break;
    case 'name': add(() => ({ type: 'editItems', items: editItems(r, d.items, n, d.chosenId) }), () => ({ type: 'editItems', items: editItems(r, d.items, n, d.chosenId) }),
      () => (L.filled(d.items).length ? { type: 'namingDone' } : null), () => ({ type: 'stepBack' }), () => ({ type: 'open', to: 'about' })); break;
    case 'ask': {
      const items = L.filled(d.items);
      add(() => { const it = pickOf(r, items); return it ? { type: 'answer', id: it.id, field: r() < 0.5 ? 'satisfied' : 'leverage', value: r() < 0.6 } : null; },
        () => (L.allAnswered(d.items) ? { type: 'askDone' } : null), () => ({ type: 'stepBack' }), () => ({ type: 'open', to: 'about' }));
      break;
    }
    case 'pick': {
      const list = L.pickOrder(d.items);
      add(() => (list.length ? { type: 'choose', id: pickOf(r, list).id } : null), () => (list.length ? null : { type: 'stepBack' }),
        () => (L.validChoice(d.items, d.chosenId) ? { type: 'startBlock', min: pickOf(r, v.small ? LENGTHS.small : LENGTHS.full) } : null),
        () => ({ type: 'open', to: 'about' }));
      break;
    }
    case 'block':
      add(() => (b && L.canPause(b) ? { type: 'pause' } : null), () => (b?.pausedAt != null ? { type: 'resume' } : null),
        () => (b?.pausedAt == null ? { type: 'drift' } : null), () => ({ type: 'stop' }), () => ({ type: 'tick' }), () => ({ type: 'tick' }), () => ({ type: 'open', to: 'about' }));
      break;
    case 'close': add(() => ({ type: 'didIt', didIt: r() < 0.5 }), () => (d.didIt !== null ? { type: 'closeDay' } : null),
      () => ({ type: 'open', to: 'about' }), () => ({ type: 'open', to: 'days' })); break;
    case 'closed': add(() => ({ type: 'startOver' }), () => ({ type: 'open', to: 'days' }), () => ({ type: 'open', to: 'about' })); break;
    case 'about': add(() => ({ type: 'back' }), () => ({ type: 'open', to: 'days' })); break;
    case 'days': add(() => ({ type: 'back' })); break;
  }
  for (;;) { const a = pickOf(r, opts)(); if (a) return a; }
}

// ---------- the invariants ----------
/** The first broken invariant, or null. `prev` and `action` are the step that led here. */
function broken(prev: View | null, action: S.Action | null, v: View): string | null {
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
function brokenState(s: S.State): string | null {
  const b = S.base(s);
  if (S.isOverlay(b)) return 'an overlay under an overlay';
  if (S.isOverlay(s) && s.prev.some((p) => !(OVERLAYS as readonly string[]).includes(p))) return `overlay way back holds a day screen (${s.prev.join(', ')})`;
  if (('small' in b) !== PLANNING.includes(b.screen)) return `small on ${b.screen}`;
  if (b.screen === 'pick') {
    if (JSON.stringify(b.list) !== JSON.stringify(L.pickOrder(b.day.items))) return 'pick list is not pickOrder(items)';
    if (b.chosen ? !b.list.includes(b.chosen) || b.day.chosenId !== b.chosen.id : b.day.chosenId !== null) return `pick chosen ${b.chosen?.id ?? null} and day.chosenId ${b.day.chosenId} disagree`;
  }
  if (b.screen === 'block' && !S.isRunning(b.day)) return 'block screen without a running day';
  if (b.screen === 'close' && !S.isEnded(b.day)) return 'close without an ended day';
  if (b.screen === 'closed' && !S.isClosed(b.day)) return 'closed without a closed day';
  return null;
}

// ---------- (a) master's App.tsx at 8f5dbaa, as a model over logic.ts ----------
// The store is modeled as App kept it (store.days): every shown day is put into it, and a rollover puts the day being left.
const putDay = (days: L.Day[], d: L.Day) => L.putDay({ days, archive: {} }, d).days;
const keyOf = (now: number) => L.dayKey(new Date(now));
const overlay = (s: string) => s === 'about' || s === 'days';
function resumeScreen(d: L.Day): string {
  if (d.closed) return 'closed';
  if (d.block && d.block.endedAt == null) return 'block';
  if (d.block) return 'close';
  return 'welcome';
}
/** master's L.screenForBlock at 8f5dbaa (the repair from 6ef125f). This change removes it from logic.ts: the block screen
 *  type cannot hold an ended block, so the reducer never needs it. */
function screenForBlock(screen: string, block: L.Block | null): string {
  if (screen !== 'block') return screen;
  if (!block) return 'pick';
  return block.endedAt != null ? 'close' : screen;
}
// master passed the screen as a string, overlay names included (About over a block passes 'about'); logic.ts now takes
// only a day screen. An overlay name falls through to `day.block == null`, which is what the day screen under it gives.
const masterShouldRollOver = (day: L.Day, screen: string, now: number) => L.shouldRollOver(day, screen as L.DayScreen, now);

type Repairs = { validChoice: boolean; screenForBlock: boolean; stack: boolean };
const ALL: Repairs = { validChoice: true, screenForBlock: true, stack: true };
/** The 0fd3abe logic: no validChoice (Start was `disabled={!day.chosenId}`), no screenForBlock, no stack clearing. */
const NONE: Repairs = { validChoice: false, screenForBlock: false, stack: false };
/** What each effect saw when it last ran, so it runs again only when its dependencies changed (as React runs it). */
type Seen = { day: L.Day; screen: string; store: L.Day[]; now: number; block: L.Block | null };
type Legacy = { screen: string; stack: string[]; day: L.Day; small: boolean; now: number; store: L.Day[]; notified: number; seen: Seen | null };

/** One user action, tick or check in master's App.tsx, then the effects that follow it until nothing changes. `at` is
 *  clockNow() at the handler; the effects' check reads the clock again (the same instant here). */
function legacyStep(m: Legacy, a: S.Action, at: number, fix: Repairs): Legacy {
  let { screen, stack, day, small, now, store } = m;
  // before a block starts, drop a choice that is no longer in the pick list (master's withItems)
  const withItems = (d: L.Day, items: L.Item[]): L.Day => ({ ...d, items, chosenId: d.block || !fix.validChoice ? d.chosenId : L.validChoice(items, d.chosenId) });
  // master's rollOver: `next` from the store as this render has it; save and put `from`; a new day starts without the toggle
  const rollOver = (from: L.Day) => {
    const date = keyOf(at);
    const next = store.find((d) => d.date === date) ?? L.newDay(date, at);
    store = putDay(store, from);
    day = next; small = false;
    if (overlay(screen)) stack = [resumeScreen(next)]; else screen = resumeScreen(next);
  };
  // BlockView's set: setNow(at), then the block and its automatic answer
  const set = (b: L.Block) => { now = at; day = { ...day, block: b, gotBlock: L.autoGotBlock(b, at, day.gotBlock) }; };
  const chosen = day.items.find((i) => i.id === day.chosenId);
  switch (a.type) {
    case 'start': if (screen === 'welcome') screen = 'name'; break;
    case 'setSmall': if (screen === 'welcome') small = a.small; break;
    case 'editItems': if (screen === 'name') day = withItems(day, a.items); break; // upd({ items })
    case 'namingDone': if (screen === 'name') { day = withItems(day, L.guidedOrder(L.filled(day.items))); screen = 'ask'; } break;
    case 'answer': if (screen === 'ask') day = withItems(day, day.items.map((i) => (i.id === a.id ? { ...i, [a.field]: a.value } : i))); break; // setItem
    case 'askDone': if (screen === 'ask') screen = 'pick'; break;
    case 'stepBack': if (screen === 'name') screen = 'welcome'; else if (screen === 'ask') screen = 'name'; else if (screen === 'pick') screen = 'ask'; break;
    case 'choose': if (screen === 'pick') day = { ...day, chosenId: a.id }; break; // upd({ chosenId })
    case 'startBlock': // Pick onStart, behind `disabled={!L.validChoice(day.items, day.chosenId)}`
      if (screen === 'pick' && (fix.validChoice ? L.validChoice(day.items, day.chosenId) : day.chosenId)) { now = at; day = { ...day, block: L.startBlock(a.min, at, small), gotBlock: null }; screen = 'block'; }
      break;
    case 'pause': if (screen === 'block' && day.block) set(L.pause(day.block, at)); break;
    case 'resume': if (screen === 'block' && day.block) set(L.resume(day.block, at)); break;
    case 'drift': if (screen === 'block' && day.block) set(L.drift(day.block, at)); break;
    case 'stop': if (screen === 'block' && day.block) set(L.stop(day.block, at)); break;
    case 'tick': if (screen === 'block') now = at; break; // the timer runs only on the block screen
    case 'didIt': if (screen === 'close') day = { ...day, didIt: a.didIt, doneText: a.didIt ? chosen?.text ?? null : null }; break; // onAnswer
    case 'closeDay': // Close onDone: a day carried past midnight moves straight on to the real today, in this handler
      if (screen === 'close') { const closed = { ...day, closed: true }; if (masterShouldRollOver(closed, 'closed', at)) rollOver(closed); else { day = closed; screen = 'closed'; } }
      break;
    case 'startOver': if (screen === 'closed') { day = L.newDay(keyOf(at), at); small = false; screen = 'welcome'; } break;
    case 'open': stack = [...stack, screen]; screen = a.to; break; // the header About, See your days, Your days on About
    case 'back': if (overlay(screen)) { screen = stack[stack.length - 1] ?? resumeScreen(day); stack = stack.slice(0, -1); } break;
    case 'rollover': if (masterShouldRollOver(day, screen, at)) rollOver(day); break; // the interval, focus or visibility check
    case 'otherTabClosed': if (a.theirs && L.supersedes(a.theirs, day)) { day = a.theirs; if (overlay(screen)) stack = ['closed']; else screen = 'closed'; } break; // pull
  }
  return legacyEffects({ ...m, screen, stack, day, small, now, store }, at, fix);
}
/** master's effects, in App.tsx order, each when its dependencies changed. Each reads the committed render and sets state
 *  for the next one, so they run in rounds until a render changes nothing. */
function legacyEffects(m: Legacy, at: number, fix: Repairs): Legacy {
  let { screen, stack, day, small, store, notified, seen } = m;
  const { now } = m;
  for (let round = 0; ; round++) {
    if (round > 10) throw new Error('master model: effects never settle');
    const r0 = { day, screen, store, now, block: day.block };
    const changed = (k: keyof Seen) => !seen || seen[k] !== r0[k];
    if (seen && !(['day', 'screen', 'store', 'now', 'block'] as const).some(changed)) break;
    if (changed('day')) store = putDay(store, r0.day); // setStore((st) => putDay(st, day))
    // the date check, [day, screen, rollOver] (rollOver changes with store and screen)
    if (changed('day') || changed('screen') || changed('store')) {
      if (masterShouldRollOver(r0.day, r0.screen, at)) {
        const date = keyOf(at);
        const next = r0.store.find((d) => d.date === date) ?? L.newDay(date, at);
        store = putDay(store, r0.day);
        day = next; small = false;
        if (overlay(r0.screen)) stack = [resumeScreen(next)]; else screen = resumeScreen(next);
      }
    }
    if (fix.stack && changed('screen') && !overlay(r0.screen)) stack = []; // leaving the overlays forgets where they were opened from
    // settle, [now, day.block]: on any screen, with the `now` of the last tick or block action
    if ((changed('now') || changed('block')) && r0.block && r0.block.endedAt == null) {
      const b = L.settle(r0.block, r0.now);
      if (b !== r0.block) {
        day = { ...day, block: b, gotBlock: L.autoGotBlock(b, r0.now, day.gotBlock) };
        if (b.endReason === 'complete') notified++;
        screen = 'close';
      }
    }
    // a stopped or broken block (or none at all) never leaves us on the block screen, [screen, day.block]
    if (fix.screenForBlock && (changed('screen') || changed('block'))) { const s = screenForBlock(r0.screen, r0.block); if (s !== r0.screen) screen = s; }
    seen = r0;
  }
  return { screen, stack, day, small, now, store, notified, seen };
}
// master's first render: activeDay, else a new day, on its resumeScreen; the effects then run once (the settle effect
// settles a running block at the first render's now)
const legacyInit = (fix: Repairs) => (now: number, stored: L.Day[]): Legacy => {
  const day = L.activeDay(stored, now).day ?? L.newDay(keyOf(now), now);
  return legacyEffects({ screen: resumeScreen(day), stack: [], day, small: false, now, store: stored, notified: 0, seen: null }, now, fix);
};
const legacyView = (m: Legacy): View => ({ screen: m.screen, day: m.day, small: m.small, under: overlay(m.screen) ? m.stack[0] ?? resumeScreen(m.day) : null,
  back: overlay(m.screen) ? m.stack : [], store: m.store, notified: m.notified });
const legacy = (fix: Repairs): Model<Legacy> => ({ init: legacyInit(fix), view: legacyView, step: (m, a, at) => legacyStep(m, a, at, fix) });

// ---------- the reducer, alone and inside a model of the new App.tsx ----------
const stateView = (s: S.State, store: L.Day[] = [], notified = 0): View => {
  const b = S.base(s);
  return { screen: s.screen, day: b.day, small: 'small' in b ? b.small : false, under: S.isOverlay(s) ? b.screen : null,
    back: S.isOverlay(s) ? [b.screen, ...s.prev] : [], store, notified };
};
/** The reducer alone: the store is every day it showed, and a rollover reads it. */
type Bare = { s: S.State; store: L.Day[] };
const bare: Model<Bare> = {
  init: (now, stored) => ({ s: S.init(stored, now), store: stored }),
  view: (m) => stateView(m.s, m.store),
  step: (m, a, at) => {
    const s = S.reduce(m.s, a.type === 'rollover' ? { ...a, stored: m.store } : a, at);
    return { s, store: putDay(m.store, S.dayOf(s)) };
  },
};
/** What App.tsx does around the reducer: send() runs it at `at`; then, as React commits, the rollover check (a layout
 *  effect on day, the day screen, store and screen: it saves the day being left, then sends `rollover`), the store put
 *  ([day]) and the notification ([state], through S.completed). On opening, one `tick`. */
type AppM = { s: S.State; store: L.Day[]; notified: number; seen: { day: L.Day; under: string; screen: string; store: L.Day[] } | null; last: S.State };
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
const app: Model<AppM> = {
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
};

// ---------- runner ----------
type Model<M> = { init: (now: number, stored: L.Day[]) => M; view: (m: M) => View; step: (m: M, a: S.Action, at: number) => M };
const T0 = new Date('2026-10-14T06:00:00').getTime();
/** A reload: the app starts again from what is stored. */
const RELOAD = 0.04;
type Found = { seed: number; step: number; why: string; trail: string[] };
const label = (a: S.Action) => (a.type === 'editItems' ? `editItems(${a.items.map((i) => i.text).join('|')})` : a.type);
/** Runs `seeds` seeded sequences of one model; after every step the interval check runs (master checks every minute and on focus). */
function run<M>(model: Model<M>, gen: (r: Rnd, v: View, n: number) => S.Action, seeds = SEQUENCES, extra?: (m: M) => string | null): Found | null {
  for (let seed = 1; seed <= seeds; seed++) {
    const r = mulberry32(seed);
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
      m = model.step(model.step(m, a, now), { type: 'rollover', stored: [] }, now);
      const why = broken(v, a, model.view(m)) ?? extra?.(m) ?? null;
      if (why) return { seed, step: n, why, trail };
    }
  }
  return null;
}
/** What the comparison compares; the toggle only while planning (see the header). */
const key = (w: View) => JSON.stringify([w.screen, w.back, w.day, [...w.store].sort((x, y) => (x.date < y.date ? -1 : 1)), w.notified, PLANNING.includes(w.under ?? w.screen) ? w.small : null]);
const show = (f: Found | null) => (f ? `seed ${f.seed}, step ${f.step}: ${f.why}\n  after ${f.trail.join(' > ')}` : 'none');

describe('BG-1 invariants, master\'s App.tsx (model over logic.ts)', () => {
  it('with its repairs, UI-gated: no invalid state in 5000 sequences', () => {
    expect(show(run(legacy(ALL), uiAction))).toBe('none');
  });
  it('with its repairs, ungated (an action the screen does not offer): reaches an invalid state', () => {
    const f = run(legacy(ALL), anyAction);
    console.log('[legacy, repairs, ungated] first invalid state:', show(f));
    expect(f).not.toBeNull();
  });
  it('without the repairs (0fd3abe logic), UI-gated: reaches an invalid state', () => {
    const f = run(legacy(NONE), uiAction);
    console.log('[legacy, no repairs] first invalid state:', show(f));
    expect(f).not.toBeNull();
  });
  it('logs what each repair, left out on its own, lets through', () => {
    for (const k of ['validChoice', 'screenForBlock', 'stack'] as const) console.log(`[legacy, without ${k}] first invalid state:`, show(run(legacy({ ...ALL, [k]: false }), uiAction, SEEDS)));
  });
  it.runIf(ENV.REPLAY)('REPLAY: the invariants as a must-pass check on the 0fd3abe logic (expected to fail)', () => {
    expect(show(run(legacy(NONE), uiAction))).toBe('none');
  });
});

describe('BG-1 invariants, the reducer (state.ts)', () => {
  it('any action at any time: no invalid state in 5000 sequences', () => {
    expect(show(run(bare, anyAction, SEEDS, (m) => brokenState(m.s)))).toBe('none');
  });
  it('UI-gated, inside the model of App.tsx: no invalid state in 5000 sequences', () => {
    expect(show(run(app, uiAction, SEEDS, (m) => brokenState(m.s)))).toBe('none');
  });

  const go = (s: S.State, as: S.Action[], at = T0) => as.reduce((x, a) => S.reduce(x, a, at), s);
  const two = () => L.addOrTag(L.addOrTag([], 'Taxes', 'risky', 'a').items, 'Call mom', 'risky', 'b').items;
  const yes = (id: string): S.Action[] => [{ type: 'answer', id, field: 'satisfied', value: true }, { type: 'answer', id, field: 'leverage', value: true }];
  const toPick = (s: S.State) => go(s, [{ type: 'start' }, { type: 'editItems', items: two() }, { type: 'namingDone' }, ...yes('a'), ...yes('b'), { type: 'askDone' }]);

  it('a stale choice after a reload (0fd3abe): a choice made, reloaded, then edited away is dropped, so Start stays off', () => {
    let s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }]);
    expect(S.dayOf(s).chosenId).toBe('a');
    s = S.init([S.dayOf(s)], T0); // reload: Welcome, with the stored choice
    expect(S.dayOf(s).chosenId).toBe('a'); // kept as stored, as master keeps it
    s = go(s, [{ type: 'start' }, { type: 'editItems', items: S.dayOf(s).items.filter((i) => i.id !== 'a') }]);
    expect(S.dayOf(s).chosenId).toBe(null); // withItems drops it on the edit, as master does, so the stored record agrees
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
    // in the model of App.tsx that first tick gives master's first render: Close, settled, and one notification
    const opened = app.init(T0 + 3 * 60 * MIN, [S.dayOf(s)]);
    expect([opened.s.screen, opened.notified]).toEqual(['close', 1]);
    expect(key(app.view(opened))).toBe(key(legacyView(legacy(ALL).init(T0 + 3 * 60 * MIN, [S.dayOf(s)]))));
  });
  it('closing a day carried past midnight: closeDay, then rollover, gives master\'s new day and store', () => {
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
  it('choose with an id that is not on the list clears the choice (the UI only offers listed items)', () => {
    const s = go(toPick(S.init([], T0)), [{ type: 'choose', id: 'a' }]);
    const off = S.reduce(s, { type: 'choose', id: 'nope' }, T0);
    expect(off.screen === 'pick' && off.chosen).toBe(null);
    expect(S.dayOf(off).chosenId).toBe(null);
  });
  it('known difference, hand-edited store only: a closed day with a running block stays Closed (master settled it on load and showed Close)', () => {
    // no tab writes this: closing needs an ended block. master's settle effect ran on any screen, so on the next load it
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

describe('the reducer behaves like master\'s App.tsx (same UI-gated sequences, step by step)', () => {
  it('same screen, way back, day, stored days, notifications and toggle after every action and every check of 5000 sequences', () => {
    const M = legacy(ALL);
    const diffs: string[] = [];
    for (let seed = 1; seed <= SEEDS && diffs.length === 0; seed++) {
      const r = mulberry32(seed);
      let now = T0 + Math.floor(r() * 18 * 60) * MIN;
      let s = app.init(now, []);
      let m = M.init(now, []);
      const len = 1 + Math.floor(r() * MAX_LEN);
      const trail: string[] = [];
      const same = (n: number, when: string) => {
        const x = key(app.view(s)), y = key(M.view(m));
        if (x !== y) diffs.push(`seed ${seed} step ${n} ${when}, after ${trail.join(' > ')}\n  reducer ${x}\n  master  ${y}`);
        return x === y;
      };
      for (let n = 0; n < len; n++) {
        const v = app.view(s);
        now += dt(r);
        if (r() < RELOAD) {
          trail.push('reload');
          s = app.init(now, v.store);
          m = M.init(now, M.view(m).store);
          if (!same(n, 'after the reload')) break;
          continue;
        }
        const a = uiAction(r, v, n);
        trail.push(label(a));
        s = app.step(s, a, now);
        m = M.step(m, a, now);
        if (!same(n, 'after the action')) break;
        s = app.step(s, { type: 'rollover', stored: [] }, now);
        m = M.step(m, { type: 'rollover', stored: [] }, now);
        if (!same(n, 'after the check')) break;
      }
    }
    expect(diffs).toEqual([]);
  });
});
