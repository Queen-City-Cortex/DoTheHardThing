import { describe, expect, it } from 'vitest';
import { handle } from './index';

const setup = () => {
  const points: unknown[] = []; const assets: string[] = [];
  const env = { ASSETS: { fetch: async (r: Request) => { assets.push(new URL(r.url).pathname); return new Response('app'); } }, EVENTS: { writeDataPoint: (p: unknown) => void points.push(p) } };
  return { env, points, assets };
};
const post = (body: string, path = '/api/event') => new Request(`https://x.test${path}`, { method: 'POST', body });

describe('worker', () => {
  it('writes one anonymous data point for an allowed event', async () => {
    const { env, points } = setup();
    const r = await handle(post('{"event":"finished"}'), env);
    expect(r.status).toBe(204);
    expect(points).toEqual([{ indexes: ['finished'], blobs: ['finished', ''], doubles: [1] }]);
  });
  it('ignores anything extra in the body and rejects unknown events, junk and oversize bodies', async () => {
    const { env, points } = setup();
    expect((await handle(post('{"event":"started","text":"Ask for the raise"}'), env)).status).toBe(204);
    expect(JSON.stringify(points)).not.toContain('raise');
    for (const b of ['{"event":"purchase"}', 'nope', '{"event":1}', '{"event":"started","x":"' + 'a'.repeat(300) + '"}']) expect((await handle(post(b), env)).status).toBe(400);
    expect(points).toHaveLength(1);
  });
  it('only POST /api/event; other /api paths 404; the app is served by assets', async () => {
    const { env, assets } = setup();
    expect((await handle(new Request('https://x.test/api/event'), env)).status).toBe(405);
    expect((await handle(post('{}', '/api/other'), env)).status).toBe(404);
    expect(await (await handle(new Request('https://x.test/anything'), env)).text()).toBe('app');
    expect(assets).toEqual(['/anything']);
  });
  it('still answers when the dataset binding is missing', async () => {
    const { env } = setup();
    expect((await handle(post('{"event":"started"}'), { ASSETS: env.ASSETS })).status).toBe(204);
  });
});
