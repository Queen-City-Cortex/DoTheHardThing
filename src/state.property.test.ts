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
// the searches (the coverage floors then do not apply).
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

/** An item edit as the Name screen makes one: add or tag (`add` of the time), untag, remove. Half the removals and untags
 *  hit the chosen item. */
function editItems(r: Rnd, items: L.Item[], n: number, chosenId: string | null = null, add = 0.6): L.Item[] {
  const k = r();
  if (k < add || !items.length) return L.addOrTag(items, pickOf(r, TEXTS), pickOf(r, TAGS), `i${n}`).items;
  const it = (r() < 0.5 && items.find((i) => i.id === chosenId)) || pickOf(r, items);
  if (k < 0.8) return items.filter((i) => L.norm(i.text) !== L.norm(it.text));
  return L.removeTag(items, it.id, pickOf(r, TAGS));
}

/** A generator of the next action. */
type Gen = (r: Rnd, v: View, n: number) => S.Action;

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
const uiAction = gated(UNIFORM);
const uiWeighted = gated(WEIGHTED);

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

// ---------- (a) the old App.tsx (8f5dbaa), as a model over logic.ts ----------
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
/** L.screenForBlock as it was at 8f5dbaa (the repair from 6ef125f). This change removes it from logic.ts: the block screen
 *  type cannot hold an ended block, so the reducer never needs it. */
function screenForBlock(screen: string, block: L.Block | null): string {
  if (screen !== 'block') return screen;
  if (!block) return 'pick';
  return block.endedAt != null ? 'close' : screen;
}
// the old App.tsx passed the screen as a string, overlay names included (About over a block passes 'about'); logic.ts now takes
// only a day screen. An overlay name falls through to `day.block == null`, which is what the day screen under it gives.
const oldShouldRollOver = (day: L.Day, screen: string, now: number) => L.shouldRollOver(day, screen as L.DayScreen, now);

type Repairs = { validChoice: boolean; screenForBlock: boolean; stack: boolean };
const ALL: Repairs = { validChoice: true, screenForBlock: true, stack: true };
/** The 0fd3abe logic: no validChoice (Start was `disabled={!day.chosenId}`), no screenForBlock, no stack clearing. */
const NONE: Repairs = { validChoice: false, screenForBlock: false, stack: false };
/** What each effect saw when it last ran, so it runs again only when its dependencies changed (as React runs it). */
type Seen = { day: L.Day; screen: string; store: L.Day[]; now: number; block: L.Block | null };
type Legacy = { screen: string; stack: string[]; day: L.Day; small: boolean; now: number; store: L.Day[]; notified: number; seen: Seen | null };

/** One user action, tick or check in the old App.tsx, then the effects that follow it until nothing changes. `at` is
 *  clockNow() at the handler; the effects' check reads the clock again (the same instant here). */
function legacyStep(m: Legacy, a: S.Action, at: number, fix: Repairs): Legacy {
  let { screen, stack, day, small, now, store } = m;
  // before a block starts, drop a choice that is no longer in the pick list (the old withItems)
  const withItems = (d: L.Day, items: L.Item[]): L.Day => ({ ...d, items, chosenId: d.block || !fix.validChoice ? d.chosenId : L.validChoice(items, d.chosenId) });
  // the old rollOver: `next` from the store as this render has it; save and put `from`; a new day starts without the toggle
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
      if (screen === 'close') { const closed = { ...day, closed: true }; if (oldShouldRollOver(closed, 'closed', at)) rollOver(closed); else { day = closed; screen = 'closed'; } }
      break;
    case 'startOver': if (screen === 'closed') { day = L.newDay(keyOf(at), at); small = false; screen = 'welcome'; } break;
    case 'open': stack = [...stack, screen]; screen = a.to; break; // the header About, See your days, Your days on About
    case 'back': if (overlay(screen)) { screen = stack[stack.length - 1] ?? resumeScreen(day); stack = stack.slice(0, -1); } break;
    case 'rollover': if (oldShouldRollOver(day, screen, at)) rollOver(day); break; // the interval, focus or visibility check
    case 'otherTabClosed': if (a.theirs && L.supersedes(a.theirs, day)) { day = a.theirs; if (overlay(screen)) stack = ['closed']; else screen = 'closed'; } break; // pull
  }
  return legacyEffects({ ...m, screen, stack, day, small, now, store }, at, fix);
}
/** The old App.tsx's effects, in their order, each when its dependencies changed. Each reads the committed render and sets state
 *  for the next one, so they run in rounds until a render changes nothing. */
