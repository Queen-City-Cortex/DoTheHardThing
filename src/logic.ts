// Core, pure logic for Do The Hard Thing. No DOM, no storage: everything here is unit tested.
// The method's numbers (items, block length, the break, the late cutoffs) come from src/method.ts, and every word it
// returns (the close and welcome lines, tag labels, day counts, the reminder status) from src/copy.ts: its only two
// imports, both pure.
import { fmt, t } from './copy';
import { BLOCK_MAX, BLOCK_MIN, BREAK_LIMIT_MS, BREAKS_PER_BLOCK, FULL_BLOCK_FOCUS_MIN, lateAt, MAX_ITEMS, PICK_FIRST, SMALL_BLOCK_DEFAULT, SMALL_BLOCK_OPTIONS, SUGGESTED_MIN } from './method';

export type Tag = 'pushed' | 'risky' | 'anxious';

export interface Item {
  id: string;
  text: string;
  tags: Tag[]; // non-empty, canonical order (pushed, risky, anxious): the same thing can answer several steps
  satisfied: boolean | null;
  leverage: boolean | null;
  pushedCount: number; // how many times it has been carried to a new day
}

export interface Block {
  targetMin: number;
  startedAt: number;
  pausedAt: number | null; // set while stepped away
  pausedMs: number; // total short-break time, excluded from focus time
  breaks?: number; // step-aways taken; one per block (optional so older stored blocks load)
  endedAt: number | null;
  endReason: 'complete' | 'broken' | 'stopped' | null;
  drifts: number[];
}

export interface Day {
  date: string; // YYYY-MM-DD local
  openedAt: number;
  items: Item[];
  chosenId: string | null;
  block: Block | null;
  gotBlock: boolean | null; // did the block alone reach FULL_BLOCK_FOCUS_MIN of focus? kept for the record; nothing shown or counted reads it
  didIt: boolean | null; // the user's own answer to "Did you do it?"; the only thing counts read
  doneText: string | null; // the one thing's text when didIt is true, so history outlives the item
  closed: boolean;
}

// ---------- dates ----------
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysBetween(a: string, b: string): number {
  const u = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(b) - u(a)) / 86_400_000);
}

// ---------- naming the discomfort ----------
export const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
export const filled = (items: Item[]) => items.filter((i) => i.text.trim() !== '');
export const canAdd = (items: Item[]) => filled(items).length < MAX_ITEMS;
export const canContinue = (items: Item[]) => filled(items).length >= 1 && filled(items).length <= MAX_ITEMS;
export const belowSuggested = (items: Item[]) => filled(items).length < SUGGESTED_MIN;

const TAG_ORDER: Record<Tag, number> = { pushed: 0, risky: 1, anxious: 2 };
const TAGS: Tag[] = ['pushed', 'risky', 'anxious'];

/** True if the item carries the tag. A carried item (pushedCount > 0) has been pushed, whatever its tags say. */
export const hasTag = (item: Pick<Item, 'tags' | 'pushedCount'>, tag: Tag) => item.tags.includes(tag) || (tag === 'pushed' && item.pushedCount > 0);
/** The tags plus one more, in canonical order, without repeats. */
export const withTag = (tags: Tag[], tag: Tag): Tag[] => TAGS.filter((x) => x === tag || tags.includes(x));
/** The tag that colours the chip: risky, then anxious, then pushed. */
export const primaryTag = (tags: Tag[]): Tag => (['risky', 'anxious', 'pushed'] as Tag[]).find((x) => tags.includes(x)) ?? 'pushed';

export type AddOutcome = 'added' | 'tagged' | 'already' | 'empty' | 'full';
/** Add the text under a tag. The same text already on the list (any tag) is not copied: it gains the tag instead,
 *  keeping its id, place, answers and pushed count, and the cap of 5 does not apply. */
export function addOrTag(items: Item[], text: string, tag: Tag, id: string, pushedCount = 0): { items: Item[]; outcome: AddOutcome; item?: Item } {
  if (!text.trim()) return { items, outcome: 'empty' };
  const match = items.find((i) => norm(i.text) === norm(text));
  if (match) {
    if (hasTag(match, tag)) return { items, outcome: 'already', item: match };
    const item = { ...match, tags: withTag(match.tags, tag) };
    return { items: items.map((i) => (i === match ? item : i)), outcome: 'tagged', item };
  }
  if (!canAdd(items)) return { items, outcome: 'full' };
  const item: Item = { id, text: text.trim(), tags: [tag], satisfied: null, leverage: null, pushedCount };
  return { items: [...items, item], outcome: 'added', item };
}

