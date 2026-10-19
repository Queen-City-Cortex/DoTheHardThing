// The old App.tsx (8f5dbaa) as a model over logic.ts: part (a) of src/state.property/generators.testlib.ts's header.

import * as L from '../logic';
import * as S from '../state';
import { View } from './generators.testlib';
import { Model } from './runner.testlib';

// ---------- (a) the old App.tsx (8f5dbaa), as a model over logic.ts ----------
// The store is modeled as App kept it (store.days): every shown day is put into it, and a rollover puts the day being left.
export const putDay = (days: L.Day[], d: L.Day) => L.putDay({ days, archive: {} }, d).days;
export const keyOf = (now: number) => L.dayKey(new Date(now));
export const overlay = (s: string) => s === 'about' || s === 'days';
function resumeScreen(d: L.Day): string {
  if (d.closed) return 'closed';
  if (d.block && d.block.endedAt == null) return 'block';
  if (d.block) return 'close';
  return 'welcome';
}
/** L.screenForBlock as it was at 8f5dbaa (the repair from 6ef125f). This change removes it from logic.ts: the block screen
 *  type cannot hold an ended block, so the reducer never needs it. */
export function screenForBlock(screen: string, block: L.Block | null): string {
  if (screen !== 'block') return screen;
  if (!block) return 'pick';
  return block.endedAt != null ? 'close' : screen;
}
// the old App.tsx passed the screen as a string, overlay names included (About over a block passes 'about'); logic.ts now takes
// only a day screen. An overlay name falls through to `day.block == null`, which is what the day screen under it gives.
const oldShouldRollOver = (day: L.Day, screen: string, now: number) => L.shouldRollOver(day, screen as L.DayScreen, now);

type Repairs = { validChoice: boolean; screenForBlock: boolean; stack: boolean };
export const ALL: Repairs = { validChoice: true, screenForBlock: true, stack: true };
/** The 0fd3abe logic: no validChoice (Start was `disabled={!day.chosenId}`), no screenForBlock, no stack clearing. */
export const NONE: Repairs = { validChoice: false, screenForBlock: false, stack: false };
/** What each effect saw when it last ran, so it runs again only when its dependencies changed (as React runs it). */
type Seen = { day: L.Day; screen: string; store: L.Day[]; now: number; block: L.Block | null };
export type Legacy = { screen: string; stack: string[]; day: L.Day; small: boolean; now: number; store: L.Day[]; notified: number; seen: Seen | null };

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
export const legacyView = (m: Legacy): View => ({ screen: m.screen, day: m.day, small: m.small, under: overlay(m.screen) ? m.stack[0] ?? resumeScreen(m.day) : null,
  back: overlay(m.screen) ? m.stack : [], store: m.store, notified: m.notified });
export const legacy = (fix: Repairs): Model<Legacy> => ({ init: legacyInit(fix), view: legacyView, step: (m, a, at) => legacyStep(m, a, at, fix), put: (m, d) => ({ ...m, store: putDay(m.store, d) }) });