function legacyEffects(m: Legacy, at: number, fix: Repairs): Legacy {
  let { screen, stack, day, small, store, notified, seen } = m;
  const { now } = m;
  for (let round = 0; ; round++) {
    if (round > 10) throw new Error('old App model: effects never settle');
    const r0 = { day, screen, store, now, block: day.block };
    const changed = (k: keyof Seen) => !seen || seen[k] !== r0[k];
    if (seen && !(['day', 'screen', 'store', 'now', 'block'] as const).some(changed)) break;
    if (changed('day')) store = putDay(store, r0.day); // setStore((st) => putDay(st, day))
    // the date check, [day, screen, rollOver] (rollOver changes with store and screen)
    if (changed('day') || changed('screen') || changed('store')) {
      if (oldShouldRollOver(r0.day, r0.screen, at)) {
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
// the old App.tsx's first render: activeDay, else a new day, on its resumeScreen; the effects then run once (the settle effect
// settles a running block at the first render's now)
const legacyInit = (fix: Repairs) => (now: number, stored: L.Day[]): Legacy => {
  const day = L.activeDay(stored, now).day ?? L.newDay(keyOf(now), now);
  return legacyEffects({ screen: resumeScreen(day), stack: [], day, small: false, now, store: stored, notified: 0, seen: null }, now, fix);
};
const legacyView = (m: Legacy): View => ({ screen: m.screen, day: m.day, small: m.small, under: overlay(m.screen) ? m.stack[0] ?? resumeScreen(m.day) : null,
  back: overlay(m.screen) ? m.stack : [], store: m.store, notified: m.notified });
const legacy = (fix: Repairs): Model<Legacy> => ({ init: legacyInit(fix), view: legacyView, step: (m, a, at) => legacyStep(m, a, at, fix), put: (m, d) => ({ ...m, store: putDay(m.store, d) }) });

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
  put: (m, d) => ({ ...m, store: putDay(m.store, d) }),
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
  put: (m, d) => ({ ...m, store: putDay(m.store, d) }),
};

// ---------- runner ----------
/** `put` is another tab saving a day into the store this tab holds. */
type Model<M> = { init: (now: number, stored: L.Day[]) => M; view: (m: M) => View; step: (m: M, a: S.Action, at: number) => M; put: (m: M, d: L.Day) => M };
const T0 = new Date('2026-10-14T06:00:00').getTime();
/** A reload: the app starts again from what is stored. */
const RELOAD = 0.04;
/** After midnight, how often another tab has already saved a record for the new date before the check runs. */
const STORED_AHEAD = 0.3;
const STORED_KINDS = ['plan', 'running', 'ended', 'closed'] as const;
type StoredKind = (typeof STORED_KINDS)[number];
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
function aheadOf<M>(model: Model<M>, r: Rnd, m: M, now: number): { m: M; ahead: { kind: StoredKind; day: L.Day } | null } {
  const v = model.view(m);
  const date = keyOf(now);
  if (r() >= STORED_AHEAD || v.day.date >= date || v.store.some((d) => d.date === date)) return { m, ahead: null };
  const ahead = storedAhead(r, date, now);
  // a running block is put only when this check opens it at once: opened later (after closing a day carried past
  // midnight) the App.tsx before this reducer settles it with the time of its last tick, a known difference (docs/architecture.md)
  if (ahead.kind === 'running' && !L.shouldRollOver(v.day, (v.under ?? v.screen) as L.DayScreen, now)) return { m, ahead: null };
  return { m: model.put(m, ahead.day), ahead };
}
type Found = { seed: number; step: number; why: string; trail: string[] };
const label = (a: S.Action) => (a.type === 'editItems' ? `editItems(${a.items.map((i) => i.text).join('|')})` : a.type);
/** The seeds 1 to n, or exactly the ones listed. */
const seedsOf = (seeds: number | number[]) => (Array.isArray(seeds) ? seeds : Array.from({ length: seeds }, (_, i) => i + 1));
type RunOpts<M> = { seeds?: number | number[]; extra?: (m: M) => string | null; ahead?: boolean };
/** Runs seeded sequences of one model; after every step the interval check runs (the App.tsx before this reducer checks
 *  every minute and on focus). With `ahead`, another tab sometimes saved the new date's record first (aheadOf). */
function run<M>(model: Model<M>, gen: Gen, { seeds = SEQUENCES, extra, ahead = false }: RunOpts<M> = {}): Found | null {
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
const key = (w: View) => { const [head, day, , ...rest] = parts(w); const tail = rest.pop(); return `[${head},${day},[${rest.join(',')}],${tail}]`; };
const sameView = (v: View, w: View) => { const a = parts(v), b = parts(w); return a.length === b.length && a.every((x, i) => x === b[i]); };
const show = (f: Found | null) => (f ? `seed ${f.seed}, step ${f.step}: ${f.why}\n  after ${f.trail.join(' > ')}` : 'none');

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
type Coverage = { changed: Record<S.Action['type'], number>; views: Record<S.Screen, number>; opened: Record<StoredKind, number> };
const coverage = (): Coverage => ({
  changed: { start: 0, setSmall: 0, editItems: 0, namingDone: 0, answer: 0, askDone: 0, stepBack: 0, choose: 0, startBlock: 0, pause: 0, resume: 0,
    drift: 0, stop: 0, tick: 0, didIt: 0, closeDay: 0, startOver: 0, open: 0, back: 0, rollover: 0, otherTabClosed: 0 },
  views: { welcome: 0, name: 0, ask: 0, pick: 0, block: 0, close: 0, closed: 0, about: 0, days: 0 },
  opened: { plan: 0, running: 0, ended: 0, closed: 0 },
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
    const step = (a: S.Action) => {
      const before = x.s.s;
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
      step(a);
      if (!same(n, 'after the action')) break;
      const { m, ahead } = aheadOf(both, r2, x, now);
      x = m;
      if (ahead) trail.push(`stored ${ahead.kind}`);
      step({ type: 'rollover', stored: [] });
      holds(n, v, a);
      if (!same(n, 'after the check')) break;
      const d = S.dayOf(x.s.s);
      if (ahead && d.date === ahead.day.date && d.openedAt === ahead.day.openedAt) cov.opened[ahead.kind]++;
      cov.views[x.s.s.screen]++;
    }
  }
  return { diffs, cov, invalid };
}
const comparisons = new Map<Gen, ReturnType<typeof compare>>();
/** compare(gen), run once per mix and shared by the tests that read it. */
function compared(gen: Gen): ReturnType<typeof compare> {
  const done = comparisons.get(gen) ?? compare(gen);
  comparisons.set(gen, done);
  return done;
}

describe('the reducer behaves like the App.tsx before it (8f5dbaa): same UI-gated sequences, step by step', () => {
  it('uniform mix: same screen, way back, day, stored days, notifications and toggle after every action and every check of 5000 sequences', () => {
    const { diffs, cov } = compared(uiAction);
    expect(diffs).toEqual([]);
    console.log('[comparison, uniform] state changes by action:', JSON.stringify(cov.changed), '\n  views:', JSON.stringify(cov.views), '\n  stored records opened:', JSON.stringify(cov.opened));
  });
  it('weighted mix: the same, through Pick, the block, Close, Closed and midnight, and every action and screen is reached', () => {
    const { diffs, cov } = compared(uiWeighted);
    expect(diffs).toEqual([]);
    console.log('[comparison, weighted] state changes by action:', JSON.stringify(cov.changed), '\n  views:', JSON.stringify(cov.views), '\n  stored records opened:', JSON.stringify(cov.opened));
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
  });
});