/** Add an item with a tag (or tag the one already there), enforcing the max of 5 and ignoring blanks. */
export function addItem(items: Item[], text: string, tag: Tag, id: string, pushedCount = 0): Item[] {
  return addOrTag(items, text, tag, id, pushedCount).items;
}

/** Drop one tag from an item; an item left with no tags leaves the list. */
export function removeTag(items: Item[], id: string, tag: Tag): Item[] {
  return items.flatMap((i) => {
    if (i.id !== id) return [i];
    const tags = i.tags.filter((x) => x !== tag);
    return tags.length ? [{ ...i, tags }] : [];
  });
}

/** Guided order: pushed first, then risky, then anxious, by an item's earliest tag (stable within a group). */
const rank = (i: Item) => Math.min(...i.tags.map((x) => TAG_ORDER[x]));
export function guidedOrder(items: Item[]): Item[] {
  return items.map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map((x) => x.it);
}

/** Tag label for display: `risky · anxious`, with the pushed part last (`pushed`, or `pushed N×` once carried), never `pushed 0×`. */
export function tagLabel(tags: Tag[], pushedCount = 0): string {
  const parts = TAGS.filter((x) => x !== 'pushed' && tags.includes(x)).map(fmt.tag);
  if (tags.includes('pushed') || pushedCount > 0) parts.push(pushedCount > 0 ? fmt.pushedTimes(pushedCount) : fmt.tag('pushed'));
  return parts.join(' · ');
}

// ---------- the two questions ----------
export const answered = (i: Item) => i.satisfied !== null && i.leverage !== null;
export const allAnswered = (items: Item[]) => filled(items).every(answered);
/** High-leverage items: at least one yes. */
export const highLeverage = (items: Item[]) => filled(items).filter((i) => i.satisfied === true || i.leverage === true);
export const setAside = (items: Item[]) => filled(items).filter((i) => i.satisfied === false && i.leverage === false);

/** Pick list: risky (rejection or conflict) first, then everything else in the order written. */
export function pickOrder(items: Item[]): Item[] {
  const hl = highLeverage(items);
  return [...hl.filter((i) => i.tags.includes(PICK_FIRST)), ...hl.filter((i) => !i.tags.includes(PICK_FIRST))];
}

/** The chosen id if it is still in the pick list, otherwise null. */
export function validChoice(items: Item[], chosenId: string | null): string | null {
  return chosenId != null && pickOrder(items).some((i) => i.id === chosenId) ? chosenId : null;
}

// ---------- the block ----------
export function clampBlock(min: number, small = false): number {
  const lo = small ? SMALL_BLOCK_OPTIONS[0] : BLOCK_MIN;
  if (!Number.isFinite(min)) return small ? SMALL_BLOCK_DEFAULT : BLOCK_MIN;
  return Math.min(BLOCK_MAX, Math.max(lo, Math.round(min)));
}

export function startBlock(targetMin: number, now: number, small = false): Block {
  return { targetMin: clampBlock(targetMin, small), startedAt: now, pausedAt: null, pausedMs: 0, breaks: 0, endedAt: null, endReason: null, drifts: [] };
}

/** Focus time so far, from stored timestamps only (survives reload/backgrounding). */
export function focusMs(b: Block, now: number): number {
  const end = b.endedAt ?? b.pausedAt ?? now;
  return Math.max(0, end - b.startedAt - b.pausedMs);
}
export const remainingMs = (b: Block, now: number) => Math.max(0, b.targetMin * 60_000 - focusMs(b, now));
export const progress = (b: Block, now: number) => Math.min(1, focusMs(b, now) / (b.targetMin * 60_000));

/** One step-away per block. An older stored block without `breaks` counts a recorded pause as its one break. */
export const canPause = (b: Block) => {
  const taken = b.breaks ?? (b.pausedMs > 0 ? 1 : 0);
  // a whole count from 0 up to the allowance; anything else in a corrupt store (-1, 0.5) is not an unused break
  return b.endedAt == null && b.pausedAt == null && Number.isInteger(taken) && taken >= 0 && taken < BREAKS_PER_BLOCK;
};

export function pause(b: Block, now: number): Block {
  return canPause(b) ? { ...b, pausedAt: now, breaks: (b.breaks ?? 0) + 1 } : b;
}

/** Resume after stepping away. A break of 10+ minutes ends the block honestly. */
export function resume(b: Block, now: number): Block {
  if (b.pausedAt == null || b.endedAt != null) return b;
  const away = Math.max(0, now - b.pausedAt);
  if (away >= BREAK_LIMIT_MS) return { ...b, endedAt: b.pausedAt, endReason: 'broken', pausedAt: null };
  return { ...b, pausedAt: null, pausedMs: b.pausedMs + away };
}

