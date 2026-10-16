// The one server-side piece: POST /api/event writes an anonymous count to Workers Analytics Engine.
// Everything else is the static app, served from ./dist by the assets binding (only /api/* reaches this code first).
// No cookie, no IP, no user agent, no id of any kind is stored: a data point is the event name and a country code.

export const EVENTS = ['started', 'finished', 'opened_history'] as const;
export type AppEvent = (typeof EVENTS)[number];

interface Env {
  ASSETS: { fetch: (r: Request) => Promise<Response> };
  EVENTS?: { writeDataPoint: (p: { indexes: string[]; blobs: string[]; doubles: number[] }) => void };
}
type CfRequest = Request & { cf?: { country?: string } };

const MAX_BODY = 200; // bytes; the real body is about 20

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (url.pathname !== '/api/event') return new Response(null, { status: 404 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const text = await request.text();
  let event: unknown;
  try { event = text.length <= MAX_BODY ? (JSON.parse(text) as { event?: unknown }).event : null; } catch { event = null; }
  if (typeof event !== 'string' || !(EVENTS as readonly string[]).includes(event)) return new Response(null, { status: 400 });
  // only the allow-listed name and a coarse country are written; nothing else from the request is read
  const country = (request as CfRequest).cf?.country ?? '';
  env.EVENTS?.writeDataPoint({ indexes: [event], blobs: [event, country], doubles: [1] });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

export default { fetch: handle };
