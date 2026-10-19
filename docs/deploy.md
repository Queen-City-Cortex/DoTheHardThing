# Deploy

The app deploys as one Cloudflare Worker with static assets, using [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
npm run build && npx wrangler deploy
```

`wrangler.jsonc` serves `./dist` as static assets, and requests to `/api/*` run the Worker (`worker/index.ts`) first; everything else is served from `./dist`.

Wrangler is not a project dependency. CI pins it with `WRANGLER_VERSION` in `.github/workflows/ci.yml`; a manual deploy uses whatever version `npx` fetches.

## Automatic deploy

Every push to `master` runs [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Its `check` job runs `npm run check` (typecheck, lint, tests, build, `check:dist`, a public hygiene check, the AGENTS.md check and `check:workflows`, which fails when the workflow loses one of the properties in this paragraph). It also runs a deploy preflight, `wrangler deploy --dry-run`, which needs no credentials. Its `journeys` job then runs the end-to-end journeys against the build: 8 of them on a pull request, all of them on `master`. When `check` and `journeys` both pass, the `deploy` job (environment `production`) builds again and runs `wrangler deploy`, then runs `npm run verify:live -- --retries 10 --post-deploy`, which only reads `https://dothehardthing.app` (GET requests, nothing is posted): the page is 200 and serves the new build's entry script, `GET /api/event` answers 405 from the Worker, `og-image.png`, `sw.js`, `manifest.webmanifest` and `robots.txt` (as `text/plain`) equal this build's, and `/` gets the headers `public/_headers` gives it. Without `--post-deploy` (a run by hand before a deploy) a manifest, robots.txt or header mismatch prints `PENDING` instead of failing. Pull requests and forks never deploy. Deploys are serialised (concurrency group `deploy-production`), the job has `contents: read` only, actions are pinned to commit SHAs, and Node comes from `.nvmrc`. Merging to `master` therefore deploys the site.

**Before the first deploy** (the preflight cannot see these; a real deploy fails without them):

- Analytics Engine is enabled on the Cloudflare account (Analytics Engine in the Cloudflare dashboard). The `EVENTS` binding in `wrangler.jsonc` fails with error 10089 otherwise.
- The two GitHub secrets below exist and the API token has the permissions below.
- Optional: a Cloudflare redirect rule that sends `www.dothehardthing.app` to the bare domain with a 301. Nothing in the repo or CI creates it; the dashboard steps and the check (`npm run verify:live -- --require-www`) are in [docs/www-redirect.md](www-redirect.md).
- The GitHub environment `production` needs no setup: GitHub creates it the first time the deploy job runs. Adding a required reviewer to it in the repository settings (Settings > Environments) would make every deploy wait for an approval.

**GitHub secrets** (repository **Settings > Secrets and variables > Actions > Repository secrets > New repository secret**):

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A custom API token with only the permissions below |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account id (dashboard > Workers & Pages overview, right sidebar) |

Nothing else is stored in the repository: `wrangler.jsonc` has no account id.

**API token** (Cloudflare dashboard > My Profile > API Tokens > Create Token > Create Custom Token). What `wrangler deploy` needs for this project:

| Resource | Permission | Why |
| --- | --- | --- |
| Account > Workers Scripts | Edit | Uploads the Worker script, its static assets and its bindings, including the `EVENTS` Analytics Engine binding (no separate permission is needed to declare a binding) |
| Zone > Workers Routes | Edit (shown as Write in some places) | Attaches the custom domains `dothehardthing.app` and `www.dothehardthing.app` (`routes` with `custom_domain: true`) |
| Zone > Zone | Read | Wrangler looks the zone up by hostname |

Scope the account resource to this account only and the zone resource to the `dothehardthing.app` zone only. Not needed: Account Analytics Read (that is only for querying the counts, not for deploying), DNS Edit (Cloudflare creates the Custom Domain records itself), and Memberships Read (the account id is given, so Wrangler does not have to discover it). Creating a brand-new Worker would need the Workers Admin role, but this Worker already exists. Analytics Engine must also be enabled on the account: see "Before the first deploy" above. If a deploy fails with a permissions error, the failing API call is in the Wrangler output; add only what it names.

**Roll back.** Either:

- Cloudflare side, fastest: `npx wrangler rollback` (pick a version; or `npx wrangler rollback <version-id>`) puts a previous Worker version, assets included, back live. Run it with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set, or in the dashboard under the Worker's **Deployments**.
- Git side: revert the bad commit on `master` (`git revert <sha>` and push or open a PR). CI redeploys the reverted tree. To redeploy an older commit by hand: check it out, then `npm ci && npm run build && npx wrangler deploy`.

A rollback done on the Cloudflare side is overwritten by the next push to `master`, so revert the commit as well.

**If you fork this**, the checked-in config is the original site's, so before deploying:

- Change `name` in `wrangler.jsonc` (it is `dothehardthing`) and replace or remove the `routes` entries for `dothehardthing.app`. Without routes the Worker is served from your own `workers.dev` address.
- Deploy to your own Cloudflare account (`npx wrangler login`).
- Update the Open Graph and Twitter URLs in `index.html` (and `public/og-image.png` if you want your own card) and the `homepage`, `repository` and `bugs` fields in `package.json`.
- Optionally set up the analytics described in [analytics.md](analytics.md), or leave it out (the app works without it).

