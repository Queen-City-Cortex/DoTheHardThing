import { describe, it, expect, afterEach, vi } from 'vitest';
import { load, mergeStores, migrateV2, refresh, save, type Store } from './storage';
import * as L from './logic';

const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const EMPTY: Store = { days: [], reminder: null, archive: {} };
const day = (date: string, extra: Partial<L.Day> = {}): L.Day => ({ date, openedAt: 0, items: [], chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false, ...extra });
const done = (date: string, text = 'x') => day(date, { didIt: true, doneText: text, closed: true });
/** `n` consecutive dates from 2026-01-01. */
const dates = (n: number, from = 0) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + from + i)).toISOString().slice(0, 10));

afterEach(() => { vi.unstubAllGlobals(); });

describe('storage', () => {
  it('round-trips through localStorage, archive included', () => {
    vi.stubGlobal('localStorage', memory());
    const s: Store = { days: [done('2026-10-13', 'Taxes')], reminder: '06:30', archive: { '2026-05': 3 } };
    expect(save(s)).toBe(true);
    expect(load()).toEqual(s);
  });
  it('does not throw when localStorage throws', () => {
    vi.stubGlobal('localStorage', throwing);
    expect(save(EMPTY)).toBe(false);
    expect(load()).toEqual(EMPTY);
  });
  it('does not throw when localStorage is missing or holds junk', () => {
    expect(save(EMPTY)).toBe(false);
    expect(load()).toEqual(EMPTY);
    for (const junk of ['null', '{', '[]', '{"days":5}']) {
      const m = memory(); m.setItem('one-thing:v3', junk);
      vi.stubGlobal('localStorage', m);
      expect(load()).toEqual(EMPTY);
      expect(save({ ...EMPTY, reminder: '07:00' })).toBe(true); // a corrupt store never blocks saving
      expect(load()).toEqual({ ...EMPTY, reminder: '07:00' });
    }
  });
  it('sanitizes the archive and defaults the answer fields', () => {
    const m = memory();
    m.setItem('one-thing:v3', JSON.stringify({ reminder: 5, archive: { '2026-05': 2, '2026-6': 1 }, days: [{ ...day('2026-10-13'), didIt: undefined, doneText: 3 }, null, { nodate: 1 }] }));
    vi.stubGlobal('localStorage', m);
    expect(load()).toEqual({ reminder: null, archive: {}, days: [day('2026-10-13')] });
    for (const archive of [[1], 'x', { '2026-05': -1 }, { '2026-05': 1.5 }, { '2026-05': '2' }]) {
      m.setItem('one-thing:v3', JSON.stringify({ days: [], archive }));
      expect(load().archive).toEqual({});
    }
    m.setItem('one-thing:v3', JSON.stringify({ days: [], archive: { '2026-05': 0, '2025-12': 4 } }));
    expect(load().archive).toEqual({ '2026-05': 0, '2025-12': 4 });
  });
  it('turns an old single `tag` into `tags`, keeps valid tags, and falls back to pushed', () => {
    const m = memory();
    const base = { satisfied: true, leverage: null, pushedCount: 1 };
    const old = (items: unknown[]) => ({ date: '2026-10-13', openedAt: 0, items, chosenId: 'a', block: null, gotBlock: null, closed: false });
    m.setItem('one-thing:v2', JSON.stringify({ reminder: '06:30', days: [old([
      { id: 'a', text: 'Ask for the raise', tag: 'risky', ...base },
      { id: 'b', text: 'Taxes', tags: ['pushed', 'anxious'], ...base },
      { id: 'c', text: 'Odd', tag: 'nonsense', ...base },
      { id: 'd', text: 'No tag', ...base },
      { id: 'e', text: 'Unordered', tags: ['anxious', 'risky', 'anxious'], ...base },
    ])] }));
    vi.stubGlobal('localStorage', m);
    const s = load();
    expect(s.reminder).toBe('06:30');
    expect(s.days[0].chosenId).toBe('a');
    expect(s.days[0].items).toEqual([
      { id: 'a', text: 'Ask for the raise', tags: ['risky'], ...base },
      { id: 'b', text: 'Taxes', tags: ['pushed', 'anxious'], ...base },
      { id: 'c', text: 'Odd', tags: ['pushed'], ...base },
      { id: 'd', text: 'No tag', tags: ['pushed'], ...base },
      { id: 'e', text: 'Unordered', tags: ['risky', 'anxious'], ...base },
    ]);
    expect(s.days[0].items.some((i) => 'tag' in i)).toBe(false);
  });
});

