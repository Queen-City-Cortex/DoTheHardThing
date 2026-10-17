// The module map in eslint.config.js (OWNERS, OWNER_IMPORTS, PURE): in-memory snippets linted with the repo's own config.
// Each bad snippet must be reported with its owner's message, which names the module and function to use instead;
// each fine snippet must be clean. This checks what the rules catch, so a later block that silently replaces the
// generated bans for some files fails here.
// Known gaps, not caught by the built-in rules (lint is a guardrail, not a proof; the last describe pins them):
//   aliasing (`const D = Date; D.now()`, `const w = window; w.localStorage`), a nested wrapper
//   (`window.navigator.serviceWorker`, `window.Date.now()`), and reading through a variable (`const k = 'localStorage'; window[k]`).
//   `const { now } = Date` IS caught (no-restricted-properties handles destructuring).
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

const STORAGE = 'Only src/storage.ts touches localStorage. Use load/save, or kv() for a small key, from src/storage.ts.';
const JSON_PARSE = 'Parse stored data in src/storage.ts through the decoders in src/decode.ts, or read a small key with readSmall() from src/storage.ts.';
const CLOCK = 'Only src/clock.ts reads the device clock. Use now() or today() from src/clock.ts';
const REMINDER = 'Only src/reminder.ts touches Notification and the service worker. Use askPermission, askPermissionIfUnasked, readPermission, notify or scheduleReminder from src/reminder.ts.';
const PURE = (f) => `${f} is pure: no imports and no DOM. Take the value as an argument;`;
const OWNER_IMPORT = (f) => `${f} may import only `;
const UI = 'Only .tsx files are UI. Keep React and App out of .ts modules: export a plain function and call it from App.tsx.';
const WORKER = 'The worker shares only the event list with the app. Import EVENTS from ../src/events, nothing else from src/.';

/** The no-restricted-* messages ESLint reports for `code` as if it were `filePath`. */
async function restricted(filePath, code) {
  const [r] = await eslint.lintText(code, { filePath });
  const fatal = r.messages.filter((m) => m.fatal);
  if (fatal.length) throw new Error(`${filePath}: ${fatal[0].message}`);
  return r.messages.filter((m) => m.ruleId?.startsWith('no-restricted-')).map((m) => m.message);
}

// [file, code, a message that must be reported]
const BAD = [
  // storage: from the UI, a plain module and the other owners, in every form the rules know
  ['src/App.tsx', "export const s = localStorage.getItem('one-thing:v3');", STORAGE],
  ['src/App.tsx', 'export const s = sessionStorage;', STORAGE],
  ['src/App.tsx', "export const s = window.localStorage.getItem('x');", STORAGE],
  ['src/App.tsx', "export const s = window['localStorage'];", STORAGE],
  ['src/App.tsx', 'export const s = globalThis.localStorage;', STORAGE],
  ['src/App.tsx', 'export const s = self.localStorage;', STORAGE],
  ['src/App.tsx', 'export const s = globalThis.sessionStorage;', STORAGE],
  ['src/decode.ts', 'export const s = localStorage;', STORAGE],
  ['src/analytics.ts', "export const s = localStorage.getItem('one-thing:events');", STORAGE],
  ['src/reminder.ts', 'export const s = localStorage;', STORAGE],
  ['src/clock.ts', 'export const s = window.localStorage;', STORAGE],
  // stored JSON
  ['src/App.tsx', "export const j = JSON.parse('{}');", JSON_PARSE],
  ['src/analytics.ts', "export const j = JSON.parse('{}');", JSON_PARSE],
  ['src/reminder.ts', "export const j = JSON.parse('{}');", JSON_PARSE],
  ['src/decode.ts', "export const j = JSON.parse('{}');", JSON_PARSE],
  // clock
  ['src/App.tsx', 'export const late = new Date().getHours() >= 12;', CLOCK],
  ['src/App.tsx', 'export const d = new Date;', CLOCK],
  ['src/App.tsx', 'export const t = Date.now();', CLOCK],
  ['src/App.tsx', 'export const s = Date();', CLOCK],
  ['src/App.tsx', 'const { now } = Date; export const t = now();', CLOCK],
  ['src/storage.ts', 'export const t = Date.now();', CLOCK],
  ['src/analytics.ts', 'export const d = new Date();', CLOCK],
  ['src/reminder.ts', 'export const t = Date.now();', CLOCK],
  // reminder
  ['src/App.tsx', "export const ok = 'Notification' in window;", REMINDER],
  ['src/App.tsx', 'export const p = Notification.permission;', REMINDER],
  ['src/App.tsx', 'export const p = window.Notification.permission;', REMINDER],
  ['src/App.tsx', 'export const p = self.Notification.permission;', REMINDER],
  ['src/App.tsx', 'export const p = globalThis.Notification;', REMINDER],
  ['src/App.tsx', "export const r = navigator.serviceWorker.register('/sw.js');", REMINDER],
  ['src/App.tsx', "export const ok = 'serviceWorker' in navigator;", REMINDER],
  ['src/storage.ts', 'export const p = Notification.permission;', REMINDER],
  ['src/clock.ts', 'export const r = navigator.serviceWorker;', REMINDER],
  ['src/analytics.ts', "export const ok = 'Notification' in window;", REMINDER],
  // pure modules import nothing, not even the owners (clock imports logic, never the other way) and touch no DOM
  ['src/logic.ts', "import { now } from './clock'; export const x = now;", PURE('src/logic.ts')],
  ['src/logic.ts', "import { load } from './storage'; export const x = load;", PURE('src/logic.ts')],
  ['src/logic.ts', "import { readPermission } from './reminder'; export const x = readPermission;", PURE('src/logic.ts')],
  ['src/logic.ts', "import { isObj } from './decode'; export const x = isObj;", PURE('src/logic.ts')],
  ['src/logic.ts', "import { useState } from 'react'; export const x = useState;", PURE('src/logic.ts')],
  ['src/logic.ts', 'export const w = window.innerWidth;', PURE('src/logic.ts')],
  ['src/logic.ts', 'export const g = globalThis;', PURE('src/logic.ts')],
  ['src/logic.ts', 'export const t = Date.now();', CLOCK],
  ['src/logic.ts', 'export const s = localStorage;', STORAGE],
  ['src/events.ts', "import { dayKey } from './logic'; export const x = dayKey;", PURE('src/events.ts')],
  // owner modules do not import each other
  ['src/storage.ts', "import { track } from './analytics'; export const x = track;", OWNER_IMPORT('src/storage.ts')],
  ['src/storage.ts', "import { now } from './clock'; export const x = now;", OWNER_IMPORT('src/storage.ts')],
  ['src/analytics.ts', "import { notify } from './reminder'; export const x = notify;", OWNER_IMPORT('src/analytics.ts')],
  ['src/clock.ts', "import { load } from './storage'; export const x = load;", OWNER_IMPORT('src/clock.ts')],
  ['src/reminder.ts', "import { track } from './analytics'; export const x = track;", OWNER_IMPORT('src/reminder.ts')],
  ['src/reminder.ts', "import { kv } from './storage'; export const x = kv;", OWNER_IMPORT('src/reminder.ts')],
  ['src/storage.ts', "import { useState } from 'react'; export const x = useState;", OWNER_IMPORT('src/storage.ts')],
  // .ts modules are not UI
  ['src/decode.ts', "import { useState } from 'react'; export const x = useState;", UI],
  ['src/decode.ts', "import App from './App'; export const x = App;", UI],
  // the worker takes only the event list from the app
  ['worker/index.ts', "import { dayKey } from '../src/logic'; export const x = dayKey;", WORKER],
  ['worker/index.ts', "import { load } from '../src/storage'; export const x = load;", WORKER],
];