/** Bring a stored block up to date: finish it if the target was reached, or break it if a pause ran 10+ min. */
export function settle(b: Block, now: number): Block {
  if (b.endedAt != null) return b;
  if (b.pausedAt != null && now - b.pausedAt >= BREAK_LIMIT_MS) return { ...b, endedAt: b.pausedAt, endReason: 'broken', pausedAt: null };
  if (b.pausedAt == null && remainingMs(b, now) === 0) return { ...b, endedAt: b.startedAt + b.pausedMs + b.targetMin * 60_000, endReason: 'complete' };
  return b;
}
export const drift = (b: Block, now: number): Block => ({ ...b, drifts: [...b.drifts, now] });
export const stop = (b: Block, now: number): Block => (b.endedAt ? b : { ...settle(b, now), endedAt: b.pausedAt ?? now, endReason: 'stopped', pausedAt: null });
/** A block is full once it has FULL_BLOCK_FOCUS_MIN of focus (the one break excluded), however it ended. Less is a start. */
export type BlockOutcome = 'full' | 'short' | 'running';
export function blockOutcome(b: Block, now: number): BlockOutcome {
  if (b.endedAt == null) return 'running';
  return focusMs(b, now) >= FULL_BLOCK_FOCUS_MIN * 60_000 ? 'full' : 'short';
}
/** The answer a block gives on its own: false once a short block ends, true when a full block completes, else unchanged. */
export function autoGotBlock(b: Block, now: number, prev: boolean | null): boolean | null {
  const o = blockOutcome(b, now);
  if (o === 'short') return false;
  return o === 'full' && b.endReason === 'complete' ? true : prev;
}
export const isBrokenPause = (b: Block, now: number) => b.pausedAt != null && now - b.pausedAt >= BREAK_LIMIT_MS;

export function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(sec)}`;
}

// ---------- carry-over ----------
/** A day counts as history only if something was written down or a block was started. */
export const hasContent = (d: Day) => filled(d.items).length > 0 || d.block != null;

/** Most recent earlier day with content; empty visits are skipped. */
export function lastDay(history: Day[], today: string): Day | undefined {
  return history.filter((d) => d.date < today && hasContent(d)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/** Leftovers from the last day: everything except a one thing the user said they did (didIt true, however long
 *  the block ran) and items set aside (No/No). Unanswered items still carry. Each keeps all its tags; the pushed count rises by one. */
export function leftovers(history: Day[], today: string): { text: string; pushedCount: number; tags: Tag[] }[] {
  const d = lastDay(history, today);
  if (!d) return [];
  const aside = setAside(d.items);
  return filled(d.items)
    .filter((i) => !(d.didIt === true && i.id === d.chosenId) && !aside.includes(i))
    .map((i) => ({ text: i.text, pushedCount: i.pushedCount + 1, tags: i.tags }));
}

// ---------- which day is open ----------
/** A block belongs to the day it started. On load, yesterday (only yesterday) stays open if it was left
 *  unfinished (block still running after settling, or ended with "Did you do it?" not yet answered); it is returned settled.
 *  Otherwise today's record, or null for the caller to make a new day. */
export function activeDay(days: Day[], now: number): { day: Day | null; carried: boolean } {
  const today = dayKey(new Date(now));
  const prev = days.filter((d) => d.date < today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (prev && daysBetween(prev.date, today) === 1 && !prev.closed && prev.block && (prev.block.endedAt == null || prev.didIt === null)) {
    const b = settle(prev.block, now);
    const day = b === prev.block ? prev : { ...prev, block: b, gotBlock: autoGotBlock(b, now, prev.gotBlock) };
    return { day, carried: true };
  }
  return { day: days.find((d) => d.date === today) ?? null, carried: false };
}

/** The screens that show a day (Base in src/state.ts, which checks the two agree). About and Your days are not one:
 *  under an overlay, pass the day screen it opened over. */
export type DayScreen = 'welcome' | 'name' | 'ask' | 'pick' | 'block' | 'close' | 'closed';
/** While the app stays open: move to the new date unless a block on the open day is still running or being closed. */
export function shouldRollOver(day: Day, screen: DayScreen, now: number): boolean {
  if (dayKey(new Date(now)) === day.date) return false;
  if (day.closed) return true;
  if (screen === 'block' || screen === 'close') return false;
  return day.block == null; // a started block keeps its day until it is closed
}

/** A fresh record for a date: what a new day, and starting today over, begin from. */
export function newDay(date: string, now: number): Day {
  return { date, openedAt: now, items: [], chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false };
}
/** Another tab's copy of the open day wins over this tab's when it is closed, this tab's is not, and this tab's
 *  was not opened after it (a stale tab). Starting today over opens a newer record, so it is never overruled. */
export const supersedes = (stored: Day, mine: Day) => stored.closed && !mine.closed && mine.openedAt <= stored.openedAt;

// ---------- counts: gentle and up-only ----------
// Never a streak, never a reset: a missed day adds nothing, and a day falling out of the stored window
// is folded into a per-month archive so the total never drops.
export const MAX_DAYS = 120;
/** Done days that have fallen out of the stored window, keyed 'YYYY-MM'. */
export type Archive = Record<string, number>;
export const isDone = (d: Day) => d.didIt === true;
const ymOf = (date: string) => date.slice(0, 7);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Keep the last `max` days by date; each dropped done day adds one to its month in the archive. Never mutates. */
export function trimDays(days: Day[], archive: Archive, max = MAX_DAYS): { days: Day[]; archive: Archive } {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cut = Math.max(0, sorted.length - max);
  const next = { ...archive };
  for (const d of sorted.slice(0, cut)) if (isDone(d)) next[ymOf(d.date)] = (next[ymOf(d.date)] ?? 0) + 1;
  return { days: sorted.slice(cut), archive: next };
}
/** Replace the record for d.date (or add it) through trimDays. No other date changes. */
export const putDay = (s: { days: Day[]; archive: Archive }, d: Day) => trimDays([...s.days.filter((x) => x.date !== d.date), d], s.archive);
export const totalDone = (days: Day[], archive: Archive) => days.filter(isDone).length + sum(Object.values(archive));
export const monthDone = (days: Day[], archive: Archive, ym: string) => days.filter((d) => isDone(d) && ymOf(d.date) === ym).length + (archive[ym] ?? 0);

/** Done days of the month, newest first. */
export function thisMonthEntries(days: Day[], ym: string): { date: string; text: string }[] {
  return days.filter((d) => isDone(d) && ymOf(d.date) === ym).sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((d) => ({ date: d.date, text: d.doneText ?? t('yourOneThing') }));
}
/** Months before `currentYm` with at least one done day, newest first. Empty months are never listed. */
export function earlierMonths(days: Day[], archive: Archive, currentYm: string): { ym: string; count: number }[] {
  const yms = new Set([...Object.keys(archive), ...days.map((d) => ymOf(d.date))]);
  return [...yms].filter((ym) => ym < currentYm).sort().reverse()
    .map((ym) => ({ ym, count: monthDone(days, archive, ym) })).filter((m) => m.count > 0);
}

// labels from the date parts as a UTC date, so the local zone never shifts the day
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(utc(y, m, 1));
}
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).formatToParts(utc(y, m, d));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')}`;
}

