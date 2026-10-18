import { describe, it, expect } from 'vitest';
import * as L from './logic';
import { BLOCK_MIN } from './method';
import { fmt } from './copy';

const it_ = (text: string, tag: L.Tag | L.Tag[], s: boolean | null = null, l: boolean | null = null, pushedCount = 0): L.Item => ({ id: text, text, tags: [tag].flat(), satisfied: s, leverage: l, pushedCount });
const day = (date: string, items: L.Item[], extra: Partial<L.Day> = {}): L.Day => ({ date, openedAt: 0, items, chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false, ...extra });
const MIN = 60_000;

describe('naming and tagging', () => {
  it('tags items and caps at 5, ignoring blanks; the same text under another tag gains that tag', () => {
    let xs: L.Item[] = [];
    xs = L.addItem(xs, 'Taxes', 'pushed', '1');
    xs = L.addItem(xs, '  ', 'risky', '2');
    xs = L.addItem(xs, 'taxes ', 'anxious', '3');
    xs = L.addItem(xs, 'Ask for raise', 'risky', '4');
    expect(xs.map((x) => [x.id, x.text, x.tags])).toEqual([['1', 'Taxes', ['pushed', 'anxious']], ['4', 'Ask for raise', ['risky']]]);
    for (const n of ['a', 'b', 'c', 'd']) xs = L.addItem(xs, n, 'anxious', n);
    expect(xs).toHaveLength(5);
    expect(L.canAdd(xs)).toBe(false);
  });
  it('allows fewer than 3 with a gentle flag', () => {
    const xs = [it_('a', 'anxious')];
    expect(L.canContinue(xs)).toBe(true);
    expect(L.belowSuggested(xs)).toBe(true);
    expect(L.canContinue([])).toBe(false);
  });
  it('labels tags: risky and anxious first, then pushed with its count only when it is above zero', () => {
    const table: [L.Tag[], number, string][] = [
      [['pushed'], 0, 'pushed'], [['pushed'], 1, 'pushed 1×'], [['pushed'], 2, 'pushed 2×'], [['pushed'], 3, 'pushed 3×'],
      [['risky'], 0, 'risky'], [['anxious'], 0, 'anxious'], [['risky'], 1, 'risky · pushed 1×'], [['risky'], 2, 'risky · pushed 2×'],
      [['anxious'], 1, 'anxious · pushed 1×'], [['pushed', 'risky'], 0, 'risky · pushed'], [['pushed', 'risky'], 2, 'risky · pushed 2×'],
      [['risky', 'anxious'], 0, 'risky · anxious'], [['anxious', 'risky'], 0, 'risky · anxious'],
      [['pushed', 'risky', 'anxious'], 0, 'risky · anxious · pushed'], [['risky', 'anxious'], 1, 'risky · anxious · pushed 1×'],
    ];
    for (const [tags, n, label] of table) expect(L.tagLabel(tags, n), `${tags} ${n}`).toBe(label);
    expect(L.tagLabel(['pushed'])).toBe('pushed');
    for (const [tags, n] of table) expect(L.tagLabel(tags, n)).not.toContain('0×');
  });
  it('hasTag: a carried item counts as pushed even without the tag', () => {
    expect(L.hasTag(it_('a', 'risky'), 'risky')).toBe(true);
    expect(L.hasTag(it_('a', 'risky'), 'pushed')).toBe(false);
    expect(L.hasTag(it_('a', 'risky', null, null, 1), 'pushed')).toBe(true);
    expect(L.hasTag(it_('a', 'risky', null, null, 1), 'anxious')).toBe(false);
    expect(L.hasTag(it_('a', ['pushed', 'anxious']), 'anxious')).toBe(true);
  });
  it('withTag keeps the canonical order without repeats', () => {
    expect(L.withTag(['anxious'], 'pushed')).toEqual(['pushed', 'anxious']);
    expect(L.withTag(['pushed', 'anxious'], 'risky')).toEqual(['pushed', 'risky', 'anxious']);
    expect(L.withTag(['risky'], 'risky')).toEqual(['risky']);
    expect(L.withTag([], 'anxious')).toEqual(['anxious']);
  });
  it('primaryTag colours by risky, then anxious, then pushed', () => {
    expect(L.primaryTag(['pushed'])).toBe('pushed');
    expect(L.primaryTag(['pushed', 'anxious'])).toBe('anxious');
    expect(L.primaryTag(['pushed', 'risky', 'anxious'])).toBe('risky');
    expect(L.primaryTag(['risky', 'anxious'])).toBe('risky');
  });
  describe('addOrTag', () => {
    it('adds trimmed text with the tag and pushed count', () => {
      const r = L.addOrTag([], '  Call mom ', 'pushed', 'id1', 2);
      expect(r.outcome).toBe('added');
      expect(r.items).toEqual([{ id: 'id1', text: 'Call mom', tags: ['pushed'], satisfied: null, leverage: null, pushedCount: 2 }]);
      expect(r.item).toEqual(r.items[0]);
    });
    it('rejects blank text as empty', () => {
      const xs = [it_('a', 'risky')];
      expect(L.addOrTag(xs, '   ', 'risky', 'x')).toEqual({ items: xs, outcome: 'empty' });
    });
    it('the same text under another tag gains the tag in place, keeping id, order, answers and pushed count', () => {
      const xs = [it_('First', 'anxious'), it_('Call mom', 'anxious', true, false, 2), it_('Last', 'risky')];
      const r = L.addOrTag(xs, ' call  MOM', 'risky', 'new-id');
      expect(r.outcome).toBe('tagged');
      expect(r.items).toHaveLength(3);
      expect(r.items.map((i) => i.text)).toEqual(['First', 'Call mom', 'Last']);
      expect(r.items[1]).toEqual({ id: 'Call mom', text: 'Call mom', tags: ['risky', 'anxious'], satisfied: true, leverage: false, pushedCount: 2 });
      expect(r.item).toEqual(r.items[1]);
      expect(xs[1].tags).toEqual(['anxious']); // pure
    });
    it('the exact user flow: putting off, then rejection or conflict', () => {
      let xs = L.addOrTag([], 'Talking to leads', 'pushed', 'q').items;
      const r = L.addOrTag(xs, 'Talking to leads', 'risky', 'q2');
      expect(r.outcome).toBe('tagged');
      xs = r.items;
      expect(xs).toEqual([{ id: 'q', text: 'Talking to leads', tags: ['pushed', 'risky'], satisfied: null, leverage: null, pushedCount: 0 }]);
      expect(L.tagLabel(xs[0].tags, xs[0].pushedCount)).toBe('risky · pushed');
    });
    it('tagging ignores the cap of five', () => {
      const xs = ['a', 'b', 'c', 'd', 'e'].map((t) => it_(t, 'anxious'));
      const r = L.addOrTag(xs, 'C', 'risky', 'x');
      expect(r.outcome).toBe('tagged');
      expect(r.items).toHaveLength(5);
      expect(r.items[2].tags).toEqual(['risky', 'anxious']);
    });
    it('the same text already carrying the tag is unchanged', () => {
      const xs = [it_('Call mom', ['pushed', 'risky'])];
      expect(L.addOrTag(xs, 'CALL MOM ', 'risky', 'x')).toEqual({ items: xs, outcome: 'already', item: xs[0] });
      const carried = [it_('Taxes', 'anxious', null, null, 1)];
      expect(L.addOrTag(carried, 'taxes', 'pushed', 'x').outcome).toBe('already'); // carried means pushed
    });
    it('rejects a sixth new item as full', () => {
      const xs = ['a', 'b', 'c', 'd', 'e'].map((t) => it_(t, 'anxious'));
      expect(L.addOrTag(xs, 'f', 'anxious', 'x')).toEqual({ items: xs, outcome: 'full' });
      expect(L.addOrTag(xs, 'A', 'anxious', 'x').outcome).toBe('already');
    });
  });
  it('removeTag drops one tag, and the item once none are left', () => {
    const xs = [it_('a', ['pushed', 'risky']), it_('b', 'risky'), it_('c', 'risky', true, true, 2)];
    let ys = L.removeTag(xs, 'a', 'risky');
    expect(ys.map((i) => [i.text, i.tags])).toEqual([['a', ['pushed']], ['b', ['risky']], ['c', ['risky']]]);
    ys = L.removeTag(ys, 'b', 'risky');
    expect(ys.map((i) => i.text)).toEqual(['a', 'c']);
    expect(L.removeTag(ys, 'c', 'pushed')).toEqual(ys); // a carried item without the pushed tag keeps its tags
    expect(L.removeTag(xs, 'nope', 'risky')).toEqual(xs);
  });
  it('guided order is pushed, risky, anxious', () => {
    const xs = [it_('x', 'anxious'), it_('r', 'risky'), it_('p', 'pushed'), it_('y', 'anxious')];
    expect(L.guidedOrder(xs).map((x) => x.text)).toEqual(['p', 'r', 'x', 'y']);
  });
  it('guided order files carried risky/anxious items (added on step 1) under their own tag', () => {
    const xs = [it_('carried-a', 'anxious', null, null, 1), it_('carried-r', 'risky', null, null, 2), it_('p', 'pushed'), it_('r', 'risky')];
    expect(L.guidedOrder(xs).map((x) => x.text)).toEqual(['p', 'carried-r', 'r', 'carried-a']);
  });
  it('guided order files a multi-tag item under its earliest tag, stably', () => {
    const xs = [it_('a', 'anxious'), it_('ra', ['risky', 'anxious']), it_('p', 'pushed'), it_('pr', ['pushed', 'risky']), it_('r', 'risky'), it_('pa', ['pushed', 'anxious'])];
    expect(L.guidedOrder(xs).map((x) => x.text)).toEqual(['p', 'pr', 'pa', 'ra', 'r', 'a']);
  });
});

