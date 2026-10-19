import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { BLOCK_MIN } from '../method';
import { it_, day, MIN } from './helpers.testlib';

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
