import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { fmt } from '../copy';
import { day } from './helpers.testlib';

describe('reminder', () => {
  it('schedules the next occurrence', () => {
    expect(L.nextReminder('06:30', new Date(2026, 9, 14, 5)).getDate()).toBe(14);
    expect(L.nextReminder('06:30', new Date(2026, 9, 14, 7)).getDate()).toBe(15);
  });
  it('says honestly whether a reminder is set', () => {
    const PICK = 'Pick a time and your browser will ask for permission.';
    const BLOCKED = 'Notifications are blocked for this site, so no reminder can be set. Allow them in your browser settings.';
    expect(L.reminderStatus('unsupported', 'granted', '06:30')).toEqual({ active: false, message: "Notifications aren't available on this device. On iPhone, add to Home Screen first." });
    expect(L.reminderStatus('open-only', 'denied', null)).toEqual({ active: false, message: BLOCKED });
    expect(L.reminderStatus('trigger', 'denied', '06:30')).toEqual({ active: false, message: BLOCKED });
    expect(L.reminderStatus('open-only', 'default', null)).toEqual({ active: false, message: PICK });
    expect(L.reminderStatus('trigger', 'default', '06:30')).toEqual({ active: false, message: PICK });
    expect(L.reminderStatus('open-only', 'granted', null)).toEqual({ active: false, message: 'Notifications are allowed. Pick a time.' });
    expect(L.reminderStatus('open-only', 'granted', '06:30')).toEqual({ active: true, message: 'Reminder set for 06:30. It only fires while this app is open.' });
    expect(L.reminderStatus('trigger', 'granted', '06:30')).toEqual({ active: true, message: 'Reminder set for 06:30. It is scheduled on this device and refreshed each time you open the app.' });
  });
});