// [file, code]
const FINE = [
  // each owner may use its own API
  ['src/storage.ts', "export const s = localStorage.getItem('k'); export const j = JSON.parse('{}');"],
  ['src/clock.ts', 'export const now = () => Date.now(); export const d = new Date();'],
  ['src/reminder.ts', "export const ok = 'Notification' in window && Notification.permission; export const r = navigator.serviceWorker;"],
  // a timestamp passed in is fine anywhere
  ['src/App.tsx', 'export const d = (ms: number) => new Date(ms).getHours();'],
  ['src/logic.ts', 'export const day = (now: number) => new Date(now).getDate();'],
  // the imports each module is allowed
  ['src/App.tsx', "import { useState } from 'react'; import { now } from './clock'; import { load } from './storage'; export const x = [useState, now, load];"],
  ['src/clock.ts', "import { dayKey } from './logic'; export const x = dayKey;"],
  ['src/storage.ts', "import { MAX_DAYS } from './logic'; import { isObj } from './decode'; export const x = [MAX_DAYS, isObj];"],
  ['src/reminder.ts', "import { now } from './clock'; import { nextReminder } from './logic'; export const x = [now, nextReminder];"],
  ['src/analytics.ts', "import { now } from './clock'; import { dayKey } from './logic'; import { kv } from './storage'; import { EVENTS } from './events'; export const x = [now, dayKey, kv, EVENTS];"],
  ['src/decode.ts', "import type { Day } from './logic'; export const x = (d: Day) => d;"],
  ['worker/index.ts', "import { EVENTS } from '../src/events'; export const x = EVENTS;"],
  // tests stub the globals and may import anything
  ['src/storage.test.ts', "localStorage.setItem('k', 'v'); export const t = Date.now(); export const j = JSON.parse('{}');"],
  ['src/logic.test.ts', "import { now } from './clock'; export const p = Notification.permission + String(now);"],
  ['worker/index.test.ts', "import { dayKey } from '../src/logic'; export const x = dayKey;"],
];

// [file, code]: not caught today; if one starts failing, the rules got stronger: move it to BAD and update the header
const GAPS = [
  ['src/App.tsx', 'const D = Date; export const t = D.now();'],
  ['src/App.tsx', 'const w = window; export const s = w.localStorage;'],
  ['src/App.tsx', 'export const r = window.navigator.serviceWorker;'],
  ['src/App.tsx', 'export const t = window.Date.now();'],
  ['src/App.tsx', "const k = 'localStorage'; export const s = window[k];"],
];

describe('module map: bad snippets are reported with the fix', () => {
  it.each(BAD)('%s: %s', async (file, code, want) => {
    const msgs = await restricted(file, code);
    expect(msgs.some((m) => m.includes(want)), `got: ${JSON.stringify(msgs)}`).toBe(true);
  });
});

describe('module map: fine snippets are clean', () => {
  it.each(FINE)('%s: %s', async (file, code) => {
    expect(await restricted(file, code)).toEqual([]);
  });
});

describe('module map: known gaps', () => {
  it.each(GAPS)('%s: %s (not caught)', async (file, code) => {
    expect(await restricted(file, code)).toEqual([]);
  });
});
