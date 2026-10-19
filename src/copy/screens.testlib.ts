// Renders each screen to plain text in the states the copy tests look at, and the REQUIRED lines' screens (SCREENS).

import { vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { REQUIRED } from './required';
import { About, Ask, BlockView, Close, Closed, Days, Name, Pick, Welcome } from '../App';
import * as L from '../logic';

export const text = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const noop = () => {};
export const bad = (p: Partial<L.BadDay>): L.BadDay => ({ missedDays: 0, late: false, bad: false, firstVisit: false, ...p });
export const welcome = (b: Partial<L.BadDay>) => text(h(Welcome, { bad: bad(b), onStart: noop, small: false, setSmall: noop }));
export const item = (name: string, yes: boolean | null, tags: L.Tag[] = ['risky'], pushedCount = 0): L.Item => ({ id: name, text: name, tags, satisfied: yes, leverage: yes, pushedCount });
export const day = (items: L.Item[], p: Partial<L.Day> = {}): L.Day => ({ ...L.newDay('2026-10-14', 0), items, ...p });
export const pick = (items: L.Item[]) => text(h(Pick, { day: day(items), small: false, upd: noop, onBack: noop, onStart: noop }));
export const close = (didIt: boolean | null, total: number) => text(h(Close, { didIt, total, onAnswer: noop, onDays: noop, onDone: noop }));
export const closed = (didIt: boolean) => text(h(Closed, { didIt, onDays: noop, onStartOver: noop }));
// Name renders its first step (the later steps need a click); `history` brings leftovers from yesterday
export const yesterday = day([item('Old letter', null, ['risky'], 1), item('Gym', null, ['pushed', 'anxious'])], { date: '2026-10-13', didIt: false });
export const name = (items: L.Item[], history: L.Day[] = []) => text(h(Name, { day: day(items), history, today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }));
export const ask = (items: L.Item[]) => text(h(Ask, { items, setItem: noop, onBack: noop, onDone: noop }));
export const T0 = 1_000_000;
export const blk = (p: Partial<L.Block> = {}): L.Block => ({ ...L.startBlock(120, T0), ...p });
export const block = (b: L.Block, it?: L.Item, now = T0 + 5 * 60_000) => text(h(BlockView, { block: b, item: it, now, act: noop }));
export const done = (date: string, doneText: string | null = 'Ask for the raise') => day([], { date, didIt: true, doneText, closed: true });
// Your days reads today() for the month, so the clock is set while it renders
export const days = (ds: L.Day[], archive: L.Archive = {}) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 8, 0));
  try { return text(h(Days, { days: ds, archive, onBack: noop })); } finally { vi.useRealTimers(); }
};
// About reads the reminder mode and the permission from window, Notification and navigator: stub them while it renders
export type Env = 'unsupported' | 'open-only' | 'trigger';
export const about = (env: Env, permission: L.Permission, reminder: string | null = null, total = 0) => {
  const notification = { permission };
  vi.stubGlobal('window', env === 'unsupported' ? {} : { Notification: notification, ...(env === 'trigger' ? { TimestampTrigger: class {} } : {}) });
  vi.stubGlobal('Notification', notification);
  if (env === 'trigger') vi.stubGlobal('navigator', { serviceWorker: {} });
  try { return text(h(About, { reminder, total, onDays: noop, setReminder: noop })); } finally { vi.unstubAllGlobals(); }
};
export const twoItems = [item('Call mom', null, ['pushed', 'risky'], 2), item('Tax letter', true, ['anxious'])];
export const SCREENS: Record<keyof typeof REQUIRED, string> = {
  firstWelcome: welcome({ firstVisit: true }),
  firstWelcomeLate: welcome({ firstVisit: true, late: true }),
  morningWelcome: welcome({}),
  lateWelcome: welcome({ late: true, bad: true }),
  missedWelcome: welcome({ missedDays: 2, bad: true }),
  nothingPicked: pick([item('Tax letter', false)]),
  pick: pick([item('Ask for the raise', true)]),
  close: close(null, 0),
  closeFirstYes: close(true, 1),
  closed: closed(true),
  closedNotToday: closed(false),
  nameFirst: name([]),
  nameLeftovers: name([], [yesterday]),
  ask: ask(twoItems),
  block: block(blk(), twoItems[0]),
  blockDrifted: block(blk({ drifts: [T0 + 1000] }), twoItems[0]),
  blockPaused: block(blk({ pausedAt: T0 + 60_000, breaks: 1 }), twoItems[0], T0 + 4 * 60_000),
  blockPauseUsed: block(blk({ breaks: 1, pausedMs: 30_000 }), twoItems[0]),
  daysEmpty: days([]),
  days: days([done('2026-10-02')]),
  aboutUnsupported: about('unsupported', 'denied'),
  aboutDenied: about('open-only', 'denied'),
  aboutAsk: about('trigger', 'default'),
  aboutAllowed: about('open-only', 'granted'),
};