describe('counts: gentle and up-only', () => {
  const done = (date: string, text: string | null = 'x') => day(date, [], { didIt: true, doneText: text });
  const not = (date: string, didIt: boolean | null = false) => day(date, [], { didIt });
  const dates = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

  it('isDone reads only didIt, never gotBlock', () => {
    expect(L.isDone(done('2026-10-14'))).toBe(true);
    expect(L.isDone(not('2026-10-14'))).toBe(false);
    expect(L.isDone(not('2026-10-14', null))).toBe(false);
    expect(L.isDone(day('2026-10-14', [], { gotBlock: true }))).toBe(false);
  });
  it('trimDays sorts, keeps the last max, and archives only dropped done days, without mutating', () => {
    const days = [done('2026-03-02'), not('2026-01-05'), done('2026-02-01'), done('2026-01-04'), not('2026-03-01')];
    const archive = { '2026-01': 2 };
    const r = L.trimDays(days, archive, 2);
    expect(r.days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02']);
    expect(r.archive).toEqual({ '2026-01': 3, '2026-02': 1 });
    expect(archive).toEqual({ '2026-01': 2 });
    expect(days[0].date).toBe('2026-03-02');
    expect(L.trimDays(days, {}).days).toHaveLength(5);
    expect(L.trimDays(days, {}, 0)).toEqual({ days: [], archive: { '2026-01': 1, '2026-02': 1, '2026-03': 1 } });
  });
  it('totalDone and monthDone add the archive', () => {
    const days = [done('2026-10-01'), not('2026-10-02'), done('2026-09-30'), not('2026-10-03', null)];
    expect(L.totalDone(days, { '2026-05': 3, '2026-10': 1 })).toBe(6);
    expect(L.totalDone([], {})).toBe(0);
    expect(L.monthDone(days, { '2026-10': 1 }, '2026-10')).toBe(2);
    expect(L.monthDone(days, {}, '2026-09')).toBe(1);
    expect(L.monthDone(days, {}, '2026-08')).toBe(0);
  });
  it('thisMonthEntries: done days of the month, newest first, with a fallback text', () => {
    const days = [done('2026-10-02', 'Taxes'), done('2026-09-30'), not('2026-10-03'), done('2026-10-09', null), done('2026-10-05', 'Call')];
    expect(L.thisMonthEntries(days, '2026-10')).toEqual([
      { date: '2026-10-09', text: 'Your one thing' }, { date: '2026-10-05', text: 'Call' }, { date: '2026-10-02', text: 'Taxes' },
    ]);
    expect(L.thisMonthEntries(days, '2026-11')).toEqual([]);
  });
  it('earlierMonths: months before this one with a count, newest first, never an empty month', () => {
    const days = [done('2026-10-02'), done('2026-09-30'), done('2026-09-01'), not('2026-08-15'), done('2026-06-01')];
    expect(L.earlierMonths(days, { '2026-06': 2, '2025-12': 1, '2026-07': 0 }, '2026-10')).toEqual([
      { ym: '2026-09', count: 2 }, { ym: '2026-06', count: 3 }, { ym: '2025-12', count: 1 },
    ]);
    expect(L.earlierMonths([], {}, '2026-10')).toEqual([]);
  });
  it('labels months and days from the date parts, whatever the local zone', () => {
    expect(L.monthLabel('2026-10')).toBe('October');
    expect(L.monthLabel('2026-01')).toBe('January');
    expect(L.dayLabel('2026-10-14')).toBe('Wed 14');
    expect(L.dayLabel('2026-11-01')).toBe('Sun 1');
    expect(fmt.daysWord(1)).toBe('1 day');
    expect(fmt.daysWord(0)).toBe('0 days');
    expect(fmt.daysWord(12)).toBe('12 days');
  });
  it('closeLines: exact copy', () => {
    expect(L.closeLines(null, 5)).toEqual({ note: null, count: null, first: false });
    expect(L.closeLines(true, 1)).toEqual({ note: "That's your first one. Nothing else to add.", count: 'Your first day. It starts here.', first: true });
    expect(L.closeLines(true, 0).first).toBe(true);
    expect(L.closeLines(true, 2)).toEqual({ note: "Good. That's the whole thing for today.", count: "2 days you've done your one thing since you started", first: false });
    expect(L.closeLines(false, 0)).toEqual({ note: "That's alright. It'll still be there tomorrow.", count: null, first: false });
    expect(L.closeLines(false, 1)).toEqual({ note: "That's alright. It'll still be there tomorrow.", count: "1 day you've done your one thing since you started", first: false });
    expect(L.closeLines(false, 7).count).toBe("7 days you've done your one thing since you started");
  });
  describe('Start today over: only today’s own contribution can leave the count', () => {
    const today = '2026-10-14';
    const earlier = [done('2026-10-10', 'a'), not('2026-10-11'), done('2026-10-12', 'b'), not('2026-10-13', null)];
    const archive = { '2026-05': 2 };
    for (const [label, mine, drop] of [['Yes', done(today, 'raise'), 1], ['Not today', not(today), 0], ['unanswered', not(today, null), 0]] as const) {
      it(`today answered ${label}: the total drops by ${drop} and every other day is untouched`, () => {
        const s = L.putDay({ days: earlier, archive }, mine);
        const reset = L.putDay(s, L.newDay(today, 123));
        expect(L.totalDone(reset.days, reset.archive)).toBe(L.totalDone(s.days, s.archive) - drop);
        expect(reset.days.filter((d) => d.date !== today)).toEqual(earlier);
        expect(reset.archive).toEqual(archive);
        expect(reset.days.find((d) => d.date === today)).toEqual({ ...L.newDay(today, 123) });
      });
    }
    it('with a full 120-day window, the reset folds nothing into the archive', () => {
      const ds = dates(L.MAX_DAYS);
      const s = L.trimDays(ds.map((d) => done(d)), {});
      const reset = L.putDay(s, L.newDay(ds[ds.length - 1], 0));
      expect(reset.archive).toEqual({});
      expect(reset.days).toHaveLength(L.MAX_DAYS);
      expect(L.totalDone(reset.days, reset.archive)).toBe(L.MAX_DAYS - 1);
    });
    it('newDay is an empty, unanswered, open record', () => {
      expect(L.newDay('2026-10-14', 5)).toEqual({ date: '2026-10-14', openedAt: 5, items: [], chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false });
    });
  });
  it('supersedes: a closed copy beats a stale open one, never a newer start-over', () => {
    const closed = day('2026-10-14', [], { openedAt: 10, closed: true, didIt: true });
    expect(L.supersedes(closed, day('2026-10-14', [], { openedAt: 10 }))).toBe(true);
    expect(L.supersedes(closed, day('2026-10-14', [], { openedAt: 5 }))).toBe(true);
    expect(L.supersedes(closed, L.newDay('2026-10-14', 11))).toBe(false); // started over after it closed
    expect(L.supersedes(closed, { ...closed, didIt: false })).toBe(false); // both closed: mine
    expect(L.supersedes(day('2026-10-14', [], { openedAt: 10 }), day('2026-10-14', [], { openedAt: 5 }))).toBe(false);
  });
  it('up-only: appending days one by one through trimDays, the total never drops and the archive is exact', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const all = dates(400).map((d) => (rand() < 0.5 ? done(d) : not(d, rand() < 0.5 ? false : null)));
    let s = { days: [] as L.Day[], archive: {} as L.Archive };
    for (const [i, d] of all.entries()) {
      const before = L.totalDone(s.days, s.archive);
      const added = [...s.days, d];
      const untrimmed = L.totalDone(added, s.archive);
      expect(untrimmed).toBe(before + (L.isDone(d) ? 1 : 0)); // a done day adds one, anything else adds nothing
      s = L.trimDays(added, s.archive);
      expect(L.totalDone(s.days, s.archive)).toBe(untrimmed); // trimming never changes the total
      expect(s.days.length).toBe(Math.min(i + 1, L.MAX_DAYS));
    }
    const expected: L.Archive = {};
    for (const d of all.slice(0, all.length - L.MAX_DAYS).filter(L.isDone)) expected[d.date.slice(0, 7)] = (expected[d.date.slice(0, 7)] ?? 0) + 1;
    expect(s.archive).toEqual(expected);
    expect(L.totalDone(s.days, s.archive)).toBe(all.filter(L.isDone).length);
  });
});