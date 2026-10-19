// The app's screen state as one value, changed only by `reduce`. Pure: it imports only ./logic and reads no clock,
// storage, Notification or DOM; the time of each action comes in as `now` (App.tsx reads now() from src/clock.ts once per
// action; the Pick late line is its one clock read at render time).
// Each screen carries exactly what it needs, so a state the UI cannot show cannot be written down: the block screen
// always has a running block, Close an ended one, Closed a closed day, Pick its list and a choice from it (or none),
// and About and Your days always know the day screen they go back to.
// Saving, analytics, the notification, reminders, focus and timers stay in App.tsx. docs/architecture.md has the map.
import * as L from './logic';

/** A day still being planned: no block yet, not closed. Its chosenId may still be one a stored copy left behind on
 *  Welcome (the App.tsx before this reducer kept it there too, until the next item edit dropped it); Pick never shows one
 *  that is off its list. */
export type PlanDay = L.Day & { block: null; closed: false };
/** A day whose block is running (not ended, maybe paused). */
export type RunningDay = L.Day & { block: L.Block & { endedAt: null }; closed: false };
/** A day whose block has ended (complete, broken or stopped) and that is not closed yet. */
export type EndedDay = L.Day & { block: L.Block & { endedAt: number }; closed: false };
/** A closed day: Close today was tapped, here or in another tab. */
export type ClosedDay = L.Day & { closed: true };

/** What the four planning screens share. `small` is the bad-day shorter-block toggle: it exists only while planning,
 *  so a block, a new day and Start today over cannot carry it (68fc774). */
type Planning = { day: PlanDay; small: boolean };
export type Welcome = { screen: 'welcome' } & Planning;
/** Name's step (pushed, risky, anxious) and its draft are component state in App/Name.tsx; the state says only which step
 *  it opens on: the first, or the last when Back from Ask's first item returns to the step the user came from. A reload
 *  opens Welcome, and About or Your days over Name go back to its first step (it remounts), as before. */
export type Name = { screen: 'name'; opensAt: 'first' | 'last' } & Planning;
/** Ask's item index is component state in App/Ask.tsx: Ask opens on its first item (Look again included). */
export type Ask = { screen: 'ask' } & Planning;
/** `list` is pickOrder(day.items); `chosen` is one of its items or null, and day.chosenId always agrees with it.
 *  Only pick() builds one, so the list cannot go stale and Start cannot see a choice that is not on it (6ef125f). */
export type Pick = { screen: 'pick'; list: L.Item[]; chosen: L.Item | null } & Planning;
/** `now` is the time of the last action or tick: the countdown is drawn from it, never from the clock. */
export type BlockScreen = { screen: 'block'; day: RunningDay; now: number };
export type Close = { screen: 'close'; day: EndedDay };
export type Closed = { screen: 'closed'; day: ClosedDay };
/** A screen that shows the day. */
export type Base = Welcome | Name | Ask | Pick | BlockScreen | Close | Closed;
/** A day screen an overlay goes back to: Name there opens on its first step, as it did before it said which. */
export type Under = Exclude<Base, Name> | (Name & { opensAt: 'first' });
export type OverlayName = 'about' | 'days';
/** About and Your days open over a day screen. The screen they go back to is part of the overlay (`under`), so there is
 *  no separate stack to clear when they close; `prev` holds the overlays opened before this one, so Done goes back one
 *  step (About, then Your days, then Done goes back to About). */
export type Overlay = { screen: OverlayName; under: Under; prev: OverlayName[] };
export type State = Base | Overlay;
export type Screen = State['screen'];

// logic.ts names the day screens for shouldRollOver; they must be exactly Base's screens. If this line errors, a screen
// was added to one and not the other: add it to L.DayScreen in src/logic.ts (or to Base here).
type SameScreens = [Base['screen']] extends [L.DayScreen] ? ([L.DayScreen] extends [Base['screen']] ? 'same' : 'DayScreen has more') : 'Base has more';
const dayScreensMatch: SameScreens = 'same';
void dayScreensMatch;

/** Everything that changes the state: one per button, plus the timer and the checks App.tsx runs. */
export type Action =
  | { type: 'start' } // Welcome: I'm ready
  | { type: 'setSmall'; small: boolean } // Welcome (bad day): try a shorter block
  | { type: 'editItems'; items: L.Item[] } // Name: add, tag, untag, bring in or remove
  | { type: 'namingDone' } // Name: Two questions
  | { type: 'answer'; id: string; field: 'satisfied' | 'leverage'; value: boolean } // Ask: Yes / No
  | { type: 'askDone' } // Ask: Pick one
  | { type: 'stepBack' } // Back on Name and Ask (their first step), and Look again on Pick
  | { type: 'choose'; id: string } // Pick: an item
  | { type: 'startBlock'; min: number } // Pick: Start the block
  | { type: 'pause' } // block: Step away
  | { type: 'resume' } // block: I'm back
  | { type: 'drift' } // block: I drifted, coming back
  | { type: 'stop' } // block: End block
  | { type: 'tick' } // the block countdown (every second, on visibility, and once when the app opens)
  | { type: 'didIt'; didIt: boolean } // Close: Yes / Not today
  | { type: 'closeDay' } // Close: Close today. A day carried past midnight then rolls over (App.tsx sends `rollover` before paint)
  | { type: 'startOver' } // Closed: Yes, start over
  | { type: 'open'; to: OverlayName } // About in the header, See your days, Your days on About
  | { type: 'back' } // Done in the header on About and Your days, Back on Your days
  | { type: 'rollover'; stored: L.Day[] } // the date may have changed while open; `stored` is the store's days
  | { type: 'otherTabClosed'; theirs: L.Day | undefined }; // what another tab saved for this date