describe('filtering and pick order', () => {
  const xs = [it_('a', 'anxious', true, false), it_('b', 'risky', false, false), it_('c', 'pushed', false, true, 1), it_('d', 'risky', true, true), it_('e', 'pushed', true, false, 3)];
  it('keeps items with at least one yes, sets aside the rest', () => {
    expect(L.highLeverage(xs).map((x) => x.text)).toEqual(['a', 'c', 'd', 'e']);
    expect(L.setAside(xs).map((x) => x.text)).toEqual(['b']);
  });
  it('puts risky first, then the rest in the order written', () => {
    expect(L.pickOrder(xs).map((x) => x.text)).toEqual(['d', 'a', 'c', 'e']);
  });
  it('risky comes first even when a pushed item has a higher count', () => {
    const ys = [it_('p', 'pushed', true, true, 5), it_('r', 'risky', true, false, 0)];
    expect(L.pickOrder(ys).map((x) => x.text)).toEqual(['r', 'p']);
  });
  it('anxious is not forced last', () => {
    const ys = [it_('a', 'anxious', true, true), it_('p', 'pushed', true, true, 2)];
    expect(L.pickOrder(ys).map((x) => x.text)).toEqual(['a', 'p']);
  });
  it('keeps the written order otherwise, regardless of pushed count', () => {
    const ys = [it_('p1', 'pushed', true, true, 1), it_('a', 'anxious', false, true), it_('p3', 'pushed', true, false, 3), it_('r1', 'risky', true, true), it_('r2', 'risky', false, true, 4)];
    expect(L.pickOrder(ys).map((x) => x.text)).toEqual(['r1', 'r2', 'p1', 'a', 'p3']);
  });
  it('an item that is risky among other tags counts as risky', () => {
    const ys = [it_('p', 'pushed', true, true), it_('a', 'anxious', true, false), it_('pr', ['pushed', 'risky'], false, true), it_('ra', ['risky', 'anxious'], true, true)];
    expect(L.pickOrder(ys).map((x) => x.text)).toEqual(['pr', 'ra', 'p', 'a']);
  });
  it('detects unanswered', () => {
    expect(L.allAnswered([it_('a', 'risky', true, null)])).toBe(false);
  });
});

