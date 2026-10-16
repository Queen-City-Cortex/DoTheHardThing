import { MAX_DAYS, supersedes, trimDays, type Archive, type Day } from './logic';
import { decodeDays, isObj } from './decode';
const KEY = 'one-thing:v3';
const OLD_KEY = 'one-thing:v2'; // read once to migrate, never written or deleted
export interface Store { days: Day[]; reminder: string | null; archive: Archive }
const empty = (): Store => ({ days: [], reminder: null, archive: {} });
/** Days as stored, decoded by decode.ts so nothing unreadable reaches the app. */
const readDays = decodeDays;
function readArchive(raw: unknown): Archive {
  if (!isObj(raw)) return {};
  const a: Archive = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}$/.test(k) || typeof v !== 'number' || !Number.isInteger(v) || v < 0) return {};
    a[k] = v;
  }
  return a;
}
const readReminder = (r: unknown) => (typeof r === 'string' ? r : null);

/** A v3 store, or null if the key is absent or not a store. */
function readV3(): Store | null {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!Array.isArray(s?.days)) return null;
  return { reminder: readReminder(s.reminder), ...trimDays(readDays(s.days), readArchive(s.archive)) };
}
/** v2 had no "Did you do it?": a full block (gotBlock true) is the best answer it holds; anything else stays unanswered. */
export function migrateV2(raw: unknown): Store {
  if (!isObj(raw) || !Array.isArray(raw.days)) return empty();
  const days = readDays(raw.days).map((d) => {
    const didIt = d.gotBlock === true ? true : null;
    const item = didIt && Array.isArray(d.items) ? d.items.find((i) => i.id === d.chosenId) : undefined;
    return { ...d, didIt, doneText: item ? item.text : null };
  });
  return { reminder: readReminder(raw.reminder), ...trimDays(days, {}) };
}
export function load(): Store {
  try {
    if (localStorage.getItem(KEY) == null) return migrateV2(JSON.parse(localStorage.getItem(OLD_KEY) || 'null'));
    return readV3() ?? empty();
  } catch { /* blocked or corrupt: start fresh */ }
  return empty();
}

/** Merge what is stored (maybe written by another tab) with this tab's store. The open day is this tab's, unless
 *  another tab closed it while this one was stale (`supersedes`); any other day takes the stored copy when there
 *  is one, since another tab may have finished it.
 *  A side whose window is full has already folded its older days into its archive, so the other side's
 *  days before that window are left out; archives merge by max per month. Neither can double count. */
export function mergeStores(stored: Store, mine: Store, openDate?: string): Store {
  const floor = (s: Store) => (s.days.length >= MAX_DAYS ? s.days.reduce((m, d) => (d.date < m ? d.date : m), s.days[0].date) : '');
  const keep = (other: Store) => { const f = floor(other); return (d: Day) => d.date === openDate || d.date >= f; };
  const byDate = new Map<string, Day>();
  for (const d of mine.days.filter(keep(stored))) byDate.set(d.date, d);
  for (const d of stored.days.filter(keep(mine))) {
    const own = d.date === openDate ? byDate.get(d.date) : undefined;
    if (!own || supersedes(d, own)) byDate.set(d.date, d);
  }
  const archive: Archive = { ...stored.archive };
  for (const [ym, n] of Object.entries(mine.archive)) archive[ym] = Math.max(archive[ym] ?? 0, n);
  return { reminder: mine.reminder, ...trimDays([...byDate.values()], archive) };
}
/** Pull in what other tabs have saved, keeping this tab's open day. */
export const refresh = (mine: Store, openDate: string): Store => mergeStores(load(), mine, openDate);

/** Never throws: returns false if storage is blocked or full. Merges with the stored copy first so another tab's work survives. */
export function save(s: Store, openDate?: string): boolean {
  try {
    let stored: Store | null = null;
    try { stored = readV3(); } catch { /* corrupt: overwrite it */ }
    localStorage.setItem(KEY, JSON.stringify(stored ? mergeStores(stored, s, openDate) : s));
    return true;
  } catch { return false; }
}