describe('migrating v2 to v3', () => {
  const item = (id: string, text: string) => ({ id, text, tag: 'risky', satisfied: true, leverage: true, pushedCount: 0 });
  const old = (date: string, gotBlock: boolean | null, chosenId: string | null = 'a') =>
    ({ date, openedAt: 0, items: [item('a', 'Ask for the raise'), item('b', 'Taxes')], chosenId, block: null, gotBlock, closed: true });
  it('a full block (gotBlock true) becomes didIt true with the chosen text; false or null stays unanswered', () => {
    const s = migrateV2({ reminder: '06:30', days: [old('2026-10-13', true), old('2026-10-12', false), old('2026-10-11', null), old('2026-10-10', true, 'gone')] });
    expect(s.reminder).toBe('06:30');
    expect(s.archive).toEqual({});
    expect(s.days.map((d) => [d.date, d.gotBlock, d.didIt, d.doneText])).toEqual([
      ['2026-10-10', true, true, null], ['2026-10-11', null, null, null], ['2026-10-12', false, null, null], ['2026-10-13', true, true, 'Ask for the raise'],
    ]);
    expect(s.days[3].items[0].tags).toEqual(['risky']);
    expect(L.totalDone(s.days, s.archive)).toBe(2);
  });
  it('folds anything past 120 days into the archive', () => {
    const ds = dates(125);
    const s = migrateV2({ days: ds.map((d, i) => old(d, i % 2 === 0)) });
    expect(s.days).toHaveLength(120);
    expect(s.days[0].date).toBe(ds[5]);
    expect(s.archive).toEqual({ '2026-01': 3 }); // days 0, 2, 4
    expect(L.totalDone(s.days, s.archive)).toBe(63);
  });
  it('handles junk', () => {
    for (const junk of [null, 5, 'x', [], { days: 'no' }]) expect(migrateV2(junk)).toEqual(EMPTY);
  });
  it('load migrates when v3 is absent, leaves v2 untouched, and the next save writes v3', () => {
    const m = memory();
    const v2 = JSON.stringify({ reminder: '06:30', days: [old('2026-10-13', true)] });
    m.setItem('one-thing:v2', v2);
    vi.stubGlobal('localStorage', m);
    const s = load();
    expect(s.days[0].didIt).toBe(true);
    expect(s.days[0].doneText).toBe('Ask for the raise');
    expect(m.getItem('one-thing:v3')).toBeNull();
    expect(save(s, '2026-10-14')).toBe(true);
    expect(m.getItem('one-thing:v2')).toBe(v2);
    expect(load()).toEqual(s);
    // once v3 exists, v2 is no longer read
    m.setItem('one-thing:v2', JSON.stringify({ days: [] }));
    expect(load()).toEqual(s);
  });
});

