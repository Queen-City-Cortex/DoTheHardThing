import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Module map: each platform API has exactly one owner module. Everything else in src/ goes through the owner.
// ESLint keeps only the last config's options for a rule name, so every file's no-restricted-* rules are built here from
// one table by boundaries(). Do not add another block that sets these four rules for src/ or worker/: it would replace
// the generated bans for those files. scripts/boundaries/*.test.mjs checks what the rules catch.
const WRAPPERS = ['window', 'globalThis', 'self'] // window.localStorage, globalThis.Notification, self['localStorage']
const OWNERS = {
  storage: {
    file: 'src/storage.ts',
    message: 'Only src/storage.ts touches localStorage. Use load/save, or kv() for a small key, from src/storage.ts.',
    globals: ['localStorage', 'sessionStorage'],
    properties: [],
    syntax: [],
  },
  // stored JSON is untrusted until src/decode.ts has read it
  json: {
    file: 'src/storage.ts',
    message: 'Parse stored data in src/storage.ts through the decoders in src/decode.ts, or read a small key with readSmall() from src/storage.ts. Do not call JSON.parse elsewhere in src.',
    globals: [],
    properties: [['JSON', 'parse']],
    syntax: [],
  },
  clock: {
    file: 'src/clock.ts',
    message: 'Only src/clock.ts reads the device clock. Use now() or today() from src/clock.ts and pass the number down (new Date(ms) is fine).',
    globals: [],
    properties: [['Date', 'now']],
    syntax: ["NewExpression[callee.name='Date'][arguments.length=0]", "CallExpression[callee.name='Date']"],
  },
  reminder: {
    file: 'src/reminder.ts',
    message: 'Only src/reminder.ts touches Notification and the service worker. Use askPermission, askPermissionIfUnasked, readPermission, notify or scheduleReminder from src/reminder.ts.',
    globals: ['Notification'],
    properties: [['navigator', 'serviceWorker']],
    syntax: ["BinaryExpression[operator='in'][left.value='Notification']", "BinaryExpression[operator='in'][left.value='serviceWorker']"],
  },
}
// What each owner module (and decode.ts) may import from src/, and nothing from React. The lists are short on purpose: a module
// that reaches for another owner is usually doing the caller's job. The fix is to pass the value in from the caller (App.tsx).
const OWNER_IMPORTS = {
  'src/storage.ts': ['./logic', './decode'],
  'src/decode.ts': ['./logic'],
  'src/clock.ts': ['./logic', './method'],
  'src/reminder.ts': ['./logic', './clock', './copy'],
  'src/analytics.ts': ['./logic', './clock', './storage', './events'],
}
// Pure modules touch no platform API and import only what is listed here (the method's numbers and the screen copy, for
// logic.ts; the day logic, for state.ts, the screen state reducer): they take every other value, the time included, as an argument.
const PURE = {
  'src/logic.ts': ['./method', './copy'],
  'src/logic/reminder.ts': ['../copy'], // a piece of logic.ts (see PURE_PARTS)
  'src/state.ts': ['./logic'],
  'src/events.ts': [],
  'src/method.ts': [],
  'src/copy.ts': [],
}
// Pieces of a pure module moved into their own files to keep it small: the module re-exports them, so it may import them too
// (the message above still names its own list). Each piece is itself in PURE and COPY_FILES.
const PURE_PARTS = { 'src/logic.ts': ['./logic/reminder'] }
const pureMessage = (file) => `${file} is pure: ${PURE[file].length ? `it may import only ${PURE[file].join(', ')}` : 'no imports'} and no DOM. Take the value as an argument; the caller gets it from now()/today() in src/clock.ts, load() in src/storage.ts or readPermission() in src/reminder.ts.`
// The method's numbers have one home, src/method.ts. These selectors apply to every src file except method.ts (tests are
// exempt like every rule here); they are heuristics for the shapes a stray rule number has taken, not a proof.
const NOT_A_RULE = ' Not a method number? Name it as a constant and disable this rule on that one line with the reason.'
const HOURS = "Late-hour cutoffs are method rules (PRODUCT QUESTION Q1, see docs/architecture.md): use isLate(t, 'welcomeFraming' | 'pickWarning') from src/clock.ts. The hours live in LATE_CUTOFFS in src/method.ts." + NOT_A_RULE
const RULE_NUMBER = 'Method numbers live in src/method.ts (RULES). Import the named constant (for example BLOCK_CHOICES, MAX_ITEMS, BREAK_LIMIT_MS) instead of writing the number here.' + NOT_A_RULE
const METHOD_SYNTAX = [
  // an hour compared with a literal: getHours() >= 12, hourOf(t) < 11, hour >= 11, lateHour > 10 (a name that is `hour` or ends in Hour; `hoursLeft` is not an hour of the day)
  { selector: "BinaryExpression[operator=/^[<>]=?$/]:matches([left.callee.property.name=/^get(UTC)?Hours$/], [right.callee.property.name=/^get(UTC)?Hours$/], [left.callee.name='hourOf'], [right.callee.name='hourOf'], [left.name=/^hour$|Hour$/], [right.name=/^hour$|Hour$/]):matches([left.type='Literal'], [right.type='Literal'])", message: HOURS },
  // block lengths as an array of numbers, e.g. [60, 90, 120] (0 and 1 stay allowed, so [0, 1] is fine; [1, 2] is not)
  { selector: 'ArrayExpression > Literal[raw=/^[0-9][0-9_]*$/][value>=2]', message: RULE_NUMBER },
  // item counts, e.g. items.length >= 3 (0 and 1 mean empty or not, and stay allowed)
  { selector: "BinaryExpression[operator=/^[<>]=?$/]:matches([left.property.name='length'][right.type='Literal'][right.value>=2], [right.property.name='length'][left.type='Literal'][left.value>=2])", message: RULE_NUMBER },
  // minutes written as milliseconds, e.g. 10 * 60_000 or 60000 * 10
  { selector: "BinaryExpression[operator='*']:matches([left.type='Literal'][right.raw=/^60_?000$/], [right.type='Literal'][left.raw=/^60_?000$/])", message: RULE_NUMBER },
]
// The app files whose words live in src/copy.ts. Anywhere in these files, text of four or more words written inline (JSX
// text, a string literal, a template literal part, in a screen or a module-level constant alike) is copy that went
// around the module and its transcript checks. A new file under src/ that renders or returns words joins this list.
// The lint judges each literal part on its own. Still not caught: strings of one to three words ('Start', 'Not today'),
// a sentence built by joining short pieces (concatenation, an array `.join(' ')`), a template whose literal parts each
// have three words or fewer (`${n} days you have`), and text in a file not listed here (copy.ts itself, method.ts with
// its talk quotes, tests). scripts/boundaries/app-copy.test.mjs fails when a listed file no longer exists, and when this list is
// not every non-test .ts/.tsx file directly under src/ minus its NOT_COPY_FILES (copy.ts, method.ts, vite-env.d.ts,
// each with its reason), so a rename, a removal or a new file cannot change what the rule covers without a test saying so.
export const COPY_FILES = ['src/App.tsx', 'src/main.tsx', 'src/logic.ts', 'src/reminder.ts', 'src/storage.ts', 'src/analytics.ts', 'src/clock.ts', 'src/decode.ts', 'src/events.ts', 'src/state.ts', 'src/logic/reminder.ts']
const MOVE_TEXT = "Move this text to src/copy.ts and render it with t(id); a talk quote needs kind: 'quote' and its transcript timestamp as ref." +
  ' Not words a person reads (a class list, an event name)? Disable this rule on that one line with the reason.'
