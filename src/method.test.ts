import { describe, expect, it } from 'vitest';
import * as L from './logic';
import { isLate } from './clock';
import {
  BLOCK_CHOICES, BLOCK_MAX, BLOCK_MIN, BREAK_LIMIT_MIN, BREAK_LIMIT_MS, BREAKS_PER_BLOCK, FULL_BLOCK_FOCUS_MIN, LATE_CUTOFFS, lateAt,
  MAX_ITEMS, PICK_FIRST, RULES, SMALL_BLOCK_DEFAULT, SMALL_BLOCK_OPTIONS, SUGGESTED_MIN, type RuleId,
} from './method';

// One conformance check per rule in RULES, named by its id and transcript ref. The mapped type makes a new rule
// without a check a type error. Each check pins the rule's numbers as literals next to the line they come from, then
// checks the logic at that literal boundary: editing a number in src/method.ts, or the logic that reads it, fails here.
const MIN = 60_000;
const item = (id: string, tag: L.Tag, pushedCount = 0): L.Item => ({ id, text: id, tags: [tag], satisfied: true, leverage: null, pushedCount });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(`i${i}`, 'anxious'));
/** A block of `target` minutes started at 0 that stops after `focus` minutes, with an optional break of `away` minutes at minute 30. */
function ran(focus: number, away = 0, target = 180): L.Block {
  let b = L.startBlock(target, 0);
  if (away) { b = L.resume(L.pause(b, 30 * MIN), (30 + away) * MIN); }
  return L.stop(b, (focus + away) * MIN);
}

