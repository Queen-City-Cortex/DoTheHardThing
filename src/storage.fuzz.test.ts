import { describe, it, expect, vi, afterEach } from 'vitest';
import { load } from './storage';
import { decodeDays } from './decode';
import * as L from './logic';

afterEach(() => { vi.unstubAllGlobals(); });

// Small seeded PRNG so a failure is reproducible.
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const JUNK: unknown[] = [null, undefined, 'x', '', 0, -1, 1.5, NaN, Infinity, true, false, [], {}, [1, 'a'], { a: [] }, 'YYYY-MM-DD', '2026-13-45', 1e21];

function mutate(v: unknown, r: () => number, depth = 0): unknown {
  if (r() < 0.12) return JUNK[Math.floor(r() * JUNK.length)];
  if (Array.isArray(v)) return v.map((x) => mutate(x, r, depth + 1)).filter(() => r() > 0.05);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { if (r() < 0.06) continue; o[k] = mutate(x, r, depth + 1); }
    return o;
  }
  return v;
}

const item = (i: number) => ({ id: `i${i}`, text: `Thing ${i}`, tags: ['pushed', 'risky'], satisfied: true, leverage: false, pushedCount: i });
const block = { targetMin: 120, startedAt: 1_000, pausedAt: null, pausedMs: 0, breaks: 1, endedAt: 9_000, endReason: 'complete', drifts: [2_000, 3_000] };
const valid = { reminder: '06:30', archive: { '2026-05': 2 }, days: ['2026-10-12', '2026-10-13', '2026-10-14'].map((date, n) => ({ date, openedAt: 5, items: [item(1), item(2), item(n)], chosenId: 'i1', block, gotBlock: true, didIt: true, doneText: 'Thing 1', closed: true })) };

function renderTouches(d: L.Day, now: number) {
  L.filled(d.items); L.pickOrder(d.items); L.guidedOrder(L.filled(d.items)); L.canAdd(d.items); L.belowSuggested(d.items); L.hasContent(d); L.setAside(d.items);
  L.validChoice(d.items, d.chosenId); L.tagLabel(d.items[0]?.tags ?? []);
  if (d.block) { L.focusMs(d.block, now); L.remainingMs(d.block, now); L.settle(d.block, now); }
  L.dayLabel(d.date); L.activeDay([d], now);
}

describe('fuzz: no stored shape reaches render as a crash', () => {
  it('2000 mutated stores', () => {
    let crashes = 0; let first = '';
    for (let n = 0; n < 2000; n++) {
      const r = rng(n + 1);
      const mutated = mutate(valid, r);
      const text = JSON.stringify(mutated) ?? 'null'; // JSON turns NaN and Infinity into null, so the decoder also gets the in-memory value
      const m = new Map([['one-thing:v3', text]]);
      vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: () => {} });
      try {
        const s = load();
        const direct = decodeDays((mutated as { days?: unknown } | null)?.days);
        for (const d of direct) renderTouches(d, 10_000);
        for (const d of s.days) renderTouches(d, 10_000);
        L.totalDone(s.days, s.archive);
      } catch (e) { crashes++; if (!first) first = `seed ${n + 1}: ${String(e).slice(0, 90)}`; }
    }
    if (crashes > 0) console.log(`FUZZ crashes=${crashes}/2000 ${first}`);
    expect(crashes, first).toBe(0);
  });
});
