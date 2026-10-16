import { describe, it, expect, afterEach, vi } from 'vitest';
import { load } from './storage';
import * as L from './logic';

function memory(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
afterEach(() => { vi.unstubAllGlobals(); });

const goodDay = { date: '2026-10-13', openedAt: 1, items: [], chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false };
const goodItem = { id: 'a', text: 'Taxes', tags: ['pushed'], satisfied: null, leverage: null, pushedCount: 0 };

// What App.tsx does with a loaded day on first render: it filters, orders and counts items, reads the block, labels the date.
function renderTouches(d: L.Day) {
  L.filled(d.items); L.pickOrder(d.items); L.guidedOrder(L.filled(d.items)); L.canAdd(d.items); L.belowSuggested(d.items);
  L.hasContent(d); L.setAside(d.items);
  if (d.block) L.focusMs(d.block, Date.now());
  L.dayLabel(d.date);
}

const BAD_DAYS: [string, unknown][] = [
  ['items is a string', { ...goodDay, items: 'oops' }],
  ['items is an object', { ...goodDay, items: { a: 1 } }],
  ['items is a number', { ...goodDay, items: 7 }],
  ['items is missing', (() => { const d: Record<string, unknown> = { ...goodDay }; delete d.items; return d; })()],
  ['items is null', { ...goodDay, items: null }],
  ['an item is a string, text is not', { ...goodDay, items: [{ ...goodItem, text: 42 }] }],
  ['an item has no id', { ...goodDay, items: [{ text: 'x', tags: ['pushed'] }] }],
  ['openedAt is a string', { ...goodDay, openedAt: 'yesterday' }],
  ['block is a string', { ...goodDay, block: 'running' }],
  ['block has NaN start', { ...goodDay, block: { targetMin: 120, startedAt: 'x', pausedAt: null, pausedMs: 0, endedAt: null, endReason: null, drifts: [] } }],
  ['block drifts is not an array', { ...goodDay, block: { targetMin: 120, startedAt: 1, pausedAt: null, pausedMs: 0, endedAt: null, endReason: null, drifts: 3 } }],
  ['date is not YYYY-MM-DD', { ...goodDay, date: 'banana' }],
];

describe('corrupt stored days must not reach render', () => {
  for (const [name, bad] of BAD_DAYS) {
    it(`load() yields days that render safely when ${name}`, () => {
      vi.stubGlobal('localStorage', memory({ 'one-thing:v3': JSON.stringify({ days: [bad, goodDay], reminder: null, archive: {} }) }));
      const s = load();
      for (const d of s.days) expect(() => renderTouches(d), JSON.stringify(d)).not.toThrow();
      for (const d of s.days) { expect(Array.isArray(d.items)).toBe(true); expect(Number.isFinite(d.openedAt)).toBe(true); }
    });
  }
  it('days that are not arrays or are huge do not break load', () => {
    vi.stubGlobal('localStorage', memory({ 'one-thing:v3': JSON.stringify({ days: { a: 1 } }) }));
    expect(load().days).toEqual([]);
    const many = Array.from({ length: 5000 }, (_, i) => ({ ...goodDay, date: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` }));
    vi.stubGlobal('localStorage', memory({ 'one-thing:v3': JSON.stringify({ days: many }) }));
    expect(load().days.length).toBeLessThanOrEqual(L.MAX_DAYS);
  });
});