/** The end of an exhaustive switch: a new screen or action with no case is a compile error here. For an action that
 *  means `reduce` must list it; whether any screen handles it is up to `reduceBase` (see `reduce`). */
export const never = (x: never): never => { throw new Error(`unhandled: ${JSON.stringify(x)}`); };

export const isClosed = (d: L.Day): d is ClosedDay => d.closed === true;
export const isRunning = (d: L.Day): d is RunningDay => !d.closed && d.block != null && d.block.endedAt == null;
export const isEnded = (d: L.Day): d is EndedDay => !d.closed && d.block != null && d.block.endedAt != null;
export const isPlan = (d: L.Day): d is PlanDay => !d.closed && d.block == null;

/** Pick, with the list worked out. A chosenId that is not on the list becomes null: the UI only offers listed items,
 *  and on every path into Pick withItems has already dropped a stale choice, so this changes nothing the user can do;
 *  a `choose` with an unlisted id clears the choice rather than being ignored. */
export function pick(day: PlanDay, small: boolean): Pick {
  const list = L.pickOrder(day.items);
  const chosen = list.find((i) => i.id === day.chosenId) ?? null;
  const id = chosen ? chosen.id : null;
  return { screen: 'pick', list, chosen, small, day: id === day.chosenId ? day : { ...day, chosenId: id } };
}
/** Where a stored day opens (resumeScreen in the App.tsx before this reducer, 8f5dbaa): Closed, the running block, Close
 *  after a block, otherwise Welcome. The day is kept as stored, chosenId included, so what is saved next is the value
 *  that App.tsx saved. A running block is not settled here: App.tsx sends a `tick` when it opens, as its old settle
 *  effect ran once on the first render. */
export function resume(day: L.Day, now: number): Under {
  if (isClosed(day)) return { screen: 'closed', day };
  if (isRunning(day)) return { screen: 'block', day, now };
  if (isEnded(day)) return { screen: 'close', day };
  // every day that is not closed, running or ended is a plan; the spread only satisfies the type
  return { screen: 'welcome', small: false, day: isPlan(day) ? day : { ...day, block: null, closed: false } };
}
/** The first state: a block belongs to the day it started, so an unfinished earlier day stays open until it is closed. */
export function init(days: L.Day[], now: number): State {
  return resume(L.activeDay(days, now).day ?? L.newDay(L.dayKey(new Date(now)), now), now);
}

export const isOverlay = (s: State): s is Overlay => s.screen === 'about' || s.screen === 'days';
/** The day screen an overlay opened over goes back to (see Under). */
const under = (s: Base): Under => (s.screen === 'name' ? { ...s, opensAt: 'first' } : s);
/** The day screen on show, or the one under an open overlay. */
export const base = (s: State): Base => (isOverlay(s) ? s.under : s);
export const dayOf = (s: State): L.Day => base(s).day;
/** The one thing: the chosen item, if it is on the day's list. */
export const chosenItem = (d: L.Day): L.Item | undefined => d.items.find((i) => i.id === d.chosenId);

// Before a block starts, a choice that is no longer on the pick list is dropped. Pick re-derives its choice anyway
// (pick()), so this is not what keeps Start honest; it is kept so the stored chosenId stays the same value the App.tsx
// before this reducer saved (the comparison checks the day's JSON); dropping it would change what is saved on Name and
// Ask, visible in localStorage.
const withItems = (d: PlanDay, items: L.Item[]): PlanDay => ({ ...d, items, chosenId: L.validChoice(items, d.chosenId) });

/** A block action, settled at `now` (the old App.tsx's settle effect, moved here): an ended block (stopped, broken or
 *  complete) moves to Close. */
function blockStep(s: BlockScreen, b: L.Block, now: number): BlockScreen | Close {
  const settled = L.settle(b, now);
  const day = { ...s.day, block: settled, gotBlock: L.autoGotBlock(settled, now, s.day.gotBlock) };
  if (isRunning(day)) return { screen: 'block', day, now };
  if (isEnded(day)) return { screen: 'close', day };
  return s; // unreachable: a settled block is running or ended
}