describe('the block', () => {
  it('clamps to 2-3h, or 1-3h for a smaller bad-day block', () => {
    expect(L.clampBlock(30)).toBe(120);
    expect(L.clampBlock(500)).toBe(180);
    expect(L.clampBlock(60, true)).toBe(60);
    expect(L.clampBlock(NaN)).toBe(120);
  });
  it('derives time from stored start, so reload is accurate', () => {
    const b = L.startBlock(120, 0);
    expect(L.remainingMs(b, 30 * MIN)).toBe(90 * MIN);
    expect(L.progress(b, 60 * MIN)).toBeCloseTo(0.5);
  });
  it('a short break pauses but keeps the single session', () => {
    let b = L.startBlock(120, 0);
    b = L.pause(b, 30 * MIN);
    expect(L.focusMs(b, 35 * MIN)).toBe(30 * MIN); // frozen while away
    b = L.resume(b, 39 * MIN);
    expect(b.endedAt).toBeNull();
    expect(L.focusMs(b, 49 * MIN)).toBe(40 * MIN);
  });
  it('a break of 10+ minutes ends the block honestly', () => {
    let b = L.pause(L.startBlock(120, 0), 30 * MIN);
    b = L.resume(b, 40 * MIN);
    expect(b.endReason).toBe('broken');
    expect(b.endedAt).toBe(30 * MIN);
  });
  it('settle breaks a stale pause found on reload', () => {
    const b = L.settle(L.pause(L.startBlock(120, 0), 10 * MIN), 25 * MIN);
    expect(b.endReason).toBe('broken');
    expect(L.isBrokenPause(L.pause(L.startBlock(120, 0), 0), 10 * MIN)).toBe(true);
  });
  it('settle completes the block once the target is reached', () => {
    let b = L.startBlock(120, 0);
    b = L.resume(L.pause(b, 10 * MIN), 15 * MIN);
    const s = L.settle(b, 200 * MIN);
    expect(s.endReason).toBe('complete');
    expect(s.endedAt).toBe(125 * MIN);
    expect(L.remainingMs(s, 999 * MIN)).toBe(0);
  });
  describe('one step-away per block', () => {
    it('a second pause is refused after resuming', () => {
      let b = L.resume(L.pause(L.startBlock(120, 0), 10 * MIN), 15 * MIN);
      expect(b.breaks).toBe(1);
      expect(L.canPause(b)).toBe(false);
      expect(L.pause(b, 30 * MIN)).toBe(b);
      b = L.pause(b, 30 * MIN);
      expect(b.pausedAt).toBeNull();
      expect(L.focusMs(b, 40 * MIN)).toBe(35 * MIN);
    });
    it('a zero-length pause and resume still uses the one break', () => {
      const b = L.resume(L.pause(L.startBlock(120, 0), 10 * MIN), 10 * MIN);
      expect(b.pausedMs).toBe(0);
      expect(L.canPause(b)).toBe(false);
    });
    it('an older stored block without breaks but with pause time cannot pause', () => {
      const old: L.Block = { ...L.startBlock(120, 0), pausedMs: 3 * MIN, breaks: undefined };
      expect(L.canPause(old)).toBe(false);
      expect(L.pause(old, 20 * MIN)).toBe(old);
      expect(L.canPause({ ...L.startBlock(120, 0), breaks: undefined })).toBe(true);
    });
    it('the one pause running 10+ minutes still breaks the block', () => {
      const b = L.resume(L.pause(L.startBlock(120, 0), 10 * MIN), 21 * MIN);
      expect(b.endReason).toBe('broken');
      expect(b.endedAt).toBe(10 * MIN);
    });
    it('canPause is false while paused or ended', () => {
      const b = L.startBlock(120, 0);
      expect(L.canPause(b)).toBe(true);
      expect(L.canPause(L.pause(b, MIN))).toBe(false);
      expect(L.canPause(L.stop(b, MIN))).toBe(false);
    });
    it('10 min of work plus 9 min away, 13 times, no longer adds up: only the first break pauses', () => {
      let b = L.startBlock(120, 0), t = 0;
      for (let i = 0; i < 13 && b.endedAt == null; i++) {
        b = L.settle(L.pause(b, t + 10 * MIN), t + 10 * MIN);
        b = L.settle(L.resume(b, t + 19 * MIN), t + 19 * MIN);
        t += 19 * MIN;
      }
      expect(b.pausedMs).toBe(9 * MIN);
      expect(b.breaks).toBe(1);
      expect(b.endReason).toBe('complete');
      expect(b.endedAt).toBe(129 * MIN); // 120 min of real work plus the one 9 min break
    });
  });
  describe('blockOutcome (internal, feeds gotBlock only): a full block is 2h+ of focus', () => {
    const done = (min: number) => L.settle(L.startBlock(min, 0, true), 999 * MIN);
    it('a completed 2h block is full', () => {
      expect(L.blockOutcome(done(120), 999 * MIN)).toBe('full');
    });
    it('a completed 60-minute block is short', () => {
      const b = done(60);
      expect(b.endReason).toBe('complete');
      expect(L.blockOutcome(b, 999 * MIN)).toBe('short');
    });
    it('stopped after 5 min is short', () => {
      expect(L.blockOutcome(L.stop(L.startBlock(120, 0), 5 * MIN), 6 * MIN)).toBe('short');
    });
    it('stopped at 130 min of a 150 min block is full', () => {
      const b = L.stop(L.startBlock(150, 0), 130 * MIN);
      expect(b.endReason).toBe('stopped');
      expect(L.blockOutcome(b, 131 * MIN)).toBe('full');
    });
    it('broken at 40 min is short', () => {
      const b = L.resume(L.pause(L.startBlock(120, 0), 40 * MIN), 55 * MIN);
      expect(b.endReason).toBe('broken');
      expect(L.blockOutcome(b, 55 * MIN)).toBe('short');
    });
    it('the one break is not focus time', () => {
      const b = L.resume(L.pause(L.startBlock(180, 0), 60 * MIN), 69 * MIN);
      expect(L.blockOutcome(L.stop(b, 128 * MIN), 128 * MIN)).toBe('short'); // 119 min of focus, 128 on the wall clock
      expect(L.blockOutcome(L.stop(b, 129 * MIN), 129 * MIN)).toBe('full');
    });
    it('a block that has not ended is running', () => {
      expect(L.blockOutcome(L.startBlock(120, 0), 150 * MIN)).toBe('running');
      expect(L.blockOutcome(L.pause(L.startBlock(120, 0), MIN), 5 * MIN)).toBe('running');
    });
    it('autoGotBlock: false after a short block, true after a full completion, otherwise unchanged', () => {
      expect(L.autoGotBlock(done(90), 999 * MIN, null)).toBe(false);
      expect(L.autoGotBlock(done(90), 999 * MIN, true)).toBe(false);
      expect(L.autoGotBlock(done(120), 999 * MIN, null)).toBe(true);
      expect(L.autoGotBlock(L.stop(L.startBlock(150, 0), 130 * MIN), 130 * MIN, null)).toBeNull();
      expect(L.autoGotBlock(L.startBlock(120, 0), MIN, null)).toBeNull();
    });
  });
  it('drifts are logged without affecting time', () => {
    const b = L.drift(L.startBlock(120, 0), 5 * MIN);
    expect(b.drifts).toEqual([5 * MIN]);
    expect(L.remainingMs(b, 5 * MIN)).toBe(115 * MIN);
  });
  it('formats', () => {
    expect(L.formatMs(2 * 3600_000)).toBe('2:00:00');
  });
});

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

