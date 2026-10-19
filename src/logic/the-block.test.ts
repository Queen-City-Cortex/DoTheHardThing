import { describe, it, expect } from 'vitest';
import * as L from '../logic';
import { MIN } from './helpers.testlib';

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