const FOUR_WORDS = '/\\S+\\s+\\S+\\s+\\S+\\s+\\S+/'
// JSX attributes whose value is never read as words: a class list or id of four tokens is not copy. aria-label and
// title are read (aloud or on hover), so they stay copy.
const NOT_COPY_ATTR = 'JSXAttribute[name.name=/^(className|id|key|href|src|rel|target|type|role|name|htmlFor|autoComplete|inputMode|aria-(live|hidden|controls|describedby|labelledby)|data-.+)$/]'
const copySyntax = () => {
  const copy = (node) => `${node}:not(${NOT_COPY_ATTR} ${node.split('[')[0]})`
  return [`JSXText[value=${FOUR_WORDS}]`, copy(`Literal[value=${FOUR_WORDS}]`), copy(`TemplateElement[value.raw=${FOUR_WORDS}]`)]
    .map((selector) => ({ selector, message: MOVE_TEXT }))
}
const UI_ONLY = { group: ['react', 'react-dom', 'react-dom/*', './App', './main'], message: 'Only .tsx files are UI. Keep React and App out of .ts modules: export a plain function and call it from App.tsx.' }
const TESTS = ['**/*.test.ts', '**/*.test.tsx', '**/*.testlib.ts'] // *.testlib.ts: helpers a split test file shares (vitest runs only *.test.ts)