describe('validChoice', () => {
  const xs = [it_('a', 'risky', true, false), it_('b', 'anxious', false, false)];
  it('keeps a choice that is in the pick list', () => {
    expect(L.validChoice(xs, 'a')).toBe('a');
  });
  it('drops a choice that was removed, lost its yes, or never existed', () => {
    expect(L.validChoice(xs.slice(1), 'a')).toBeNull();
    expect(L.validChoice(xs, 'b')).toBeNull();
    expect(L.validChoice([it_('a', 'risky', false, false)], 'a')).toBeNull();
    expect(L.validChoice(xs, null)).toBeNull();
  });
});

describe('midnight: the day a block started stays open until closed', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
  const started = (min = 120) => day('2026-10-14', [it_('x', 'risky', true, true)], { chosenId: 'x', block: L.startBlock(min, at(14, 23, 30), min < BLOCK_MIN) });

  it('block started 23:30, reloaded 00:10: still running on yesterday', () => {
    const { day: d, carried } = L.activeDay([started()], at(15, 0, 10));
    expect(carried).toBe(true);
    expect(d?.date).toBe('2026-10-14');
    expect(d?.block?.endedAt).toBeNull();
    expect(L.remainingMs(d!.block!, at(15, 0, 10))).toBe(80 * MIN);
  });
  it('reloaded 02:00 with a 2h target: complete, yesterday is offered Close', () => {
    const { day: d, carried } = L.activeDay([started()], at(15, 2));
    expect(carried).toBe(true);
    expect(d?.date).toBe('2026-10-14');
    expect(d?.block?.endReason).toBe('complete');
    expect(d?.block?.endedAt).toBe(at(15, 1, 30));
    expect(d?.gotBlock).toBe(true);
  });
  it('a pause that runs past 10 min across midnight breaks the block on yesterday', () => {
    const d0 = started();
    const paused = { ...d0, block: L.pause(d0.block!, at(14, 23, 55)) };
    const { day: d, carried } = L.activeDay([paused], at(15, 0, 10));
    expect(carried).toBe(true);
    expect(d?.block?.endReason).toBe('broken');
    expect(d?.block?.endedAt).toBe(at(14, 23, 55));
    expect(d?.gotBlock).toBe(false); // 25 min of focus, recorded internally
    expect(d?.didIt).toBeNull(); // the user still answers
  });
  it('a completed 90-minute block settled after midnight is still offered for the answer', () => {
    const { day: d, carried } = L.activeDay([started(90)], at(15, 2));
    expect(carried).toBe(true);
    expect(d?.block?.endReason).toBe('complete');
    expect(d?.gotBlock).toBe(false);
    expect(d?.didIt).toBeNull();
  });
  it('a short ended block left unanswered stays open even though gotBlock is already false', () => {
    const d0 = started();
    const short = { ...d0, block: L.stop(d0.block!, at(14, 23, 40)), gotBlock: false };
    expect(L.activeDay([short], at(15, 8)).day?.date).toBe('2026-10-14');
  });
  it('an ended block answered Yes or Not today but never closed is left as history', () => {
    const d0 = started();
    const ended = { ...d0, block: L.stop(d0.block!, at(14, 23, 45)) };
    for (const didIt of [true, false]) {
      expect(L.activeDay([{ ...ended, didIt }], at(15, 8)), String(didIt)).toEqual({ day: null, carried: false });
    }
  });
  it('a running block is carried whatever didIt says', () => {
    expect(L.activeDay([{ ...started(), didIt: false }], at(15, 0, 10)).carried).toBe(true);
  });
  it('a full block broken by a long pause after 2h of focus is left for the user to answer', () => {
    const d0 = started(180);
    const paused = { ...d0, block: L.pause(d0.block!, at(15, 1, 40)) };
    const { day: d } = L.activeDay([paused], at(15, 2));
    expect(d?.block?.endReason).toBe('broken');
    expect(L.blockOutcome(d!.block!, at(15, 2))).toBe('full');
    expect(d?.gotBlock).toBeNull();
  });
  it('an ended but unanswered block is still offered', () => {
    const d0 = started();
    const stopped = { ...d0, block: L.stop(d0.block!, at(14, 23, 45)) };
    expect(L.activeDay([stopped], at(15, 8)).day?.date).toBe('2026-10-14');
  });
  it('a closed yesterday gives today', () => {
    const closed = { ...started(), closed: true, didIt: true };
    expect(L.activeDay([closed], at(15, 2))).toEqual({ day: null, carried: false });
    const today = day('2026-10-15', []);
    expect(L.activeDay([closed, today], at(15, 2))).toEqual({ day: today, carried: false });
  });
  it('an empty yesterday, or one without a block, gives today', () => {
    expect(L.activeDay([day('2026-10-14', [])], at(15, 2)).day).toBeNull();
    expect(L.activeDay([day('2026-10-14', [it_('a', 'risky')])], at(15, 2)).carried).toBe(false);
    expect(L.activeDay([], at(15, 2))).toEqual({ day: null, carried: false });
  });
  it('only the most recent earlier day is considered', () => {
    expect(L.activeDay([started(), day('2026-10-15', [])], at(16, 8)).carried).toBe(false);
  });
  it('an unfinished day older than yesterday is not carried', () => {
    expect(L.activeDay([started()], at(17, 8))).toEqual({ day: null, carried: false });
  });
  it('the same day is never carried', () => {
    const d = started();
    expect(L.activeDay([d], at(14, 23, 45))).toEqual({ day: d, carried: false });
  });

  describe('shouldRollOver', () => {
    const empty = day('2026-10-14', []);
    it('never on the same date', () => {
      expect(L.shouldRollOver({ ...empty, closed: true }, 'closed', at(14, 23, 59))).toBe(false);
    });
    it('a closed day or a day without a block rolls over after midnight', () => {
      expect(L.shouldRollOver({ ...started(), closed: true }, 'closed', at(15, 1, 30))).toBe(true);
      expect(L.shouldRollOver(empty, 'welcome', at(15, 0, 1))).toBe(true);
      expect(L.shouldRollOver(day('2026-10-14', [it_('a', 'risky')]), 'name', at(15, 0, 1))).toBe(true);
    });
    it('a running block keeps its start day', () => {
      expect(L.shouldRollOver(started(), 'block', at(15, 0, 30))).toBe(false);
      expect(L.shouldRollOver(started(), 'pick', at(15, 0, 30))).toBe(false); // whatever screen is named, a started block keeps its day
      // @ts-expect-error an overlay is not a day screen: pass the screen it opened over
      expect(L.shouldRollOver(started(), 'about', at(15, 0, 30))).toBe(false);
    });
    it('a block being closed keeps its day, answered or not', () => {
      const d0 = started();
      const ended = { ...d0, block: L.stop(d0.block!, at(15, 0, 30)) };
      expect(L.shouldRollOver(ended, 'close', at(15, 0, 31))).toBe(false);
      expect(L.shouldRollOver({ ...ended, didIt: true }, 'close', at(15, 0, 31))).toBe(false);
    });
  });
});

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
