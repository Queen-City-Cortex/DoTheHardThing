import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Module map: each platform API has exactly one owner module. Everything else in src/ goes through the owner.
// ESLint keeps only the last config's options for a rule name, so every file's no-restricted-* rules are built here from
// one table by boundaries(). Do not add another block that sets these four rules for src/ or worker/: it would replace
// the generated bans for those files. scripts/boundaries.test.mjs checks what the rules catch.
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
  'src/clock.ts': ['./logic'],
  'src/reminder.ts': ['./logic', './clock'],
  'src/analytics.ts': ['./logic', './clock', './storage', './events'],
}
// Pure modules import nothing and touch no platform API: they take every value as an argument.
const PURE = ['src/logic.ts', 'src/events.ts']
const pureMessage = (file) => `${file} is pure: no imports and no DOM. Take the value as an argument; the caller gets it from now()/today() in src/clock.ts, load() in src/storage.ts or readPermission() in src/reminder.ts.`
const UI_ONLY = { group: ['react', 'react-dom', 'react-dom/*', './App', './main'], message: 'Only .tsx files are UI. Keep React and App out of .ts modules: export a plain function and call it from App.tsx.' }
const TESTS = ['**/*.test.ts', '**/*.test.tsx']

/** The no-restricted-* rules for one file: every owner's ban except the file's own, plus its import limits. */
function boundaries({ file, pure = false, ui = false } = {}) {
  const bans = Object.values(OWNERS).filter((o) => o.file !== file)
  const globals = bans.flatMap((o) => o.globals.map((name) => ({ name, message: o.message })))
  const properties = bans.flatMap((o) => [
    ...o.properties.map(([object, property]) => ({ object, property, message: o.message })),
    ...o.globals.flatMap((property) => WRAPPERS.map((object) => ({ object, property, message: o.message }))),
  ])
  if (pure) for (const name of ['window', 'document', 'navigator', 'fetch', 'location', 'globalThis', 'self']) globals.push({ name, message: pureMessage(file) })
  const allowed = OWNER_IMPORTS[file]
  const imports = pure ? [{ group: ['*'], message: pureMessage(file) }]
    : allowed ? [{ regex: `^(?!(${allowed.map((a) => a.replace('.', '\\.')).join('|')})$)`, message: `${file} may import only ${allowed.join(', ')}. Take the value as an argument and let App.tsx get it from the other owner (for example now() from src/clock.ts).` }]
    : ui ? [] : [UI_ONLY]
  return {
    'no-restricted-globals': ['error', ...globals],
    'no-restricted-properties': ['error', ...properties],
    'no-restricted-syntax': ['error', ...bans.flatMap((o) => o.syntax.map((selector) => ({ selector, message: o.message })))],
    'no-restricted-imports': ['error', { patterns: imports }],
  }
}
const special = [...new Set([...Object.values(OWNERS).map((o) => o.file), ...Object.keys(OWNER_IMPORTS), ...PURE])]

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
    files: ['scripts/check*.mjs', 'scripts/verify-live.mjs', 'scripts/**/*.test.mjs', 'e2e/run.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  { files: ['src/**/*.tsx'], ignores: TESTS, rules: boundaries({ ui: true }) },
  { files: ['src/**/*.ts'], ignores: [...TESTS, ...special], rules: boundaries() },
  ...special.map((file) => ({ files: [file], rules: boundaries({ file, pure: PURE.includes(file) }) })),
  {
    // the worker shares only the event list with the app; tsconfig.worker.json typechecks the same pair
    files: ['worker/**/*.ts'],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['../src/*', '!../src/events', '!../src/events.ts'], message: 'The worker shares only the event list with the app. Import EVENTS from ../src/events, nothing else from src/.' }] }],
    },
  },
)
