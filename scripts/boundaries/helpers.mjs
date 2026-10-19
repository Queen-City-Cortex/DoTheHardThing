// The module map in eslint.config.js (OWNERS, OWNER_IMPORTS, PURE, METHOD_SYNTAX): in-memory snippets linted with the repo's own config.
// Each bad snippet must be reported with its owner's message, which names the module and function to use instead;
// each fine snippet must be clean. This checks what the rules catch, so a later block that silently replaces the
// generated bans for some files fails here.
// Known gaps, not caught by the built-in rules (lint is a guardrail, not a proof; the last describe pins them):
//   aliasing (`const D = Date; D.now()`, `const w = window; w.localStorage`), a nested wrapper
//   (`window.navigator.serviceWorker`, `window.Date.now()`), and reading through a variable (`const k = 'localStorage'; window[k]`).
//   Imports: a dynamic `import('./clock')` in an owner module, and `./../src/logic` in the worker (the `../src/*` group does not match that spelling).
//   `const { now } = Date` IS caught (no-restricted-properties handles destructuring).
// Pure modules: logic.ts may import only ./method and ./copy; state.ts (the screen state reducer) only ./logic; method.ts,
// events.ts and copy.ts import nothing.
// App copy (COPY_FILES): anywhere in the listed files, inline text of 4 or more words is reported, in a screen function,
// an arrow function or a module-level constant alike. The lint judges each literal part on its own, so not caught: 1 to
// 3 words, a sentence joined from short pieces (concatenation, `{' '}`-split JSX text, an array `.join(' ')`), a
// template whose literal parts each have 3 words or fewer (`${n} days you have`), and text in a file not listed.
// Values of non-copy JSX attributes (className, id, key, href, rel, target, type, role and the like) are not copy;
// aria-label and title are. The last describe fails when a listed file no longer exists, and when COPY_FILES is not
// every non-test .ts/.tsx file directly under src/ minus NOT_COPY_FILES (so a removed entry or a new file nobody added fails).
// Method numbers (METHOD_SYNTAX, everywhere in src except method.ts and tests) are caught only in the shapes they have
// taken: an hour compared with a literal, numbers of 2 or more in an array literal, `.length` compared with a literal of
// 2 or more, and `<n> * 60_000`. Not caught: a cutoff or count through a variable (`const late = 12; hourOf(t) >= late`),
// arithmetic on the literal (`getHours() > 12 - 1`), a bare default (`useState(small ? 90 : BLOCK_MIN)`), `===` on a count.

import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

export const cwd = fileURLToPath(new URL('../..', import.meta.url));
export const eslint = new ESLint({ cwd });

export const STORAGE = 'Only src/storage.ts touches localStorage. Use load/save, or kv() for a small key, from src/storage.ts.';
export const JSON_PARSE = 'Parse stored data in src/storage.ts through the decoders in src/decode.ts, or read a small key with readSmall() from src/storage.ts.';
export const CLOCK = 'Only src/clock.ts reads the device clock. Use now() or today() from src/clock.ts';
export const REMINDER = 'Only src/reminder.ts touches Notification and the service worker. Use askPermission, askPermissionIfUnasked, readPermission, notify or scheduleReminder from src/reminder.ts.';
export const PURE = (f) => `${f} is pure: no imports and no DOM. Take the value as an argument;`;
export const LOGIC_PURE = 'src/logic.ts is pure: it may import only ./method, ./copy and no DOM. Take the value as an argument;';
export const STATE_PURE = 'src/state.ts is pure: it may import only ./logic and no DOM. Take the value as an argument; the caller gets it from now()/today() in src/clock.ts';
export const MOVE_TEXT = "Move this text to src/copy.ts and render it with t(id); a talk quote needs kind: 'quote' and its transcript timestamp as ref.";
export const COPY_ESCAPE = 'Not words a person reads (a class list, an event name)? Disable this rule on that one line with the reason.';
export const HOURS = "Late-hour cutoffs are method rules (PRODUCT QUESTION Q1, see docs/architecture.md): use isLate(t, 'welcomeFraming' | 'pickWarning') from src/clock.ts. The hours live in LATE_CUTOFFS in src/method.ts.";
export const RULE_NUMBER = 'Method numbers live in src/method.ts (RULES). Import the named constant (for example BLOCK_CHOICES, MAX_ITEMS, BREAK_LIMIT_MS) instead of writing the number here.';
export const ESCAPE = 'Not a method number? Name it as a constant and disable this rule on that one line with the reason.';
export const OWNER_IMPORT = (f) => `${f} may import only `;
export const UI = 'Only .tsx files are UI. Keep React and App out of .ts modules: export a plain function and call it from App.tsx.';
export const WORKER = 'The worker shares only the event list with the app. Import EVENTS from ../src/events, nothing else from src/.';

/** The no-restricted-* messages ESLint reports for `code` as if it were `filePath`. */
export async function restricted(filePath, code) {
  const [r] = await eslint.lintText(code, { filePath });
  const fatal = r.messages.filter((m) => m.fatal);
  if (fatal.length) throw new Error(`${filePath}: ${fatal[0].message}`);
  return r.messages.filter((m) => m.ruleId?.startsWith('no-restricted-')).map((m) => m.message);
}