describe('mergeStores: limit multi-tab overwrite', () => {
  it('days are the union by date', () => {
    const m = mergeStores({ ...EMPTY, days: [day('2026-10-12')] }, { ...EMPTY, days: [day('2026-10-13')] }, '2026-10-13');
    expect(m.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']);
  });
  it('the open day is mine; any other day takes the stored copy (another tab may have closed it)', () => {
    const stored: Store = { ...EMPTY, days: [done('2026-10-12', 'theirs'), day('2026-10-13', { chosenId: 'theirs' })] };
    const mine: Store = { ...EMPTY, reminder: '06:30', days: [day('2026-10-12'), day('2026-10-13', { chosenId: 'mine' })] };
    const m = mergeStores(stored, mine, '2026-10-13');
    expect(m.days).toEqual([done('2026-10-12', 'theirs'), day('2026-10-13', { chosenId: 'mine' })]);
    expect(m.reminder).toBe('06:30');
    // with no open day, the stored copy wins everywhere it exists
    expect(mergeStores(stored, mine).days[1].chosenId).toBe('theirs');
  });
  it('a stale tab never overwrites the open day another tab closed; starting over afterwards still does', () => {
    const theirs = done('2026-10-14', 'Ask for the raise'); // openedAt 0, closed by the other tab
    const stale: Store = { ...EMPTY, days: [day('2026-10-14', { items: [{ id: 'n', text: 'New', tags: ['pushed'], satisfied: null, leverage: null, pushedCount: 0 }] })] };
    expect(mergeStores({ ...EMPTY, days: [theirs] }, stale, '2026-10-14').days).toEqual([theirs]);
    const restarted: Store = { ...EMPTY, days: [L.newDay('2026-10-14', 1)] };
    expect(mergeStores({ ...EMPTY, days: [theirs] }, restarted, '2026-10-14').days).toEqual(restarted.days);
    vi.stubGlobal('localStorage', memory());
    save({ ...EMPTY, days: [theirs] }, '2026-10-14');
    expect(save(stale, '2026-10-14')).toBe(true);
    expect(load().days).toEqual([theirs]);
  });
  it('archives merge by max per month', () => {
    const m = mergeStores({ ...EMPTY, archive: { '2026-01': 2, '2026-02': 1 } }, { ...EMPTY, archive: { '2026-01': 1, '2026-03': 4 } });
    expect(m.archive).toEqual({ '2026-01': 2, '2026-02': 1, '2026-03': 4 });
  });
  it('two tabs folding the same day never double count', () => {
    const all = dates(121).map((d) => done(d));
    const folded = L.trimDays(all, {}); // one tab added day 121 and folded day 1
    const stale: Store = { ...EMPTY, days: all.slice(0, 120) }; // the other still holds day 1
    expect(L.totalDone(folded.days, folded.archive)).toBe(121);
    for (const [a, b] of [[{ ...EMPTY, ...folded }, stale], [stale, { ...EMPTY, ...folded }]]) {
      const m = mergeStores(a, b, all[120].date);
      expect(m.days).toHaveLength(120);
      expect(L.totalDone(m.days, m.archive)).toBe(121);
    }
    // both tabs folded it: max, not sum
    const both = mergeStores({ ...EMPTY, ...folded }, { ...EMPTY, ...folded }, all[120].date);
    expect(both.archive).toEqual({ '2026-01': 1 });
    expect(L.totalDone(both.days, both.archive)).toBe(121);
  });
  it('trims the union to the window', () => {
    const ds = dates(130).map((d) => done(d));
    const m = mergeStores({ ...EMPTY, days: ds.slice(0, 70) }, { ...EMPTY, days: ds.slice(60) }, ds[129].date);
    expect(m.days).toHaveLength(120);
    expect(L.totalDone(m.days, m.archive)).toBe(130);
  });
  it('refresh pulls another tab’s saved days and keeps the open day', () => {
    const m = memory();
    vi.stubGlobal('localStorage', m);
    save({ ...EMPTY, days: [done('2026-10-13', 'theirs'), day('2026-10-14', { chosenId: 'theirs' })] });
    const r = refresh({ ...EMPTY, days: [day('2026-10-14', { chosenId: 'mine' })] }, '2026-10-14');
    expect(r.days).toEqual([done('2026-10-13', 'theirs'), day('2026-10-14', { chosenId: 'mine' })]);
  });
  it('save merges with what another tab stored', () => {
    vi.stubGlobal('localStorage', memory());
    save({ ...EMPTY, days: [done('2026-10-13', 'theirs')] }, '2026-10-13');
    expect(save({ ...EMPTY, days: [day('2026-10-13'), day('2026-10-14')] }, '2026-10-14')).toBe(true);
    expect(load().days).toEqual([done('2026-10-13', 'theirs'), day('2026-10-14')]);
  });
});