/** What closing the day says after "Did you do it?". Nothing until it is answered. */
export function closeLines(didIt: boolean | null, total: number): { note: string | null; count: string | null; first: boolean } {
  if (didIt === null) return { note: null, count: null, first: false };
  if (didIt) {
    return total <= 1
      ? { note: t('close.first'), count: t('close.firstCount'), first: true }
      : { note: t('close.good'), count: fmt.closeCount(fmt.daysWord(total)), first: false };
  }
  return { note: t('close.alright'), count: total === 0 ? null : fmt.closeCount(fmt.daysWord(total)), first: false };
}

// ---------- bad days ----------
export interface BadDay { missedDays: number; late: boolean; bad: boolean; firstVisit: boolean }
/** Missed days = full days skipped since the last day with content. Late = opened at/after the welcomeFraming cutoff
 *  (LATE_CUTOFFS in src/method.ts, Q1).
 *  A first visit (no prior days) is never a bad day: there is nothing to come "back" from. */
export function badDay(history: Day[], now: Date): BadDay {
  const today = dayKey(now);
  const prev = lastDay(history, today);
  const missedDays = prev ? Math.max(0, daysBetween(prev.date, today) - 1) : 0;
  const late = lateAt(now.getHours(), 'welcomeFraming');
  const firstVisit = !prev;
  return { missedDays, late, bad: !firstVisit && (missedDays > 0 || late), firstVisit };
}
/** Welcome framing by the hour alone: before the welcomeFraming cutoff it is "before email" with the hour-before line,
 *  first visit or not, bad day or not; a late start meets the user where they are. */
export function welcomeFraming(bad: BadDay): { eyebrow: string; showHourLine: boolean } {
  return bad.late ? { eyebrow: t('welcome.eyebrow.late'), showHourLine: false } : { eyebrow: t('welcome.eyebrow.morning'), showHourLine: true };
}

// ---------- reminder ----------
export * from './logic/reminder';
