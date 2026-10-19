# Hosting surface

What the deployed site sends and serves around the app: security headers, cache rules, `robots.txt` and the `www` redirect. vdt drives the app in a browser and does not check any of this. It is covered by two scripts that are not journeys: `npm run check:dist` (the build against its own config) and `npm run verify:live` (the deployed site, GET only, no `/api/event` post, so it adds nothing to the counts).

## Sub-features

- `ho-headers` every path class the app serves gets the five security headers in `public/_headers`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and `Content-Security-Policy-Report-Only` (the policy is Report-Only on purpose; enforcing it is an owner decision). Checked outside vdt, not verified by vdt: `npm run check:dist` compares `dist/_headers` with the policy in `scripts/headers-policy.mjs`, and `npm run verify:live` compares what `/` really sends. The preview server `vdt launch` starts sends none of them, so no journey sees a header. `e2e/csp-watch.mjs` (see `../README.md`, CSP watch) is the one way to run journeys against the real headers, through `wrangler dev`.
- `ho-cache` `/`, `/index.html`, `/sw.js`, `/registerSW.js` and `/manifest.webmanifest` are no-cache; `/assets/*` is `public, max-age=31536000, immutable`. Checked outside vdt, not verified by vdt: `check:dist` fails when the app shell or `sw.js` is not no-cache; `verify:live` checks the headers on `/`.
- `ho-robots` `/robots.txt` is `User-agent: *` and `Allow: /`, served as `text/plain`. Checked outside vdt, not verified by vdt: `check:dist` and `verify:live` (byte-equal to `dist/robots.txt`).
- `ho-www` `www.dothehardthing.app` should answer 301 to the bare domain with the path and query kept (`docs/www-redirect.md`). It is a Cloudflare zone rule that nothing in the repo creates. Checked outside vdt, not verified by vdt: `npm run verify:live -- --www` reads it, and on 2026-10-19 it printed `PENDING www redirect: not created yet` (www answered 200 for `/?x=1`).
- `ho-worker-routes` `GET /api/event` answers 405 from the Worker, not the app shell. Checked by `verify:live`, not verified by vdt (the preview has no Worker). The Worker's own rules are `an-worker` in [analytics.md](./analytics.md).

## How to get to it (user POV)

- Nothing to open: these are what the browser receives on every visit.

## Driving it with vdt

Preconditions:

- No vdt command here. Run `npm run build` then `npm run check:dist`, and `npm run verify:live` (add `--www` to read the redirect). vdt can only reach it indirectly: `VDT_URL=https://dothehardthing.app node e2e/drive.mjs <journeys>` runs the app journeys against the deployed site, and `e2e/csp-watch.mjs` records CSP violations.

## Gotchas

- `verify:live` entry-script and header checks compare against the local `dist/`; a header-only change leaves the entry script the same, so `--post-deploy` makes those comparisons strict.
- Left out on purpose and reported as INFO: `Strict-Transport-Security` (the `.app` TLD is HSTS-preloaded) and an enforcing CSP.
- The edge adds a Cloudflare Web Analytics beacon to browser-like page loads; it is not in `dist/` (see `an-no-script` in [analytics.md](./analytics.md)).