/** The no-restricted-* rules for one file: every owner's ban except the file's own, plus its import limits. */
function boundaries({ file, ui = false } = {}) {
  const pure = Object.hasOwn(PURE, file ?? '')
  const bans = Object.values(OWNERS).filter((o) => o.file !== file)
  const globals = bans.flatMap((o) => o.globals.map((name) => ({ name, message: o.message })))
  const properties = bans.flatMap((o) => [
    ...o.properties.map(([object, property]) => ({ object, property, message: o.message })),
    ...o.globals.flatMap((property) => WRAPPERS.map((object) => ({ object, property, message: o.message }))),
  ])
  if (pure) for (const name of ['window', 'document', 'navigator', 'fetch', 'location', 'globalThis', 'self']) globals.push({ name, message: pureMessage(file) })
  const allowed = OWNER_IMPORTS[file]
  const only = (list) => `^(?!(${list.map((a) => a.replace('.', '\\.')).join('|')})$)` // any import not on the list
  const imports = pure ? [PURE[file].length ? { regex: only([...PURE[file], ...(PURE_PARTS[file] ?? [])]), message: pureMessage(file) } : { group: ['*'], message: pureMessage(file) }]
    : allowed ? [{ regex: only(allowed), message: `${file} may import only ${allowed.join(', ')}. Take the value as an argument and let App.tsx get it from the other owner (for example now() from src/clock.ts).` }]
    : ui ? [] : [UI_ONLY]
  return {
    'no-restricted-globals': ['error', ...globals],
    'no-restricted-properties': ['error', ...properties],
    'no-restricted-syntax': ['error', ...bans.flatMap((o) => o.syntax.map((selector) => ({ selector, message: o.message }))), ...(file === 'src/method.ts' ? [] : METHOD_SYNTAX),
      ...(COPY_FILES.includes(file) ? copySyntax() : [])],
    'no-restricted-imports': ['error', { patterns: imports }],
  }
}
const special = [...new Set([...Object.values(OWNERS).map((o) => o.file), ...Object.keys(OWNER_IMPORTS), ...Object.keys(PURE), ...COPY_FILES])]

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // the check scripts and the journey runner run in Node (older scripts and journeys evaluate browser code inside page.evaluate and are not linted yet)
    extends: [js.configs.recommended],
    files: ['scripts/check*.mjs', 'scripts/check*/*.mjs', 'scripts/boundaries/*.mjs', 'scripts/install-hooks.mjs', 'scripts/headers-policy.mjs', 'scripts/transcript.mjs', 'scripts/verify-live.mjs', 'scripts/**/*.test.mjs', 'e2e/run.mjs', 'e2e/csp-watch.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  { files: ['src/**/*.tsx'], ignores: TESTS, rules: boundaries({ ui: true }) },
  { files: ['src/**/*.ts'], ignores: [...TESTS, ...special], rules: boundaries() },
  ...special.map((file) => ({ files: [file], rules: boundaries({ file, ui: file.endsWith('.tsx') }) })),
  {
    // the worker shares only the event list with the app; tsconfig.worker.json typechecks the same pair
    files: ['worker/**/*.ts'],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['../src/*', '!../src/events', '!../src/events.ts'], message: 'The worker shares only the event list with the app. Import EVENTS from ../src/events, nothing else from src/.' }] }],
    },
  },
)
