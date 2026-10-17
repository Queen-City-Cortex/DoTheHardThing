// The module map in eslint.config.js (OWNERS, OWNER_IMPORTS, PURE, METHOD_SYNTAX): in-memory snippets linted with the repo's own config.
// Each bad snippet must be reported with its owner's message, which names the module and function to use instead;
// each fine snippet must be clean. This checks what the rules catch, so a later block that silently replaces the
// generated bans for some files fails here.
// Known gaps, not caught by the built-in rules (lint is a guardrail, not a proof; the last describe pins them):
//   aliasing (`const D = Date; D.now()`, `const w = window; w.localStorage`), a nested wrapper
//   (`window.navigator.serviceWorker`, `window.Date.now()`), and reading through a variable (`const k = 'localStorage'; window[k]`).
//   Imports: a dynamic `import('./clock')` in an owner module, and `./../src/logic` in the worker (the `../src/*` group does not match that spelling).
//   `const { now } = Date` IS caught (no-restricted-properties handles destructuring).
// Pure modules: logic.ts may import only ./method and ./copy; method.ts, events.ts and copy.ts import nothing.
// Screen copy (COPY_SCREENS): inside the listed screen functions, inline text of 4 or more words is reported. Not caught:
// a module-level constant rendered by a screen, 1 to 3 words, a screen written as an arrow function or moved to another
// file, and the screens not listed yet. A listed function that is no longer declared in its file fails the last describe.
// Method numbers (METHOD_SYNTAX, everywhere in src except method.ts and tests) are caught only in the shapes they have
// taken: an hour compared with a literal, numbers of 2 or more in an array literal, `.length` compared with a literal of
// 2 or more, and `<n> * 60_000`. Not caught: a cutoff or count through a variable (`const late = 12; hourOf(t) >= late`),
// arithmetic on the literal (`getHours() > 12 - 1`), a bare default (`useState(small ? 90 : BLOCK_MIN)`), `===` on a count.
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COPY_SCREENS } from '../eslint.config.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

