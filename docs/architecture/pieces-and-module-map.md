[Architecture index](../architecture.md)

# Pieces

| Path | What it is |
| --- | --- |
| `src/` | The app: Vite, React 18 and TypeScript. `App.tsx` holds the screens and their side effects; `state.ts` is the screen state as one value and the pure reducer that changes it; `logic.ts` is the pure day logic (items, tags, blocks, counts); `method.ts` holds the method's rules and numbers as data; `copy.ts` holds every word the app shows; `storage.ts` reads and writes `localStorage`; `reminder.ts` schedules the optional morning notification; `analytics.ts` is the anonymous-count client; `clock.ts` reads the device clock; `events.ts` is the event list shared with the Worker; `decode.ts` turns stored JSON into typed days. Tests sit beside the code as `*.test.ts` (Vitest). |
| `worker/index.ts` | A Cloudflare Worker. Requests to `/api/*` run it first. It handles `POST /api/event`, answers 404 or 405 for anything else under `/api/`, and everything else is served from `dist/` by the assets binding. |
| `wrangler.jsonc` | Worker config: static assets from `./dist`, single-page-app fallback, `run_worker_first` only for `/api/*`, the Analytics Engine binding, and the production routes. |
| `vite.config.ts` | Vite config and `vite-plugin-pwa` (service worker, web manifest). Also adds the optional Cloudflare Web Analytics beacon at build time. |
| `e2e/` | Playwright journeys that drive a production build in headless Chromium. See [`e2e/README.md`](../../e2e/README.md). |
| `scripts/screens.mjs` | Regenerates `docs/screenshots/`. |
| `scripts/og/card.mjs` | Rebuilds the link preview card `public/og-image.png` from a live screenshot of the Pick screen (see [social-preview.md](../social-preview.md)). |

# Module map

Each platform API has one owner module in `src/`. Every other module calls the owner, so a second copy of a date key, a storage read or a permission check cannot appear.

| Owner | Owns | Others use |
| --- | --- | --- |
| `storage.ts` | `localStorage`, parsing stored JSON (through `decode.ts`) | `load`, `save`, `refresh`, `kv()` and `readSmall()` for a small key |
| `clock.ts` | `Date.now()` and `new Date()` with no argument | `now()`, `today()`, `isLate(t, cutoff)`; pass the number down |
| `reminder.ts` | `Notification`, `navigator.serviceWorker` | `askPermission`, `askPermissionIfUnasked`, `readPermission`, `notify`, `scheduleReminder` |

`logic.ts`, `state.ts`, `method.ts`, `events.ts` and `copy.ts` are pure: they take every value as an argument (the time too), `logic.ts` imports only `method.ts` and `copy.ts`, `state.ts` only `logic.ts`, and the other three import nothing (`clock.ts` imports `logic.ts` and `method.ts`, never the other way; `reminder.ts` imports `copy.ts` for the notification's words). Each owner module imports only what its entry in `OWNER_IMPORTS` lists, `.ts` modules never import React, and the Worker imports only `events.ts` from the app. The `OWNERS` table in `eslint.config.js` turns this map into lint errors that name the function to call, and `scripts/boundaries.test.mjs` checks what those rules catch. Tests are exempt, since they stub the globals.
