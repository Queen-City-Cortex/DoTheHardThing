# Architecture

Do The Hard Thing is a static single-page app plus one tiny Cloudflare Worker.

## Pieces

| Path | What it is |
| --- | --- |
| `src/` | The app: Vite, React 18 and TypeScript. `App.tsx` holds the screens; `logic.ts` is the pure day logic (items, tags, blocks, counts); `method.ts` holds the method's rules and numbers as data; `storage.ts` reads and writes `localStorage`; `reminder.ts` schedules the optional morning notification; `analytics.ts` is the anonymous-count client; `clock.ts` reads the device clock; `events.ts` is the event list shared with the Worker; `decode.ts` turns stored JSON into typed days. Tests sit beside the code as `*.test.ts` (Vitest). |
| `worker/index.ts` | A Cloudflare Worker. Requests to `/api/*` run it first. It handles `POST /api/event`, answers 404 or 405 for anything else under `/api/`, and everything else is served from `dist/` by the assets binding. |
| `wrangler.jsonc` | Worker config: static assets from `./dist`, single-page-app fallback, `run_worker_first` only for `/api/*`, the Analytics Engine binding, and the production routes. |
| `vite.config.ts` | Vite config and `vite-plugin-pwa` (service worker, web manifest). Also adds the optional Cloudflare Web Analytics beacon at build time. |
| `e2e/` | Playwright journeys that drive a production build in headless Chromium. See [`e2e/README.md`](../e2e/README.md). |
| `scripts/screens.mjs` | Regenerates `docs/screenshots/`. |
| `scripts/og/card.mjs` | Rebuilds the link preview card `public/og-image.png` from a live screenshot of the Pick screen (see the README). |

## Module map

Each platform API has one owner module in `src/`. Every other module calls the owner, so a second copy of a date key, a storage read or a permission check cannot appear.

| Owner | Owns | Others use |
| --- | --- | --- |
| `storage.ts` | `localStorage`, parsing stored JSON (through `decode.ts`) | `load`, `save`, `refresh`, `kv()` and `readSmall()` for a small key |
| `clock.ts` | `Date.now()` and `new Date()` with no argument | `now()`, `today()`, `isLate(t, cutoff)`; pass the number down |
| `reminder.ts` | `Notification`, `navigator.serviceWorker` | `askPermission`, `askPermissionIfUnasked`, `readPermission`, `notify`, `scheduleReminder` |

`logic.ts`, `method.ts` and `events.ts` are pure: they take every value as an argument, and `logic.ts` imports only `method.ts` while the other two import nothing (`clock.ts` imports `logic.ts` and `method.ts`, never the other way). Each owner module imports only what its entry in `OWNER_IMPORTS` lists, `.ts` modules never import React, and the Worker imports only `events.ts` from the app. The `OWNERS` table in `eslint.config.js` turns this map into lint errors that name the function to call, and `scripts/boundaries.test.mjs` checks what those rules catch. Tests are exempt, since they stub the globals.

## The method's rules

`src/method.ts` is the one home for the method's numbers. `RULES` lists each rule with where it comes from: `talk` (the talk says it; `ref` is the transcript timestamp and `quote` a verbatim piece of that line), `reading` (the app's reading of a line in the talk) or `app` (the app's own addition). The named constants the app uses (`MAX_ITEMS`, `BLOCK_MIN`, `BLOCK_CHOICES`, `BREAK_LIMIT_MS` and the rest) are read from `RULES`, and lint flags a bare hour cutoff, block length, item count or minutes-as-milliseconds anywhere else in `src/`. `src/method.test.ts` has one test per rule that pins its numbers as literals next to the talk's line.

There are two late cutoffs on purpose until a product decision is made: `LATE_CUTOFFS.welcomeFraming` (11:00, the Welcome framing and the bad-day check) and `LATE_CUTOFFS.pickWarning` (12:00, the Pick screen's line). Code asks `isLate(t, cutoff)` from `clock.ts`. A compile-time check in `method.ts` fails `tsc -b` when they become one value (delete the `@ts-expect-error` line and merge them) and when that line is removed while they still differ.

### Open product questions

- **Q1, the late cutoff.** The Welcome screen treats opening at or after 11:00 as a late start; the Pick screen shows its late line from 12:00. Both are kept as they were. Choosing one hour means deleting the `@ts-expect-error` line in `src/method.ts` and merging `LATE_CUTOFFS` into one value.

## Local-first

There is no account and no server-side copy of anything a person writes. The whole state is one JSON value in `localStorage` under the key `one-thing:v3`: the list of days (items, the chosen one, the block, the "Did you do it?" answer), the reminder time, and a small per-month archive of finished-day counts for days that have aged out of the stored window (the 120 most recent days). The service worker precaches the app shell, so it loads and works offline.

A second key, `one-thing:events`, records only which anonymous count names were already sent today, so a refresh does not count twice.

### Why the keys are still called `one-thing:*`

The project began under the working name "One Thing". The keys are part of the stored data format, and people already have days saved under them. Renaming a key would make the app look empty on their next visit, so the keys keep their original prefix. The previous format, `one-thing:v2`, is read once to migrate into v3 and is never written or deleted. Any change to the stored shape should add a new versioned key and a migration, not rename an old one.

## Time

The app depends on the device's local clock: a day is the local calendar date, and a block belongs to the day it started. The end-to-end journeys use Playwright's fake clock to move time.

## Anonymous counts

The client sends at most three events (`started`, `finished`, `opened_history`), once per browser per day, as `POST /api/event` with `{"event":"<name>"}`. Nothing is sent in development or when the browser signals Do Not Track or Global Privacy Control. The Worker allow-lists the name and writes a data point to Workers Analytics Engine containing the event name and the country code from Cloudflare's request metadata. It does not store IP addresses or user agents. See the Analytics section of the [README](../README.md).

## Deploy

`npm run build` writes `dist/`. `npx wrangler deploy` uploads `dist/` as static assets and deploys the Worker. See the README for what a fork must change.