const STORAGE = 'Only src/storage.ts touches localStorage. Use load/save, or kv() for a small key, from src/storage.ts.';
const JSON_PARSE = 'Parse stored data in src/storage.ts through the decoders in src/decode.ts, or read a small key with readSmall() from src/storage.ts.';
const CLOCK = 'Only src/clock.ts reads the device clock. Use now() or today() from src/clock.ts';
const REMINDER = 'Only src/reminder.ts touches Notification and the service worker. Use askPermission, askPermissionIfUnasked, readPermission, notify or scheduleReminder from src/reminder.ts.';
const PURE = (f) => `${f} is pure: no imports and no DOM. Take the value as an argument;`;
const LOGIC_PURE = 'src/logic.ts is pure: it may import only ./method, ./copy and no DOM. Take the value as an argument;';
const MOVE_TEXT = "Move this text to src/copy.ts and render it with t(id); a talk quote needs kind: 'quote' and its transcript timestamp as ref.";
const HOURS = "Late-hour cutoffs are method rules (PRODUCT QUESTION Q1, see docs/architecture.md): use isLate(t, 'welcomeFraming' | 'pickWarning') from src/clock.ts. The hours live in LATE_CUTOFFS in src/method.ts.";
const RULE_NUMBER = 'Method numbers live in src/method.ts (RULES). Import the named constant (for example BLOCK_CHOICES, MAX_ITEMS, BREAK_LIMIT_MS) instead of writing the number here.';
const ESCAPE = 'Not a method number? Name it as a constant and disable this rule on that one line with the reason.';
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
  // pure modules import only their list (logic.ts: ./method; method.ts and events.ts: nothing), never the owners
  // (clock imports logic, never the other way), and touch no DOM
  ['src/logic.ts', "import { now } from './clock'; export const x = now;", LOGIC_PURE],
  ['src/logic.ts', "import { load } from './storage'; export const x = load;", LOGIC_PURE],
  ['src/logic.ts', "import { readPermission } from './reminder'; export const x = readPermission;", LOGIC_PURE],
  ['src/logic.ts', "import { isObj } from './decode'; export const x = isObj;", LOGIC_PURE],
  ['src/logic.ts', "import { useState } from 'react'; export const x = useState;", LOGIC_PURE],
  ['src/logic.ts', 'export const w = window.innerWidth;', LOGIC_PURE],
  ['src/logic.ts', 'export const g = globalThis;', LOGIC_PURE],
  ['src/method.ts', "import { dayKey } from './logic'; export const x = dayKey;", PURE('src/method.ts')],
  ['src/method.ts', "import { now } from './clock'; export const x = now;", PURE('src/method.ts')],
  ['src/method.ts', 'export const d = document.title;', PURE('src/method.ts')],
  ['src/method.ts', 'export const t = Date.now();', CLOCK],
  ['src/events.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;", PURE('src/events.ts')],
  ['src/logic.ts', 'export const t = Date.now();', CLOCK],
  ['src/logic.ts', 'export const s = localStorage;', STORAGE],
  ['src/events.ts', "import { dayKey } from './logic'; export const x = dayKey;", PURE('src/events.ts')],
  ['src/copy.ts', "import { useState } from 'react'; export const x = useState;", PURE('src/copy.ts')],
  ['src/copy.ts', "import { daysWord } from './logic'; export const x = daysWord;", PURE('src/copy.ts')],
  ['src/copy.ts', 'export const d = document.title;', PURE('src/copy.ts')],
  ['src/logic.ts', "import { load } from './storage'; import { t } from './copy'; export const x = [load, t];", LOGIC_PURE],
  // screen copy: inline text of 4 or more words in a migrated screen (JSX text, a string literal, a template part)
  ['src/App.tsx', 'export function Pick() { return <p>Let the rest slide today.</p>; }', MOVE_TEXT],
  ['src/App.tsx', "export function Close({ yes }: { yes: boolean }) { return <p>{yes ? 'Good, that is all.' : 'x'}</p>; }", MOVE_TEXT],
  ['src/App.tsx', 'export function Closed({ n }: { n: number }) { return <p>{`${n} days you have done it`}</p>; }', MOVE_TEXT],
  ['src/App.tsx', 'export function Welcome() { return <p aria-label="Start your day over now">x</p>; }', MOVE_TEXT],
  ['src/App.tsx', 'function FirstWelcome() { return <h1>Each morning, do it.</h1>; } export const x = FirstWelcome;', MOVE_TEXT],
  // each owner module imports only its allow-list
  ['src/decode.ts', "import { now } from './clock'; export const x = now;", OWNER_IMPORT('src/decode.ts')],
  ['src/storage.ts', "import { track } from './analytics'; export const x = track;", OWNER_IMPORT('src/storage.ts')],
  ['src/storage.ts', "import { now } from './clock'; export const x = now;", OWNER_IMPORT('src/storage.ts')],
  ['src/analytics.ts', "import { notify } from './reminder'; export const x = notify;", OWNER_IMPORT('src/analytics.ts')],
  ['src/clock.ts', "import { load } from './storage'; export const x = load;", OWNER_IMPORT('src/clock.ts')],
  ['src/reminder.ts', "import { track } from './analytics'; export const x = track;", OWNER_IMPORT('src/reminder.ts')],
  ['src/reminder.ts', "import { kv } from './storage'; export const x = kv;", OWNER_IMPORT('src/reminder.ts')],
  ['src/storage.ts', "import { useState } from 'react'; export const x = useState;", OWNER_IMPORT('src/storage.ts')],
  // the method's numbers reach the owners through logic.ts or as arguments from App.tsx; only clock.ts (isLate) imports ./method
  ['src/decode.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;", OWNER_IMPORT('src/decode.ts')],
  ['src/storage.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;", OWNER_IMPORT('src/storage.ts')],
  ['src/analytics.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;", OWNER_IMPORT('src/analytics.ts')],
  ['src/reminder.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;", OWNER_IMPORT('src/reminder.ts')],
  // .ts modules are not UI
  ['src/decode.ts', "import { useState } from 'react'; export const x = useState;", OWNER_IMPORT('src/decode.ts')],
  ['src/decode.ts', "import App from './App'; export const x = App;", OWNER_IMPORT('src/decode.ts')],
  ['src/other.ts', "import { useState } from 'react'; export const x = useState;", UI],
  ['src/other.ts', "import App from './App'; export const x = App;", UI],
  // the worker takes only the event list from the app
  ['worker/index.ts', "import { dayKey } from '../src/logic'; export const x = dayKey;", WORKER],
  ['worker/index.ts', "import { load } from '../src/storage'; export const x = load;", WORKER],
  // late-hour cutoffs: an hour compared with a literal, in the UI, a pure module, an owner and a plain module
  ['src/App.tsx', 'export const late = (ms: number) => new Date(ms).getHours() >= 12;', HOURS],
  ['src/App.tsx', 'export const late = (hour: number) => hour >= 11;', HOURS],
  ['src/App.tsx', 'declare const hourOf: (t: number) => number; export const late = (t: number) => hourOf(t) < 12;', HOURS],
  ['src/logic.ts', 'export const late = (now: Date) => now.getHours() >= 11;', HOURS],
  ['src/logic.ts', 'export const late = (startHour: number) => 11 <= startHour;', HOURS],
  ['src/clock.ts', 'export const late = (t: number) => new Date(t).getHours() >= 12;', HOURS],
  ['src/decode.ts', 'export const late = (hour: number) => hour > 10;', HOURS],
  ['src/other.ts', 'export const late = (d: Date) => d.getHours() >= 11;', HOURS],
  ['src/App.tsx', 'export const late = (d: Date) => d.getUTCHours() >= 12;', HOURS],
  ['src/App.tsx', 'export const late = (lateHour: number) => lateHour > 10;', HOURS],
  // both messages end with the way out for a number that is not a method rule
  ['src/App.tsx', 'export const late = (hour: number) => hour >= 11;', ESCAPE],
  ['src/App.tsx', 'export const opts = [60, 90];', ESCAPE],
  ['src/App.tsx', 'export const two = [1, 2];', RULE_NUMBER],
  // rule numbers: block lengths in an array, item counts, minutes written as ms
  ['src/App.tsx', 'export const opts = [60, 90, 120];', RULE_NUMBER],
  ['src/App.tsx', 'export const opts = (small: boolean) => (small ? [60, 90, 120] : [120, 150, 180]);', RULE_NUMBER],
  ['src/App.tsx', 'export const full = (xs: string[]) => xs.length >= 5;', RULE_NUMBER],
  ['src/App.tsx', 'export const full = (xs: string[]) => 3 > xs.length;', RULE_NUMBER],
  ['src/App.tsx', 'export const limit = 10 * 60_000;', RULE_NUMBER],
  ['src/logic.ts', 'export const SMALL_BLOCK_OPTIONS = [60, 90];', RULE_NUMBER],
  ['src/logic.ts', 'export const BREAK_LIMIT_MS = 10 * 60_000;', RULE_NUMBER],
  ['src/logic.ts', 'export const limit = 60000 * 10;', RULE_NUMBER],
  ['src/logic.ts', 'export const canAdd = (xs: string[]) => xs.length < 5;', RULE_NUMBER],
  ['src/clock.ts', 'export const opts = [60, 90];', RULE_NUMBER],
  ['src/clock.ts', 'export const limit = 10 * 60000;', RULE_NUMBER],
  ['src/clock.ts', 'export const enough = (xs: number[]) => xs.length >= 3;', RULE_NUMBER],
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
  ['src/clock.ts', 'export const day = (t: number) => new Date(t).getDate(); export const h = (t: number) => new Date(t).getHours();'],
  // the imports each module is allowed
  ['src/App.tsx', "import { useState } from 'react'; import { now } from './clock'; import { load } from './storage'; export const x = [useState, now, load];"],
  ['src/clock.ts', "import { dayKey } from './logic'; export const x = dayKey;"],
  ['src/clock.ts', "import { dayKey } from './logic'; import { lateAt } from './method'; export const x = [dayKey, lateAt];"],
  ['src/logic.ts', "import { MAX_ITEMS } from './method'; export const x = MAX_ITEMS;"],
  ['src/logic.ts', "import { MAX_ITEMS } from './method'; import { fmt, t } from './copy'; export const x = [MAX_ITEMS, fmt, t];"],
  // copy.ts is where the words live; the screens render them by id; short labels and unmigrated screens are left alone
  ['src/copy.ts', "export const COPY = { 'pick.hero': { kind: 'own', text: 'Which one thing gets today?' } };"],
  ['src/App.tsx', "declare const t: (id: string) => string; export function Pick() { return <h1 className=\"hero promise big\">{t('pick.hero')}</h1>; }"],
  ['src/App.tsx', 'export function Pick() { return <button>Start the block</button>; }'],
  ['src/App.tsx', 'export function Days() { return <p>Only the days you did it are listed.</p>; }'],
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
  ['src/reminder.ts', "import { now } from './clock'; import { nextReminder } from './logic'; export const x = [now, nextReminder];"],
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
const GAPS = [
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
  // screen copy outside the listed function declarations: a module constant, an arrow-function screen, another file
  ['src/App.tsx', "const LINE = 'Let the rest slide today.'; export function Pick() { return <p>{LINE}</p>; }"],
  ['src/App.tsx', 'export const Pick = () => <p>Let the rest slide today.</p>;'],
  ['src/Pick.tsx', 'export function Pick() { return <p>Let the rest slide today.</p>; }'],
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

describe('screen copy: every screen in COPY_SCREENS is still declared in its file', () => {
  it.each(Object.entries(COPY_SCREENS).flatMap(([file, fns]) => fns.map((fn) => [file, fn])))('%s declares function %s', (file, fn) => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(new RegExp(`^(export )?function ${fn}\\(`, 'm').test(src), `${fn} is not a function declaration in ${file} any more, so the copy lint skips it: update COPY_SCREENS in eslint.config.js`).toBe(true);
  });
});
