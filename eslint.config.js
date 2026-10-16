import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

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
  {
    // stored JSON is untrusted until src/decode.ts has read it
    files: ['src/**/*.{ts,tsx}'],
    // analytics.ts reads its own `one-thing:events` key and guards it by hand; moving that read into storage.ts is a later step
    ignores: ['src/storage.ts', 'src/decode.ts', 'src/analytics.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-properties': ['error', { object: 'JSON', property: 'parse', message: 'Parse stored data in src/storage.ts through the decoders in src/decode.ts. Do not call JSON.parse elsewhere in src.' }],
    },
  },
)
