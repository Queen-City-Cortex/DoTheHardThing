# Rules for agents working on this repo

Every rule below names the check that fails when it is broken. Human contributors: see CONTRIBUTING.md.

## The loop

Run this before you call any change done. It stops at the first failure and prints the step to rerun.

| Command | What it runs | When |
| --- | --- | --- |
| `npm run check:fast` | public hygiene, AGENTS.md check, typecheck, lint, unit tests | while iterating |
| `npm run check` | check:fast, then `vite build` and the dist check | before every commit |
| `npm run check:full` | check, then every journey against the fresh build | before a change to what a person sees or does is called done |
| `npm run journeys:fast` | the 8 per-PR journeys (`FAST` in `e2e/run.mjs`) on the current `dist/` | after `npm run build` |
| `npm run verify:live` | read-only checks of the live site | after a deploy, before saying it is live |

The journey commands serve `dist/` on `VDT_PORT` (default 4317). Other agents share this machine: set `VDT_PORT` to any free port above 4400, e.g. `export VDT_PORT=$((4400 + RANDOM % 500))`, and use it for every command.

## Rules

| Rule | Enforced by | Command |
| --- | --- | --- |
| A change is done only when the loop passes; report which loop ran | `scripts/check.mjs` | `npm run check` |
| Every row here names an enforcer that exists (file, script, journey) | `scripts/check-agents-md.mjs` | `npm run check:agents-md` |
| Typecheck, lint and unit tests pass | `tsc -b`, `eslint.config.js`, `src/**/*.test.ts`, `worker/**/*.test.ts`, `scripts/**/*.test.mjs` | `npm run check:fast` |
| No internal working notes, agent or tool names, owner or company name outside the author lines, absolute machine paths, Cloudflare ids or tokens, or private repo names in tracked and unignored files or their paths (the list is `RULES` in the script) | `scripts/check-public-hygiene.mjs` | `npm run check:public-hygiene` |
| `/`, `/index.html` and `/sw.js` get no-cache; the service worker precache covers every file the page loads; manifest icons exist | `scripts/check-dist.mjs` | `npm run check:dist` |
| Journeys drive `dist/`, not `src/`: rebuild before running them | `e2e/run.mjs --serve` refuses a `dist/` older than `src/`, `public/`, `index.html` or `vite.config.ts` | `npm run journeys` |
| Each journey runs isolated (own browser, fresh context, own fake clock, own evidence dir) and fails after `VDT_JOURNEY_TIMEOUT_MS` (default 120000) | `e2e/run.mjs` (one `e2e/drive.mjs` child per journey) | `npm run journeys` |
| `vdt launch` and `vdt cleanup` refuse to run without `VDT_PORT`; pick a port of your own so you never stop another agent's server | `e2e/vdt` | `e2e/vdt launch` with your `VDT_PORT` set |
| A live journey run never adds to the real counts (`/api/event` answered locally off `http://127.*`) | `session()` in `e2e/drive.mjs` | `VDT_URL=https://dothehardthing.app node e2e/drive.mjs <name>` |
| Live verification is read-only: GET only, never POST `/api/event` | `scripts/verify-live.mjs` | `npm run verify:live` |
| "It is live" means the live entry script equals `dist/index.html`, `/api/event` answers 405, og-image and sw.js bytes equal this build | `scripts/verify-live.mjs` | `npm run build && npm run verify:live -- --retries 4` |
| Stored data is decoded, never trusted: parse stored JSON only in `src/storage.ts`, through `src/decode.ts`; a small key owned by another module (`one-thing:events`) is read with `readSmall()` there (tests are exempt) | `eslint.config.js` (`JSON.parse` in `OWNERS`), `scripts/boundaries.test.mjs`, `src/storage.corrupt.test.ts`, `src/storage.fuzz.test.ts`, `src/decode.test.ts` | `npm run check:fast` |
| Only `src/storage.ts` touches `localStorage`; elsewhere use `load`/`save`, or `kv()` for a small key (tests are exempt) | `eslint.config.js` (`OWNERS`), `scripts/boundaries.test.mjs` | `npm run check:fast` |
| Only `src/clock.ts` reads the device clock (`Date.now()`, `new Date()` with no argument); elsewhere use `now()` or `today()` and pass the number down | `eslint.config.js` (`OWNERS`), `scripts/boundaries.test.mjs` | `npm run check:fast` |
| Only `src/reminder.ts` touches `Notification` and the service worker; elsewhere use `askPermission`, `askPermissionIfUnasked`, `readPermission`, `notify` or `scheduleReminder` | `eslint.config.js` (`OWNERS`), `scripts/boundaries.test.mjs`, `src/reminder.test.ts` | `npm run check:fast` |
| Module boundaries: `src/logic.ts` and `src/events.ts` are pure (no imports, no DOM); each owner module and `src/decode.ts` import only what `OWNER_IMPORTS` lists; `.ts` modules never import React or App; one table drives all four `no-restricted-*` rules, so never add another block that sets them | `eslint.config.js` (`boundaries()`), `scripts/boundaries.test.mjs` | `npm run check:fast` |
| The worker imports only `src/events.ts` from the app. `tsconfig.worker.json` is part of `tsc -b` and typechecks with the Workers types and no DOM lib (`document` or `localStorage` in the worker is a type error), so a type error in `worker/index.ts` or `src/events.ts` fails `npm run build` and blocks the deploy | `eslint.config.js` (worker block), `tsconfig.worker.json`, `scripts/boundaries.test.mjs` | `npm run check` |
| Never rename the `one-thing:*` storage keys; v2 is read, never written or deleted | `src/storage.test.ts`, journey `migrate-v2` | `npm test`, `npm run journeys -- migrate-v2` |
| Text meets WCAG AA contrast in light and dark | `src/contrast.test.ts`, journey `contrast-aa` | `npm test`, `npm run journeys -- contrast-aa` |
| No em dash in the UI | journeys `welcome-v1`, `review-copy`, `first-visit` | `npm run journeys -- welcome-v1 review-copy first-visit` |
| Close never shows a verdict ("a start, not a full block", "got its block") | `noVerdict` in `e2e/drive.mjs` close journeys | `npm run journeys -- close-day` |
| A block belongs to the day it started; do not weaken the midnight journeys | journeys `midnight-rollover`, `block-across-midnight`, `block-reload-after-midnight` | `npm run journeys -- midnight-rollover block-across-midnight block-reload-after-midnight` |

`check:agents-md` checks that each named enforcer EXISTS (file, script, journey), not that it actually enforces the rule, so a wrong-but-existing enforcer passes. Review the rows when you change an enforcer.
