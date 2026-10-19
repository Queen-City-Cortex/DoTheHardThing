import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { it_, day, MIN } from './helpers.testlib';

describe('carry-over', () => {
  it('carries leftovers with a rising pushed count, dropping the one thing the user did', () => {
    const h = [
      day('2026-10-10', [it_('old', 'anxious')]),
      day('2026-10-13', [it_('x', 'risky', true, true, 0), it_('y', 'pushed', true, false, 2)], { chosenId: 'x', didIt: true, doneText: 'x' }),
    ];
    expect(L.leftovers(h, '2026-10-14')).toEqual([{ text: 'y', pushedCount: 3, tags: ['pushed'] }]);
  });
  it('keeps the one thing after Not today, or when the day was never answered', () => {
    for (const didIt of [false, null]) {
      const h = [day('2026-10-13', [it_('x', 'risky')], { chosenId: 'x', didIt })];
      expect(L.leftovers(h, '2026-10-14'), String(didIt)).toEqual([{ text: 'x', pushedCount: 1, tags: ['risky'] }]);
    }
  });
  it('a Yes drops the one thing however short the block was', () => {
    const blocks = [L.stop(L.startBlock(120, 0), 5 * MIN), L.settle(L.startBlock(60, 0, true), 999 * MIN), L.resume(L.pause(L.startBlock(120, 0), MIN), 20 * MIN)];
    for (const block of blocks) {
      const h = [day('2026-10-13', [it_('x', 'risky'), it_('y', 'anxious')], { chosenId: 'x', block, gotBlock: false, didIt: true, doneText: 'x' })];
      expect(L.leftovers(h, '2026-10-14')).toEqual([{ text: 'y', pushedCount: 1, tags: ['anxious'] }]);
    }
  });
  it('Not today keeps the one thing even after a full block; gotBlock is never read', () => {
    const block = L.settle(L.startBlock(120, 0), 999 * MIN);
    const notToday = [day('2026-10-13', [it_('x', 'risky')], { chosenId: 'x', block, gotBlock: true, didIt: false })];
    expect(L.leftovers(notToday, '2026-10-14').map((l) => l.text)).toEqual(['x']);
    const unanswered = [day('2026-10-13', [it_('x', 'risky')], { chosenId: 'x', block, gotBlock: true })];
    expect(L.leftovers(unanswered, '2026-10-14').map((l) => l.text)).toEqual(['x']);
  });
  it('a Yes with no chosen item drops nothing', () => {
    const h = [day('2026-10-13', [it_('x', 'risky')], { didIt: true })];
    expect(L.leftovers(h, '2026-10-14').map((l) => l.text)).toEqual(['x']);
  });
  it('drops No/No items: they were considered and set aside', () => {
    const h = [day('2026-10-13', [it_('x', 'anxious', false, false), it_('y', 'risky', true, true)])];
    expect(L.leftovers(h, '2026-10-14').map((l) => l.text)).toEqual(['y']);
  });
  it('carries Yes/No and No/Yes items', () => {
    const h = [day('2026-10-13', [it_('x', 'anxious', true, false), it_('y', 'pushed', false, true)])];
    expect(L.leftovers(h, '2026-10-14').map((l) => l.text)).toEqual(['x', 'y']);
  });
  it('carries items never answered (day abandoned), including a half-answered one', () => {
    const h = [day('2026-10-13', [it_('x', 'anxious'), it_('y', 'risky', false, null)])];
    expect(L.leftovers(h, '2026-10-14').map((l) => l.text)).toEqual(['x', 'y']);
  });
  it('keeps the original tag and raises the pushed count', () => {
    const h = [day('2026-10-13', [it_('r', 'risky', true, true, 2), it_('a', 'anxious', true, false), it_('p', 'pushed', null, null, 1)])];
    expect(L.leftovers(h, '2026-10-14')).toEqual([
      { text: 'r', pushedCount: 3, tags: ['risky'] }, { text: 'a', pushedCount: 1, tags: ['anxious'] }, { text: 'p', pushedCount: 2, tags: ['pushed'] },
    ]);
  });
  it('keeps every tag of a multi-tag item; No/No and a done one thing still drop', () => {
    const block = L.settle(L.startBlock(120, 0), 999 * MIN);
    const h = [day('2026-10-13', [
      it_('done', ['pushed', 'risky'], true, true), it_('both', ['pushed', 'risky', 'anxious'], true, false, 1), it_('aside', ['risky', 'anxious'], false, false),
    ], { chosenId: 'done', block, gotBlock: true, didIt: true, doneText: 'done' })];
    expect(L.leftovers(h, '2026-10-14')).toEqual([{ text: 'both', pushedCount: 2, tags: ['pushed', 'risky', 'anxious'] }]);
  });
  it('ignores today and empty history', () => {
    expect(L.leftovers([day('2026-10-14', [it_('a', 'risky')])], '2026-10-14')).toEqual([]);
  });
});

