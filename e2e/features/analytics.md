# Anonymous analytics and sharing

The app counts three things and nothing else: `started`, `finished` and `opened_history`. Each goes to the site's own `/api/event` as a bare name, at most once per browser per day, only in a production build, never when the browser sends Do Not Track, and silently dropped when offline or blocked. No item text, stored data, id or cookie is part of a send. The About page says so in four short lines. A separate Cloudflare Web Analytics beacon is not part of those counts: on the live site Cloudflare injects it at the edge for browser-like requests (the repo's own build adds one only when `VITE_CF_ANALYTICS_TOKEN` is set, and the production build sets none). The same page head carries the share tags (Open Graph and Twitter card) and `public/og-image.png`, the 1200×630 preview a link shows.

## Sub-features

- `an-started` reaching step 0 (the Name screen) sends `{"event":"started"}`. Opening About or the Welcome screen sends nothing.
- `an-finished` answering Yes on Close sends `{"event":"finished"}`. Not today sends nothing. Switching Yes, Not today, Yes in one day still sends it once.
- `an-history` opening Your days (from Close, Closed or About) sends `{"event":"opened_history"}`.
- `an-once-a-day` a reload and a second visit the same day send nothing more. The record is `one-thing:events` = `{date, sent[]}` (event names only), separate from the `one-thing:v3` store.
- `an-dnt` with the Do Not Track signal on nothing is sent and `one-thing:events` is not written. The code also treats Global Privacy Control as a stop (`doNotTrack()` in `src/analytics.ts`). The journey sets `navigator.doNotTrack` to `'1'` only and asserts no events, no request to `/api/event` and that the day still counts; it does not read `one-thing:events`, and no journey sets GPC. `src/analytics.test.ts` (`sends nothing when disabled or when Do Not Track is on`) covers the unwritten record (the in-memory store stays empty) through an injected `dnt`, but not GPC or the signal reading in `doNotTrack()`, so GPC is not verified by any test.
- `an-silent` with `/api/event` aborted, the Cloudflare script blocked, or the network offline, the day, Yes, Close and Your days all work and there is no page error.
- `an-privacy-note` About shows four lines, in this order, each its own paragraph under `#privacy`: `What you write stays on this device and is never sent anywhere.` / `We keep three anonymous tallies: days started, days finished, and history opened. Each is a plain count plus the country, with no name, number, cookie, or address attached.` / `If your browser’s Do Not Track setting is on, we keep no tallies at all.` (curly apostrophe) / `Our host, Cloudflare, counts page visits without cookies.` Checked against the code: three events only (`src/analytics.ts`, `worker/index.ts` allow-list); the Worker writes the event name and `request.cf.country` only; `doNotTrack()` also honours Global Privacy Control, which the line does not mention (it only makes the promise stronger); the Cloudflare visit count is the zone's own beacon, set up in the Cloudflare dashboard, and is not turned off by Do Not Track. Proved by `analytics-anonymous-counts`, `social-preview` and `review-copy` (listed in pick-and-start.md). Below the four lines, `Free and works offline.` Do Not Track is claimed only for the app's own counts: the Cloudflare visit beacon is not known to honor it.
- `an-no-script` the repo's own build ships no analytics script: a local build (no token) has no `script[src*="cloudflareinsights"]`, which `analytics-anonymous-counts` asserts only when the URL is `http://127.*`. The plugin in `vite.config.ts` adds the script only when `VITE_CF_ANALYTICS_TOKEN` is set at build time (`VITE_CF_ANALYTICS_TOKEN=abc npx vite build` makes `dist/index.html` carry `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "abc"}'>`; checked by hand on 2026-10-19, not by vdt, which launches a tokenless build). The deployed site is different and the repo cannot show it: a real browser load of https://dothehardthing.app has one such script with a data-cf-beacon attribute, injected by Cloudflare at the edge (a plain `curl` of the page has none), and that beacon does not honor Do Not Track or Global Privacy Control. That is why the live run skips the assertion, and why About says only that Cloudflare counts page visits without cookies.
- `an-share` `index.html` carries `og:type`, `og:site_name`, `og:title`, `og:url`, `og:image` (+ `:type` png, `:width` 1200, `:height` 630, `:alt`), `og:description` equal to the page description, and `twitter:card=summary_large_image` with title, description, image and image alt. Every URL is absolute and lowercase `https://dothehardthing.app/…`. The served `/og-image.png` is a PNG of 1200×630, under 1 MB, and byte-identical to `public/og-image.png`, so a stale deploy or an image that was not regenerated fails. The image is the OG card (title, `Name what’s uncomfortable. Pick one thing. Protect one block.`, `DoTheHardThing.app` in title case, a phone showing Pick); its text is checked by eye, not by vdt.
- `an-worker` `worker/index.ts` accepts only `POST /api/event` with an allow-listed name (204), answers 400 for any other body, 405 for other methods and 404 for other `/api/` paths, and writes `{indexes:[event], blobs:[event, country], doubles:[1]}`. Covered by vitest in `worker/index.test.ts`, not verified by vdt: no journey reaches the deployed Worker or Analytics Engine.

## How to get to it (user POV)

- Nothing to do: it runs while the app is used. The note is under `About`.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK. The journeys record every request with `NET` in `e2e/journeys/analytics.mjs` and fulfil or abort `**/api/event` in the browser context; the local preview has no `/api/event` of its own.

- **Counts, once, bare names.** Run `vdt journey analytics-anonymous-counts`. About shows the privacy note; no Cloudflare script; no event before step 0. A full Yes day, then `See your days`: exactly `started`, `finished`, `opened_history`. Reload and reopen Your days: still three. No request URL, body or header matches the item words; local storage holds only `one-thing:events` and `one-thing:v3`.
- **Share tags, image and About line.** Run `vdt journey social-preview`. Checks `an-share` above (tags, declared size, alts, image dimensions, size, byte-equality with `public/og-image.png`), then the About privacy line and `Free and works offline.`. The image is rebuilt with `node scripts/og/card.mjs` (see docs/social-preview.md); look at `public/og-image.png` after regenerating it.
- **Do Not Track.** Run `vdt journey analytics-do-not-track`. A full Yes day and Your days: zero events, and the day still counts.
- **Blocked.** Run `vdt journey analytics-blocked`. `/api/event` and `cloudflareinsights.com` aborted: full day, Your days lists it, no page error.
- **Offline.** Run `vdt journey analytics-offline`. After `navigator.serviceWorker.ready` resolves (going offline mid-registration is a page error on newer Playwright), `setOffline(true)`: full day, Your days lists it, the day is saved, no page error.
- **Proof.** `privacy-note.*`, `open-history.*`, `reload-and-reopen.*` and `localStorage.json` in each evidence dir.

## Gotchas

- Events are only sent in a production build (`import.meta.env.PROD`); `vite dev` sends nothing.
- `vite preview` has no `/api/event`: without the journeys' route a send would 404 or return the app shell, harmlessly.
- Items typed on step 0 never matter to analytics, but a regression there would show as item words in `NET.all`; keep the `ITEMS` pattern in step with the journeys' item names.
- The service worker must not serve `/api/*` as the app shell (`navigateFallbackDenylist` in `vite.config.ts`); that only matters on the deployed Worker, which vdt does not run.
