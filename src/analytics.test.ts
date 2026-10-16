import { describe, expect, it } from 'vitest';
import { track, type Env } from './analytics';

const env = (over: Partial<Env> = {}) => {
  const mem = new Map<string, string>(); const sent: string[] = [];
  const e: Env = { enabled: true, dnt: () => false, today: () => '2026-10-14', storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) }, send: (b) => void sent.push(b), ...over };
  return { e, sent, mem };
};

describe('track', () => {
  it('sends only the event name, once per day per event', () => {
    const { e, sent } = env();
    track('started', e); track('started', e); track('finished', e); track('finished', e);
    expect(sent).toEqual(['{"event":"started"}', '{"event":"finished"}']);
  });
  it('counts again on a new day', () => {
    let day = '2026-10-14'; const { e, sent } = env({ today: () => day });
    track('started', e); day = '2026-10-15'; track('started', e);
    expect(sent).toHaveLength(2);
  });
  it('sends nothing when disabled or when Do Not Track is on', () => {
    const a = env({ enabled: false }); track('started', a.e); expect(a.sent).toEqual([]);
    const b = env({ dnt: () => true }); track('started', b.e); expect(b.sent).toEqual([]); expect(b.mem.size).toBe(0);
  });
  it('never throws: broken storage, broken send, broken dnt', () => {
    expect(() => track('started', env({ storage: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } }).e)).not.toThrow();
    expect(() => track('started', env({ send: () => { throw new Error('x'); } }).e)).not.toThrow();
    expect(() => track('started', env({ dnt: () => { throw new Error('x'); } }).e)).not.toThrow();
  });
  it('does not send when it cannot remember that it did', () => {
    const { e, sent } = env({ storage: { getItem: () => null, setItem: () => { throw new Error('full'); } } });
    track('started', e); expect(sent).toEqual([]);
  });
  it('recovers from a corrupt record', () => {
    const { e, sent, mem } = env(); mem.set('one-thing:events', '{nope'); track('started', e);
    expect(sent).toEqual(['{"event":"started"}']);
  });
});
