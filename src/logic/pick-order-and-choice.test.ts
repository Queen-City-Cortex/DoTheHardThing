import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { it_ } from './helpers.testlib';

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
