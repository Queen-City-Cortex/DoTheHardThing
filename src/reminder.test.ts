import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Reg = { showNotification: ReturnType<typeof vi.fn>; getNotifications: ReturnType<typeof vi.fn> };
const shown = { close: vi.fn() };
const mkReg = (): Reg => ({ showNotification: vi.fn(async () => {}), getNotifications: vi.fn(async () => [shown]) });
class FakeTrigger { constructor(public timestamp: number) {} }

/** Browser globals for one test. `regs` are what successive getRegistration() calls resolve to. */
function env({ permission = 'granted', trigger = false, sw = true, regs = [] as (Reg | undefined | Promise<Reg | undefined>)[] } = {}) {
  const N = Object.assign(vi.fn(), { permission });
  const win: Record<string, unknown> = { Notification: N };
  if (trigger) win.TimestampTrigger = FakeTrigger;
  vi.stubGlobal('window', win);
  vi.stubGlobal('Notification', N);
  let i = 0;
  const getRegistration = vi.fn(() => Promise.resolve(regs[Math.min(i++, regs.length - 1)]));
  vi.stubGlobal('navigator', sw ? { serviceWorker: { getRegistration } } : {});
  return { N, getRegistration };
}
const load = async () => { vi.resetModules(); return import('./reminder'); };
const triggerTimes = (reg: Reg) => reg.showNotification.mock.calls.map((c) => (c[1].showTrigger as FakeTrigger).timestamp);

beforeEach(() => { vi.useFakeTimers({ now: new Date(2026, 9, 14, 5, 0) }); shown.close.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('reminderMode', () => {
  it('detects unsupported, open-only and trigger', async () => {
    const R = await load();
    vi.stubGlobal('window', {});
    expect(R.reminderMode()).toBe('unsupported');
    env();
    expect(R.reminderMode()).toBe('open-only');
    env({ trigger: true });
    expect(R.reminderMode()).toBe('trigger');
    env({ trigger: true, sw: false });
    expect(R.reminderMode()).toBe('open-only');
  });
});

describe('scheduleReminder', () => {
  it('null clears the timer and closes scheduled morning notifications', async () => {
    const reg = mkReg(); env({ regs: [reg] });
    const R = await load();
    await R.scheduleReminder('06:30');
    expect(vi.getTimerCount()).toBe(1);
    await R.scheduleReminder(null);
    expect(vi.getTimerCount()).toBe(0);
    expect(reg.getNotifications).toHaveBeenLastCalledWith({ tag: 'morning', includeTriggered: true });
    expect(shown.close).toHaveBeenCalled();
  });
  it('cancelReminder does the same', async () => {
    const reg = mkReg(); env({ regs: [reg] });
    const R = await load();
    await R.scheduleReminder('06:30');
    shown.close.mockClear();
    await R.cancelReminder();
    expect(vi.getTimerCount()).toBe(0);
    expect(shown.close).toHaveBeenCalled();
  });
  it('a stale earlier call that resolves late does not schedule', async () => {
    const reg = mkReg();
    let release!: (r: Reg) => void;
    env({ trigger: true, regs: [new Promise<Reg>((r) => { release = r; }), reg] });
    const R = await load();
    const a = R.scheduleReminder('06:30');
    const b = R.scheduleReminder('07:00');
    release(reg);
    await Promise.all([a, b]);
    expect(triggerTimes(reg)).toEqual([new Date(2026, 9, 14, 7, 0).getTime()]);
  });
  it('an in-flight call does not schedule after Off', async () => {
    const reg = mkReg();
    let release!: (r: Reg) => void;
    env({ regs: [new Promise<Reg>((r) => { release = r; }), reg] });
    const R = await load();
    const a = R.scheduleReminder('06:30');
    const off = R.cancelReminder();
    release(reg);
    await Promise.all([a, off]);
    expect(vi.getTimerCount()).toBe(0);
    expect(reg.showNotification).not.toHaveBeenCalled();
  });
  it('does nothing when permission is denied', async () => {
    const reg = mkReg(); const { N } = env({ permission: 'denied', trigger: true, regs: [reg] });
    const R = await load();
    await R.scheduleReminder('06:30');
    expect(vi.getTimerCount()).toBe(0);
    expect(reg.showNotification).not.toHaveBeenCalled();
    expect(N).not.toHaveBeenCalled();
  });
  it('schedules one trigger occurrence where supported', async () => {
    const reg = mkReg(); env({ trigger: true, regs: [reg] });
    const R = await load();
    await R.scheduleReminder('06:30');
    expect(triggerTimes(reg)).toEqual([new Date(2026, 9, 14, 6, 30).getTime()]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a failing timer notification is caught and tomorrow is re-armed', async () => {
    const reg = mkReg(); reg.showNotification.mockRejectedValue(new Error('nope')); env({ regs: [reg] });
    const R = await load();
    await R.scheduleReminder('06:30');
    await vi.advanceTimersByTimeAsync(90 * 60_000);
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});

// Pick asks for permission just before it starts the block; nothing about the answer may stop the block from starting
describe('askPermission', () => {
  it('old Safari: requestPermission throws (callback-only); neither call throws and the answer is re-read', async () => {
    const { N } = env({ permission: 'default' });
    const requestPermission = vi.fn(() => { throw new TypeError('Not enough arguments'); });
    Object.assign(N, { requestPermission });
    const R = await load();
    expect(() => R.askPermissionIfUnasked()).not.toThrow();
    await expect(R.askPermission()).resolves.toBe('default');
    expect(requestPermission).toHaveBeenCalledTimes(2);
  });
  it('old Safari: requestPermission returns undefined instead of a promise; neither call throws', async () => {
    const { N } = env({ permission: 'default' });
    const requestPermission = vi.fn(() => undefined);
    Object.assign(N, { requestPermission });
    const R = await load();
    expect(() => R.askPermissionIfUnasked()).not.toThrow();
    await expect(R.askPermission()).resolves.toBe('default');
    expect(requestPermission).toHaveBeenCalledTimes(2);
  });
  it('a rejected request resolves to the re-read permission', async () => {
    const { N } = env({ permission: 'denied' });
    Object.assign(N, { requestPermission: vi.fn(async () => { throw new Error('blocked'); }) });
    const R = await load();
    await expect(R.askPermission()).resolves.toBe('denied');
  });
  it('does not ask again once answered', async () => {
    const { N } = env({ permission: 'denied' });
    const requestPermission = vi.fn(async () => 'denied');
    Object.assign(N, { requestPermission });
    const R = await load();
    R.askPermissionIfUnasked();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('no Notification at all: nothing is asked and the permission reads denied', async () => {
    vi.stubGlobal('window', {});
    const R = await load();
    expect(() => R.askPermissionIfUnasked()).not.toThrow();
    expect(R.readPermission()).toBe('denied');
  });
});