describe('bad days', () => {
  const real = (date: string) => day(date, [it_('a', 'risky')]);
  const h = [real('2026-10-10')];
  it('counts missed days since the last open', () => {
    expect(L.badDay(h, new Date(2026, 9, 14, 7))).toEqual({ missedDays: 3, late: false, bad: true, firstVisit: false });
    expect(L.badDay([real('2026-10-13')], new Date(2026, 9, 14, 7)).bad).toBe(false);
  });
  it('flags a late open', () => {
    expect(L.badDay(h, new Date(2026, 9, 14, 11, 30)).late).toBe(true);
    expect(L.badDay([real('2026-10-13')], new Date(2026, 9, 14, 11, 30))).toEqual({ missedDays: 0, late: true, bad: true, firstVisit: false });
    expect(L.badDay([real('2026-10-13')], new Date(2026, 9, 14, 10, 59)).bad).toBe(false);
  });
  it('never treats a first visit as a bad day, even when late', () => {
    expect(L.badDay([], new Date(2026, 9, 14, 18, 57))).toEqual({ missedDays: 0, late: true, bad: false, firstVisit: true });
    expect(L.badDay([], new Date(2026, 9, 14, 7)).bad).toBe(false);
  });
  it('a peek-only evening visit does not count: next morning is still a first visit', () => {
    const peek = day('2026-10-13', [it_('', 'anxious')], { openedAt: new Date(2026, 9, 13, 21).getTime() });
    expect(L.badDay([peek], new Date(2026, 9, 14, 7))).toEqual({ missedDays: 0, late: false, bad: false, firstVisit: true });
  });
  it('measures missed days from the last day with content', () => {
    expect(L.badDay([real('2026-10-10'), day('2026-10-13', [])], new Date(2026, 9, 14, 7)).missedDays).toBe(3);
  });
  describe('welcomeFraming: the hour-before line shows on every morning welcome', () => {
    const at = (history: L.Day[], hour: number) => L.welcomeFraming(L.badDay(history, new Date(2026, 9, 14, hour)));
    const morning = { eyebrow: 'Before email', showHourLine: true };
    const late = { eyebrow: 'Start where you are', showHourLine: false };
    it('first visit, morning', () => { expect(at([], 8)).toEqual(morning); });
    it('first visit, late', () => { expect(at([], 18)).toEqual(late); });
    it('returning, normal morning', () => { expect(at([real('2026-10-13')], 8)).toEqual(morning); });
    it('returning after missed days, morning (bad but not late)', () => { expect(at(h, 8)).toEqual(morning); });
    it('returning, late', () => { expect(at([real('2026-10-13')], 14)).toEqual(late); });
  });
});

describe('hasContent', () => {
  it('needs a filled item or a block', () => {
    expect(L.hasContent(day('2026-10-13', []))).toBe(false);
    expect(L.hasContent(day('2026-10-13', [it_('  ', 'risky')]))).toBe(false);
    expect(L.hasContent(day('2026-10-13', [it_('a', 'risky')]))).toBe(true);
    expect(L.hasContent(day('2026-10-13', [], { block: L.startBlock(120, 0) }))).toBe(true);
  });
  it('Mon real, Tue empty, Wed: Monday leftovers are offered', () => {
    const h = [day('2026-10-12', [it_('mon', 'risky')]), day('2026-10-13', [])];
    expect(L.leftovers(h, '2026-10-14')).toEqual([{ text: 'mon', pushedCount: 1, tags: ['risky'] }]);
  });
});
