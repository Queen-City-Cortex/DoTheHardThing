// Snippets that must stay clean (FINE) and the known gaps the rules do not catch today (GAPS).


// [file, code]
export const FINE = [
  // each owner may use its own API
  ['src/storage.ts', "export const s = localStorage.getItem('k'); export const j = JSON.parse('{}');"],
  ['src/clock.ts', 'export const now = () => Date.now(); export const d = new Date();'],
  ['src/reminder.ts', "export const ok = 'Notification' in window && Notification.permission; export const r = navigator.serviceWorker;"],
  // a timestamp passed in is fine anywhere
  ['src/App.tsx', 'export const d = (ms: number) => new Date(ms).getHours();'],
  ['src/logic.ts', 'export const day = (now: number) => new Date(now).getDate();'],
  ['src/clock.ts', 'export const day = (t: number) => new Date(t).getDate(); export const h = (t: number) => new Date(t).getHours();'],
  // the imports each module is allowed
  ['src/App.tsx', "import { useState } from 'react'; import { now } from './clock'; import { load } from './storage'; export const x = [useState, now, load];"],
  ['src/clock.ts', "import { dayKey } from './logic'; export const x = dayKey;"],
  ['src/clock.ts', "import { dayKey } from './logic'; import { lateAt } from './method'; export const x = [dayKey, lateAt];"],
  ['src/logic.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;"],
  ['src/logic.ts', "import { MAX_ITEMS } from './method'; import { fmt, t } from './copy'; export const x = [MAX_ITEMS, fmt, t];"],
  ['src/state.ts', "import * as L from './logic'; export const key = (now: number) => L.dayKey(new Date(now));"],
  ['src/App.tsx', "import { useReducer } from 'react'; import * as S from './state'; import { now } from './clock'; export const x = [useReducer, S.reduce, now];"],
  // copy.ts is where the words live; the app files render them by id; short labels are left alone
  ['src/copy.ts', "export const fmt = { line: (n: number) => `${n} days since you started` };"],
  ['src/App.tsx', "declare const t: (id: string) => string; const PRIVACY = ['privacy.device', 'privacy.host']; export function About() { return <p className=\"muted small wide flush\">{PRIVACY.map(t)}</p>; }"],
  ['src/logic.ts', "export const status = () => ({ active: false, message: 'Pick a time' });"],
  ['src/copy.ts', "export const COPY = { 'pick.hero': { kind: 'own', text: 'Which one thing gets today?' } };"],
  ['src/App.tsx', "declare const t: (id: string) => string; export function Pick() { return <h1 className=\"hero promise big\">{t('pick.hero')}</h1>; }"],
  ['src/App.tsx', 'export function Pick() { return <button>Start the block</button>; }'],
  // attributes nobody reads as words: a four-token class list, id, key, rel, role or data value is not copy
  ['src/App.tsx', 'export function Pick() { return <p className="muted small wide flush" id="a b c d" rel="noopener noreferrer x y" data-x="a b c d">x</p>; }'],
  ['src/App.tsx', "declare const ok: boolean; export function Close() { return <p key={'a b c d'} className={`muted small wide flush ${ok ? 'on top of it' : 'x'}`}>x</p>; }"],
  ['src/App.tsx', "import { BLOCK_CHOICES } from './method'; import { isLate } from './clock'; export const x = [BLOCK_CHOICES, isLate];"],
  ['src/other.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;"],
  // the method's own numbers live in method.ts, the one file the method selectors skip
  ['src/method.ts', 'export const opts = [60, 90, 120]; export const ms = 10 * 60_000; export const late = (hour: number) => hour >= 11; export const full = (xs: string[]) => xs.length >= 5;'],
  // what the method selectors leave alone: a named constant, 0 and 1, a comparison that is not an hour, ms to minutes
  ['src/App.tsx', "import { BREAK_LIMIT_MS, MAX_ITEMS } from './method'; export const ok = (xs: string[], away: number) => xs.length < MAX_ITEMS && away < BREAK_LIMIT_MS;"],
  // an identifier that only mentions hours is not an hour of the day
  ['src/App.tsx', 'export const soon = (hoursLeft: number) => hoursLeft < 1;'],
  ['src/logic.ts', 'export const a = [0, 1]; export const any = (xs: string[]) => xs.length >= 1; export const mins = (ms: number) => Math.floor(ms / 60000);'],
  ['src/App.tsx', 'export const tick = (f: () => void) => setInterval(f, 60_000); export const later = (x: number) => x >= 12;'],
  ['src/logic.ts', "export const m = (s: string) => s.padStart(2, '0'); export const tags = ['risky', 'anxious', 'pushed'];"],
  ['src/storage.ts', "import { MAX_DAYS } from './logic'; import { isObj } from './decode'; export const x = [MAX_DAYS, isObj];"],
  ['src/reminder.ts', "import { now } from './clock'; import { nextReminder } from './logic'; import { t } from './copy'; export const x = [now, nextReminder, t];"],
  ['src/analytics.ts', "import { now } from './clock'; import { dayKey } from './logic'; import { kv } from './storage'; import { EVENTS } from './events'; export const x = [now, dayKey, kv, EVENTS];"],
  ['src/decode.ts', "import type { Day } from './logic'; export const x = (d: Day) => d;"],
  ['worker/index.ts', "import { EVENTS } from '../src/events.ts'; export const x = EVENTS;"],
  ['worker/index.ts', "import { EVENTS } from '../src/events'; export const x = EVENTS;"],
  // tests stub the globals and may import anything
  ['src/storage.test.ts', "localStorage.setItem('k', 'v'); export const t = Date.now(); export const j = JSON.parse('{}');"],
  ['src/logic.test.ts', "import { now } from './clock'; export const p = Notification.permission + String(now);"],
  // tests are exempt from the method selectors too: they pin the numbers as literals on purpose (src/method.test.ts)
  ['src/method.test.ts', 'export const opts = [60, 90, 120]; export const ms = 10 * 60_000; export const late = (hour: number) => hour >= 11; export const n = (xs: string[]) => xs.length >= 5;'],
  ['worker/index.test.ts', "import { dayKey } from '../src/logic'; export const x = dayKey;"],
];

// [file, code]: not caught today; if one starts failing, the rules got stronger: move it to BAD and update the header
export const GAPS = [
  ['src/App.tsx', 'const D = Date; export const t = D.now();'],
  ['src/App.tsx', 'const w = window; export const s = w.localStorage;'],
  ['src/App.tsx', 'export const r = window.navigator.serviceWorker;'],
  ['src/App.tsx', 'export const t = window.Date.now();'],
  ['src/App.tsx', "const k = 'localStorage'; export const s = window[k];"],
  // import forms the core rule does not see
  ['src/storage.ts', "export const m = () => import('./clock');"],
  ['worker/index.ts', "import { dayKey } from './../src/logic'; export const x = dayKey;"],
  // method numbers through a variable or arithmetic, a bare default, and an equality on a count
  ['src/App.tsx', 'declare const hourOf: (t: number) => number; const late = 12; export const isLate = (t: number) => hourOf(t) >= late;'],
  ['src/App.tsx', 'export const late = (d: Date) => d.getHours() > 12 - 1;'],
  ['src/App.tsx', 'export const initial = (small: boolean, full: number) => (small ? 90 : full);'],
  ['src/logic.ts', 'export const full = (xs: string[]) => xs.length === 5;'],
  // app copy the lint does not see: a file not in COPY_FILES, and a sentence joined from pieces of three words or fewer
  ['src/Pick.tsx', 'export function Pick() { return <p>Let the rest slide today.</p>; }'],
  ['src/App.tsx', "export function Pick() { return <p>{'Let the rest'} {'slide today.'}</p>; }"],
  // the lint judges each literal part on its own: a template whose parts each have three words or fewer, and an array join
  ['src/App.tsx', 'export const have = (n: number) => `${n} days you have`;'],
  ['src/App.tsx', "export const slide = ['Let the', 'rest slide', 'today.'].join(' ');"],
];