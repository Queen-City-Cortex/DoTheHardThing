import { describe, it, expect } from 'vitest';
import { decodeDays } from './decode';
import type { Block, Day, Item } from './logic';

// Every field of every stored type is filled in. `Required<...>` makes adding an optional field to Day, Item or Block
// a type error here, and a field that decode.ts forgets to copy fails the equality below instead of vanishing on the next save.
const item: Required<Item> = { id: 'a', text: 'Taxes', tags: ['pushed', 'anxious'], satisfied: true, leverage: false, pushedCount: 2 };
const block: Required<Block> = { targetMin: 120, startedAt: 1_000, pausedAt: 5_000, pausedMs: 3_000, breaks: 1, endedAt: 9_000, endReason: 'stopped', drifts: [2_000, 4_000] };
const day: Required<Day> = {
  date: '2026-10-13', openedAt: 500, items: [item, { ...item, id: 'b', tags: ['risky'] }], chosenId: 'a', block,
  gotBlock: true, didIt: true, doneText: 'Taxes', closed: true,
};

describe('decodeDays', () => {
  it('returns a fully populated store unchanged (round trip)', () => {
    expect(decodeDays(JSON.parse(JSON.stringify([day])))).toEqual([day]);
  });
  it('returns a minimal store unchanged', () => {
    const min: Day = { date: '2026-10-14', openedAt: 0, items: [], chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false };
    expect(decodeDays([min])).toEqual([min]);
  });
  it('drops days whose date is not a real month and day', () => {
    for (const date of ['2026-13-01', '2026-00-10', '2026-10-32', '2026-10-00', '26-10-13', 'banana']) {
      expect(decodeDays([{ ...day, date }]), date).toEqual([]);
    }
  });
  it('drops a block it cannot read and keeps the day and its items', () => {
    const [d] = decodeDays([{ ...day, block: { targetMin: 'x' } }]);
    expect(d.block).toBeNull();
    expect(d.items).toHaveLength(2);
  });
  it('clears a chosen id that no longer names an item', () => {
    expect(decodeDays([{ ...day, chosenId: 'zzz' }])[0].chosenId).toBeNull();
  });
});