/** A day screen's own actions. Anything a screen does not offer leaves it as it is (the same object). */
function reduceBase(s: Base, a: Action, now: number): Base {
  switch (s.screen) {
    case 'welcome':
      if (a.type === 'start') return { ...s, screen: 'name', opensAt: 'first' };
      if (a.type === 'setSmall') return { ...s, small: a.small };
      return s;
    case 'name':
      if (a.type === 'editItems') return { ...s, day: withItems(s.day, a.items) };
      if (a.type === 'stepBack') return { screen: 'welcome', day: s.day, small: s.small };
      // Two questions is only offered with at least one item, so Ask always has one to show
      if (a.type === 'namingDone' && L.filled(s.day.items).length > 0) return { screen: 'ask', small: s.small, day: withItems(s.day, L.guidedOrder(L.filled(s.day.items))) };
      return s;
    case 'ask':
      if (a.type === 'answer') return { ...s, day: withItems(s.day, s.day.items.map((i) => (i.id === a.id ? { ...i, [a.field]: a.value } : i))) };
      if (a.type === 'stepBack') return { ...s, screen: 'name', opensAt: 'last' }; // Back from the first item: Name's last step, where the user came from
      if (a.type === 'askDone') return pick(s.day, s.small);
      return s;
    case 'pick':
      if (a.type === 'choose') return pick({ ...s.day, chosenId: a.id }, s.small);
      if (a.type === 'stepBack') return { screen: 'ask', day: s.day, small: s.small };
      if (a.type === 'startBlock') {
        if (!s.chosen) return s; // Start the block needs a choice from the list
        const block = { ...L.startBlock(a.min, now, s.small), endedAt: null };
        return { screen: 'block', now, day: { ...s.day, chosenId: s.chosen.id, block, gotBlock: null } };
      }
      return s;
    case 'block':
      switch (a.type) {
        case 'pause': return blockStep(s, L.pause(s.day.block, now), now);
        case 'resume': return blockStep(s, L.resume(s.day.block, now), now);
        case 'drift': return blockStep(s, L.drift(s.day.block, now), now);
        case 'stop': return blockStep(s, L.stop(s.day.block, now), now);
        case 'tick': {
          // an unchanged block keeps its day object, so a tick only moves the countdown (nothing is saved each second)
          const n = blockStep(s, s.day.block, now);
          return n.screen === 'block' && n.day.block === s.day.block ? { ...s, now } : n;
        }
        default: return s;
      }
    case 'close':
      if (a.type === 'didIt') return { ...s, day: { ...s.day, didIt: a.didIt, doneText: a.didIt ? chosenItem(s.day)?.text ?? null : null } };
      if (a.type === 'closeDay') return { screen: 'closed', day: { ...s.day, closed: true } };
      return s;
    case 'closed':
      // starting over replaces today's record whole; no other day is touched
      if (a.type === 'startOver') return { screen: 'welcome', small: false, day: { ...L.newDay(L.dayKey(new Date(now)), now), block: null, closed: false } };
      return s;
    default:
      return never(s);
  }
}

export function reduce(s: State, a: Action, now: number): State {
  switch (a.type) {
    case 'open':
      return isOverlay(s) ? { screen: a.to, under: s.under, prev: [...s.prev, s.screen] } : { screen: a.to, under: under(s), prev: [] };
    case 'back':
      if (!isOverlay(s)) return s;
      return s.prev.length ? { screen: s.prev[s.prev.length - 1], under: s.under, prev: s.prev.slice(0, -1) } : s.under;
    case 'rollover': {
      // App.tsx asks the same question first, to save the day being left (see rollOver there)
      const b = base(s);
      if (!L.shouldRollOver(b.day, b.screen, now)) return s;
      const date = L.dayKey(new Date(now));
      const next = resume(a.stored.find((d) => d.date === date) ?? L.newDay(date, now), now);
      // an open overlay stays open, and Done goes straight to the new day's screen
      return isOverlay(s) ? { screen: s.screen, under: next, prev: [] } : next;
    }
    case 'otherTabClosed': {
      const theirs = a.theirs;
      if (!theirs || !isClosed(theirs) || !L.supersedes(theirs, dayOf(s))) return s;
      const closed: Closed = { screen: 'closed', day: theirs };
      return isOverlay(s) ? { screen: s.screen, under: closed, prev: [] } : closed;
    }
    case 'start': case 'setSmall': case 'editItems': case 'namingDone': case 'answer': case 'askDone': case 'stepBack':
    case 'choose': case 'startBlock': case 'pause': case 'resume': case 'drift': case 'stop': case 'tick':
    case 'didIt': case 'closeDay': case 'startOver':
      // day screens act only while they are showing, never from under an overlay. Listing an action here is all tsc
      // asks for: which screen handles it is a reduceBase case added by hand, and an action every screen ignores still
      // compiles (the property test's generators and its coverage check are what notice)
      return isOverlay(s) ? s : reduceBase(s, a, now);
    default:
      return never(a);
  }
}

/** True when this step finished the block by reaching its target: the moment for "Your block is done". Only settling
 *  does that (a tick, or a block action at or after the target), never End block, which ends it as stopped. */
export const completed = (prev: State, next: State): boolean =>
  prev.screen === 'block' && next.screen === 'close' && next.day.block.endReason === 'complete';
