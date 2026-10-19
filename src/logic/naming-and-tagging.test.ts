import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { it_ } from './helpers.testlib';

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
