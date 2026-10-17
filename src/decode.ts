// The only place untrusted stored JSON becomes a Day. Everything past this file may trust the types.
// Policy: repair what is safely repairable (missing optional fields), drop what is not (an item or day that cannot be read).
import type { Block, Day, Item, Tag } from './logic';

const TAGS: Tag[] = ['pushed', 'risky', 'anxious'];
const REASONS = ['complete', 'broken', 'stopped'] as const;
export const isObj = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const numOr = (x: unknown, d: number) => (num(x) ? x : d);
const nullableNum = (x: unknown): number | null => (num(x) ? x : null);
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/; // a real month and day number; not a calendar check

/** Items stored before multi-tag had one `tag`; anything unreadable counts as pushed. */
export function decodeItem(raw: unknown): Item | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.text !== 'string') return null;
  const from = Array.isArray(raw.tags) ? raw.tags : [raw.tag];
  const tags = TAGS.filter((t) => from.includes(t));
  return {
    id: raw.id, text: raw.text, tags: tags.length ? tags : ['pushed'],
    satisfied: typeof raw.satisfied === 'boolean' ? raw.satisfied : null,
    leverage: typeof raw.leverage === 'boolean' ? raw.leverage : null,
    pushedCount: num(raw.pushedCount) && raw.pushedCount >= 0 ? Math.floor(raw.pushedCount) : 0,
  };
}

/** A block that cannot be read is dropped (the day keeps its items); a half-readable one is not guessed at. */
export function decodeBlock(raw: unknown): Block | null {
  if (!isObj(raw) || !num(raw.targetMin) || !num(raw.startedAt)) return null;
  const reason = REASONS.find((r) => r === raw.endReason) ?? null;
  const endedAt = nullableNum(raw.endedAt);
  return {
    targetMin: raw.targetMin, startedAt: raw.startedAt, pausedAt: nullableNum(raw.pausedAt), pausedMs: Math.max(0, numOr(raw.pausedMs, 0)),
    ...(num(raw.breaks) ? { breaks: raw.breaks } : {}),
    endedAt, endReason: endedAt == null ? null : reason,
    drifts: Array.isArray(raw.drifts) ? raw.drifts.filter(num) : [],
  };
}

/** A day with no readable date is dropped. Items that cannot be read are dropped one by one. */
export function decodeDay(raw: unknown): Day | null {
  if (!isObj(raw) || typeof raw.date !== 'string' || !DATE.test(raw.date)) return null;
  const items = (Array.isArray(raw.items) ? raw.items : []).map(decodeItem).filter((i): i is Item => i !== null);
  const chosenId = typeof raw.chosenId === 'string' && items.some((i) => i.id === raw.chosenId) ? raw.chosenId : null;
  return {
    date: raw.date, openedAt: numOr(raw.openedAt, 0), items, chosenId, block: decodeBlock(raw.block),
    gotBlock: typeof raw.gotBlock === 'boolean' ? raw.gotBlock : null,
    didIt: typeof raw.didIt === 'boolean' ? raw.didIt : null,
    doneText: typeof raw.doneText === 'string' ? raw.doneText : null,
    closed: raw.closed === true,
  };
}

export const decodeDays = (raw: unknown): Day[] => (Array.isArray(raw) ? raw.map(decodeDay).filter((d): d is Day => d !== null) : []);