const CHECKS: { [K in RuleId]: () => void } = {
  'three-to-five-items': () => {
    // talk 4:36 "So write down those three to five things."
    expect([SUGGESTED_MIN, MAX_ITEMS]).toEqual([3, 5]);
    expect(L.canAdd(items(4))).toBe(true);
    expect(L.canAdd(items(5))).toBe(false);
    expect(L.canContinue(items(5))).toBe(true);
    expect(L.canContinue(items(6))).toBe(false);
    expect(L.addOrTag(items(5), 'one more', 'risky', 'x').outcome).toBe('full');
    expect(L.belowSuggested(items(2))).toBe(true);
    expect(L.belowSuggested(items(3))).toBe(false);
  },
  'pick-risky-first': () => {
    // talk 4:32, read as: what carries "some chance of rejection or conflict" (risky) goes first
    expect(PICK_FIRST).toBe('risky');
    // a much-pushed item written first, a risky one written after it, an anxious one written last
    const list = [item('pushed-often', 'pushed', 4), item('anxious-first', 'anxious'), item('risky-later', 'risky'), item('pushed-once', 'pushed', 1)];
    expect(L.pickOrder(list).map((i) => i.id)).toEqual(['risky-later', 'pushed-often', 'anxious-first', 'pushed-once']);
    // never by push count: among the rest, written order wins
    expect(L.pickOrder([item('a', 'anxious'), item('b', 'pushed', 9)]).map((i) => i.id)).toEqual(['a', 'b']);
  },
  'block-two-to-three-hours': () => {
    // talk 5:17 "block out at least two to three hours to focus on one of them for today."
    expect([BLOCK_MIN, BLOCK_MAX]).toEqual([120, 180]);
    expect(BLOCK_CHOICES.full).toEqual([120, 150, 180]);
    expect(L.clampBlock(90)).toBe(120);
    expect(L.clampBlock(210)).toBe(180);
    expect(L.clampBlock(Number.NaN)).toBe(120);
    for (const m of [120, 150, 180]) expect(L.clampBlock(m)).toBe(m);
  },
  'full-block-is-120-focus-minutes': () => {
    // talk 5:27 "10 minutes here and there to add up to 120 minutes does not work."
    expect(FULL_BLOCK_FOCUS_MIN).toBe(120);
    // the focus a full block needs is the block minimum of block-two-to-three-hours (5:17), not a second number
    expect(FULL_BLOCK_FOCUS_MIN).toBe(BLOCK_MIN);
    expect(L.blockOutcome(ran(119), 0)).toBe('short');
    expect(L.blockOutcome(ran(120), 0)).toBe('full');
    // the break does not count as focus
    expect(L.blockOutcome(ran(119, 5), 0)).toBe('short');
    expect(L.blockOutcome(ran(120, 5), 0)).toBe('full');
    // a 5 minute block is a start, never a full block, however it ended
    expect(L.blockOutcome(ran(5), 0)).toBe('short');
  },
  'one-break-per-block': () => {
    // talk 5:22 "This is one block of time, uninterrupted"; the one step-away and its 10 minutes are the app's
    expect(BREAKS_PER_BLOCK).toBe(1);
    expect([BREAK_LIMIT_MIN, BREAK_LIMIT_MS]).toEqual([10, 600_000]);
    expect(L.canPause(L.startBlock(120, 0))).toBe(true);
    const back = L.resume(L.pause(L.startBlock(120, 0), 10 * MIN), 12 * MIN);
    expect(L.canPause(back)).toBe(false);
    expect(L.pause(back, 20 * MIN)).toBe(back);
    // an older stored block without `breaks` counts a recorded pause as its one break
    expect(L.canPause({ ...L.startBlock(120, 0), breaks: undefined, pausedMs: MIN })).toBe(false);
    expect(L.canPause({ ...L.startBlock(120, 0), breaks: undefined })).toBe(true);
    const away = L.pause(L.startBlock(120, 0), 10 * MIN);
    expect(L.resume(away, 20 * MIN - 1).endedAt).toBeNull();
    expect(L.resume(away, 20 * MIN).endReason).toBe('broken');
    // the running tick settles a long break the same way: 10 minutes away or more ends the block
    expect(L.settle(away, 20 * MIN - 1).endedAt).toBeNull();
    expect(L.settle(away, 20 * MIN).endReason).toBe('broken');
    // a corrupt stored count is not an unused break
    expect(L.canPause({ ...L.startBlock(120, 0), breaks: -1 })).toBe(false);
    expect(L.canPause({ ...L.startBlock(120, 0), breaks: 0.5 })).toBe(false);
  },
  'shorter-block-options': () => {
    // the app's own: 1 to 2 hours on a bad day, starting on 90 minutes
    expect(SMALL_BLOCK_OPTIONS).toEqual([60, 90]);
    expect(SMALL_BLOCK_DEFAULT).toBe(90);
    expect(BLOCK_CHOICES.small).toEqual([60, 90, 120]);
    for (const m of [60, 90, 120]) expect(L.clampBlock(m, true)).toBe(m);
    expect(L.clampBlock(30, true)).toBe(60);
    expect(L.clampBlock(Number.NaN, true)).toBe(90);
  },
  'late-start': () => {
    // the app's own, two cutoffs until Q1 is decided: Welcome framing 11:00, the Pick warning 12:00
    expect(LATE_CUTOFFS).toEqual({ welcomeFraming: 11, pickWarning: 12 });
    expect([lateAt(10, 'welcomeFraming'), lateAt(11, 'welcomeFraming'), lateAt(11, 'pickWarning'), lateAt(12, 'pickWarning')]).toEqual([false, true, false, true]);
    const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m);
    const returning = [{ ...L.newDay('2026-10-13', 0), items: [item('a', 'risky')] }];
    expect(L.badDay(returning, at(10, 59)).late).toBe(false);
    expect(L.badDay(returning, at(11)).late).toBe(true);
    expect(isLate(at(11, 59), 'pickWarning')).toBe(false);
    expect(isLate(at(12), 'pickWarning')).toBe(true);
    expect(isLate(at(12).getTime(), 'pickWarning')).toBe(true);
  },
};

describe('method rules (src/method.ts)', () => {
  for (const [id, rule] of Object.entries(RULES) as [RuleId, (typeof RULES)[RuleId]][]) {
    it(`${id} (${rule.ref ? `talk ${rule.ref}, ${rule.source}` : rule.source})`, CHECKS[id]);
  }
  it('every talk or reading rule cites a transcript timestamp and a quote', () => {
    for (const r of Object.values(RULES)) {
      if (r.source !== 'app') expect(r.ref && r.quote, r.says).toBeTruthy();
    }
  });
  it('every ref is an m:ss timestamp and every quote a single trimmed line', () => {
    for (const [id, r] of Object.entries(RULES)) {
      if (r.ref !== null) expect(r.ref, id).toMatch(/^\d{1,2}:[0-5]\d$/);
      if (r.quote !== null) {
        expect(r.ref, `${id} has a quote but no ref`).not.toBeNull();
        expect(r.quote, id).toBe(r.quote.trim());
        expect(r.quote, id).not.toMatch(/[\n\r]|^\[/);
        expect(r.quote.length, id).toBeGreaterThan(10);
      }
    }
  });
  // PRODUCT QUESTION Q1 stays visible in every test summary as a todo. Once the owner picks one cutoff, tsc asks for
  // the @ts-expect-error in src/method.ts to go; turn this into an `it` that expects one value.
  it.todo('late cutoffs agree (Q1)');
});
