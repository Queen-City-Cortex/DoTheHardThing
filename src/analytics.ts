// Anonymous counts, nothing else. Three events, each sent at most once per browser per day, as `{"event":"<name>"}`
// to this site's own /api/event. No item text, no storage contents, no id and no cookie is ever part of a send.
// Off in development, off when the browser says Do Not Track (or Global Privacy Control), and silent when offline or blocked.
import { now } from './clock';
import type { AppEvent } from './events';
import { dayKey } from './logic';
import { kv, readSmall } from './storage';
export type { AppEvent };

const KEY = 'one-thing:events'; // { date, sent[] }: only which names went out today, so a refresh does not count twice

export interface Env {
  enabled: boolean;
  dnt: () => boolean;
  today: () => string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  send: (body: string) => void;
}

export const doNotTrack = (): boolean => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return n.doNotTrack === '1' || n.doNotTrack === 'yes' || w.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true;
};

const defaults = (): Env => ({
  enabled: import.meta.env.PROD,
  dnt: doNotTrack,
  today: () => dayKey(new Date(now())),
  storage: kv(),
  send: (body) => { void fetch('/api/event', { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => {}); },
});

/** Count an event once today. Never throws, never waits, never retries. */
export function track(event: AppEvent, env?: Env): void {
  try {
    const e = env ?? defaults();
    if (!e.enabled || e.dnt()) return;
    const date = e.today();
    const seen = readSmall(e.storage, KEY); // unreadable: start fresh
    const sent = seen.date === date && Array.isArray(seen.sent) ? seen.sent : [];
    if (sent.includes(event)) return;
    try { e.storage.setItem(KEY, JSON.stringify({ date, sent: [...sent, event] })); } catch { return; } // cannot remember it: do not send
    e.send(JSON.stringify({ event }));
  } catch { /* analytics never breaks the app */ }
}
