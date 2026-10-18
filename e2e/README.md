# End-to-end journeys (Playwright)

The app is a single-screen offline-first PWA (Vite + React + TS, vite-plugin-pwa). No accounts and no server-side state; the only backend is the one-endpoint Worker for anonymous counts, which the journeys stub. All app state is one localStorage key, `one-thing:v3`. (`one-thing:events` holds only which anonymous count names went out today; see `features/analytics.md`.) The screen depends on that state and on the **local clock**, so every journey runs in a fresh browser context (empty storage, no service worker yet) with timezone `America/New_York` and a Playwright fake clock paused at a fixed local time.

The harness is `e2e/vdt` (bash) plus `e2e/drive.mjs` (Playwright journeys). It uses the repo's own devDependencies `playwright` and `@playwright/test` 1.64.1 and their own Chromium (`npx playwright install chromium`). Run every command from the repo root.

## Launch

```bash
export VDT_PORT=$((4400 + RANDOM % 500))   # any free port above 4400 of your own, the same for every command
e2e/vdt launch
```

This runs `npm ci` if needed, installs Chromium, runs `npm run build` (tsc and vite build, which generates `dist/sw.js`), then starts `vite preview` on `127.0.0.1:$VDT_PORT` (default **4317**, `--strictPort`). It writes the PID to `$TMPDIR/vdt-$PORT.pid` and the log to `$TMPDIR/vdt-$PORT.log` (`/tmp` when `TMPDIR` is unset). **Ready** = it prints `ready http://127.0.0.1:4317 (pid N)`. That happens after `/` serves `<div id="root">`. The launch refuses to run if the port is already busy. Port 4173 is `vite preview`'s default, so the harness avoids it. `launch` and `cleanup` refuse to run (exit 2) when `VDT_PORT` is unset: the default 4317 is shared by every agent on the machine, and a cleanup on it would stop someone else's server. `doctor`, `journey` and `list` still default to 4317, so set the same `VDT_PORT` for every command.

Relaunch after any source change. The preview serves `dist/`, not `src/`.

## Doctor

```bash
e2e/vdt doctor
```

This is read-only. It checks that the vdt PID is alive, that the URL serves the app shell, and that `sw.js` exists (a production build). It prints the commit and the number of dirty `src` files, and prints `WARN` if `dist` is older than HEAD. Run it first whenever anything looks off.

## Drive

```bash
S=e2e
$S/vdt list                                  # journey names
$S/vdt journey first-visit start-end-block   # one or more; exit 0 only if all PASS
$S/vdt journey $($S/vdt list)                # everything
```

In parallel: `node e2e/run.mjs` runs each journey in its own `drive.mjs` child, slowest first, with `--workers N` (default half the CPUs). `npm run journeys` adds `--serve`: it serves the existing `dist/` on `VDT_PORT` itself (refusing a `dist/` older than the sources: run `npm run build` first) and stops it afterwards. `npm run journeys:fast` runs only `FAST` in `e2e/run.mjs`, the 8 journeys CI runs on pull requests; `npm run journeys -- <names>` runs the ones named. A journey that runs longer than `VDT_JOURNEY_TIMEOUT_MS` (default 120000) is killed and fails with `timeout`. SIGINT and SIGTERM stop the preview and every child.

Each journey uses a fresh `chromium.launch()` and `newContext()` (390×844, en-US, America/New_York). It then runs `page.clock.install` and `pauseAt(<start>)` before `goto`. Time moves only through `clock.runFor` (timers fire, as in the block countdown), `clock.fastForward` (a jump, as in a long step-away) or `clock.setSystemTime` followed by `reload()` (a new day). Start times are in `START` in `e2e/drive.mjs` (the default is 07:30 on 2026-10-14; the late hour is 11:00 local).

Stable handles from `src/App.tsx`:
- Buttons by role and name: `I'm ready`, `Add`, `Next`, `Skip`, `Two questions`, `Pick one`, `Start the block`, `Step away briefly`, `I'm back`, `End block`, `Yes` / `Not today` (Close, after any block; use `exact: true` for `Yes`), `Close today`, `See your days`, `Start today over`, `Yes, start over`, `Keep today`, `About`, `Your days` (the About row), `Done` (header on About and Your days), `Back`.
- Headings by level-1 text.
- The Name input is the only `textbox`, and its aria-label equals the question. On step 1 the list is `listitem`s with `Remove <item>` buttons; on steps 2 and 3 it is the group `Already on your list` of toggle buttons (`aria-pressed` when the item has this step's tag). Use `row(p, text)` for either.
- Each Yes/No pair sits in a `.q` block (first = satisfied, second = leverage). This is the one CSS handle, because the buttons have no group label.
- The block countdown is `role=timer`. Duration buttons are `role=radio`, named `2h`, `2½h` and `3h` (`1h`, `1½h`, `2h` with the bad-day shorter-block checkbox).
- Close is the same after any block: `Did you do it?`, `“<item>”, your one thing today.`, Yes / Not today with nothing chosen, `Close today` disabled until an answer. The answer stores `didIt` (and `doneText` on Yes); the note and count line come from `closeLines`. The old verdicts `a start, not a full block` and `got its block` must never appear. Helpers in `e2e/drive.mjs`: `expectClose`, `answer`, `closeToday`, `noVerdict`, `ritualDay` (one whole day), `expectHistory`, `nextMorningLeftover`.
- Step 1 leftovers are toggle buttons with `aria-pressed`, none pressed at first. Your days lists are `list`s named by the month (`October`) and `Earlier`.
- The progress dots have the aria-label `Step N of 3`.
- About: the `Reminder time` input (by label), the `Off` button, the reminder status line (`role=status`), and the privacy line (see `features/analytics.md`, `an-privacy-note`). The analytics journeys (`analytics-*`) record requests in `NET` and route `**/api/event` themselves.

Per-journey context options (for example notification `permissions`, the `migrate-v2` `seed`, a `viewport` with `mobile: true` for touch emulation, or a `before(context)` hook for init scripts and network rules) go in `CONTEXT` in `e2e/drive.mjs`. The default is no grants and no seed. The clock belongs to the context, so a second tab (`s.context.newPage()`, as in `two-tabs`) shares it; set `s.page` to the tab being driven and the evidence follows it.

To add a journey, add an entry to `J` (and `START` if it needs a different start time) in `e2e/drive.mjs`, wrapped as `'name': journey({ id: 'name', feature, proves, strings }, async (s) => { ... })` (see the comment above `J`), and list it with a "Run `vdt journey name`" line in the one map its `feature` names. Reuse `throughToPick` and `startBlock`, and wrap each user action in `s.step(label, fn)` so it leaves evidence.

### Running against the live site, and long runs

`vdt journey` always points at the local preview (it exports `VDT_URL` itself). To drive the deployed site run the script directly: `VDT_URL=https://dothehardthing.app VDT_RUN_ID=live node $S/drive.mjs $(node $S/drive.mjs --list)`. Whenever the URL is not `http://127.*`, every journey answers `**/api/event` locally, so a live run never adds to the real analytics counts. The full suite takes about 10 to 15 minutes: start it detached (`nohup … &`, log to a file) so closing your terminal does not kill the preview server or the run, and poll the log. Allow a retry after about 30 s right after a deploy (propagation).

### CSP watch

`e2e/csp-watch.mjs` is a preload that records every Content-Security-Policy violation in every page of every journey, without editing `drive.mjs`. It wraps `chromium.launch`: each new context gets an init script that turns the page's `securitypolicyviolation` events into console lines, and the preload appends to the file named by `CSP_LOG` one `context <url>` line per page load, one `violation <directive> <blocked URL> <page>` line per event, and one `console ...` line per browser console message about CSP (usually the same violation again). Any line that is not a `context` line is a violation; context lines with nothing else mean the watcher saw the pages and none violated the policy. It needs a server that sends the `_headers` policy: `vite preview` sends none, so run it against `wrangler dev`, from a copy, so nothing is written into your checkout (no credentials needed; the local server's newest compatibility date may be older than `wrangler.jsonc`'s, so pass one it supports):

```bash
npm run build
W=$(mktemp -d); mkdir -p $W/src; cp -r wrangler.jsonc worker dist $W/; cp src/events.ts $W/src/
(cd $W && npx --yes wrangler@4.86.0 dev --local --ip 127.0.0.1 --port <port> --inspector-port <another port> --compatibility-date 2026-05-03) &
CSP_LOG=/tmp/csp.log NODE_OPTIONS="--import=$PWD/e2e/csp-watch.mjs" VDT_URL=http://127.0.0.1:<port> TZ=UTC node e2e/run.mjs --workers 2
grep -vc '^context' /tmp/csp.log   # the violation count: want 0, with context lines present
```

`NODE_OPTIONS` is what reaches the `drive.mjs` children `run.mjs` spawns; `node --import ./e2e/csp-watch.mjs e2e/run.mjs` would load it only in the runner. One journey: `... node --import ./e2e/csp-watch.mjs e2e/drive.mjs first-visit`. The preload refuses to start without `CSP_LOG`. A positive control: in the copy, change a directive in `dist/_headers` to `'none'` (for example `font-src 'none'; style-src 'none'`), restart wrangler and run `first-visit`: the log gets violation lines, while the journey still passes (Report-Only blocks nothing). Stop wrangler afterwards (and its `workerd` children).

## Known gaps

`e2e/known-gaps.json` lists the gaps that wait on a decision by the owner, each with a `gap-*` journey in `drive.mjs` that asserts the behavior we want, so the journey fails while the gap is open. It is for owner-blocked gaps only: a bug gets fixed, not registered. `vdt list` (and so `node e2e/run.mjs`, `npm run journeys` and CI) leaves the `gap-*` journeys out; `node e2e/drive.mjs --list-gaps` lists them, and `vdt journey gap-<name>` still runs one by name.

Each entry has `id`, `journey`, `why` (what is wrong today and where), `owner`, `expires` (YYYY-MM-DD), `fixed_by` (what a fix is) and `fails_with` (the start of the journey's own error, `gap open (N of M): ...`, with its count: N wanted behaviors still missing of the M the journey checks, then words the journey writes; never a Playwright locator rendering). `node e2e/gaps.mjs` runs each entry's journey and inverts it:
- `XFAIL`: it failed with its own `gap open (N of M): ...` error and that contains `fails_with`, so the gap is open as registered (the only outcome that passes);
- `STALE`: it passed, so the gap is fixed: delete the entry and move the journey into the suite (renamed, without `gap-`);
- `WRONG`: it failed for another reason (including another count), timed out, or died before writing `result.json`;
- `EXPIRED`: today is past `expires` (it is not run): fix it, or decide again and move the date with a reason.

A gap that is half fixed (one of its two wanted behaviors now holds) reads `WRONG`, not `XFAIL`: the journey says `gap open (1 of 2)` where the entry says `(2 of 2)`, and the line adds that the gap moved. If that part was fixed on purpose, the maintainer updates the entry: the new count in `fails_with` (and the words of a part still open), and `why` for what is still wrong. `scripts/gaps.test.mjs` checks that each real `fails_with` names words its journey writes and that M is its number of `gap.want` calls.

A malformed entry, an entry whose journey is missing and a `gap-*` journey with no entry also fail the run. Run it with `npm run gaps` (serves the existing `dist/` on `VDT_PORT` itself, like `npm run journeys`), or `node e2e/gaps.mjs [ids…]` against a running preview (`VDT_URL`, or `VDT_PORT` after `vdt launch`). `GAPS_TODAY=YYYY-MM-DD` sets the date (anything else is refused), `GAPS_FILE` another registry; `scripts/gaps.test.mjs` covers every outcome with a fake drive script (`GAPS_DRIVE`), no browser. Local only: run it by hand or from a scheduled job of your own; the repo has no scheduled workflow, so an `EXPIRED` entry is seen only when someone runs it.

## Mutation check

`scripts/mutate.mjs` asks whether the safety net goes red when a behavior breaks. Each row of its table is a small edit to `src/` (the 2h default, a late cutoff, Back on Ask, the brand in `src/copy.ts`, a reducer step, ...), applied in a copy under `$TMPDIR/mutate-<port>` (`MUT_DIR`; `<port>` is `VDT_PORT`, or the process id without the journeys layer), never in your checkout. Each row goes through four layers, in their own columns: lint (`eslint .` and `scripts/check-text.mjs`), types (`tsc -b`), unit (`vitest run`) and journeys (the copy is built, served on `VDT_PORT` and the row's journeys run one process each). A row is `KILLED` when any layer fails (the result names which, and each failed column says what caught it: eslint rule ids or the check-text line, the files tsc reports, the failing test files, the failing journeys), `SURVIVED` when all pass (a blind spot to close, or a wrong row), `NOT-APPLIED` when a find string no longer occurs exactly once. The unmutated copy must pass lint, types and unit first, and a journey that also fails on the unmutated build is not counted as a catch. `VDT_PORT` must be a free port above 4400; the preview and every child run in their own process group and are killed on exit, Ctrl-C and SIGTERM, and before each build's first journey the served `/index.html` must equal the copy's `dist/index.html`, or the run stops (another server answers on the port).

```bash
VDT_PORT=<your port> npm run mutate                           # every row, every layer: 15 to 30 minutes, run it detached
VDT_PORT=<your port> node scripts/mutate.mjs ask-no-back --fast # one row, stop at the first layer that catches it
node scripts/mutate.mjs --layers lint,types,unit                # no browser, no port needed
node scripts/mutate.mjs --check                                 # only check the table against this tree
```

The `quote-cut` row (a talk quote loses a word) is caught only by the transcript check, so set `FERRISS_TRANSCRIPT` to the talk transcript when you run it, or that one row reads SURVIVED (the transcript is not in the repo). So every row reads KILLED only with `FERRISS_TRANSCRIPT` set. It writes `$MUT_OUT` (default `$TMPDIR/mutate-<port>-results.json`; journey evidence goes to `$TMPDIR/mutate-<port>-evidence`), so two runs on different ports never clobber each other, prints a markdown table and `killed N, survived M, not-applied K`, and exits 1 when a row survived or did not apply. Local only: run it by hand or from a scheduled job of your own; the repo has no scheduled workflow, and it is not part of `npm run check` or CI. `scripts/mutate.test.mjs` (in `npm test`) keeps the table from rotting: every find string occurs once, every journey it names exists, ids are unique, and a row with no journey says which layer alone can see it. When a journey changes, run the rows that name it.

`npm run vacuous` (`scripts/vacuous.mjs`) greps `drive.mjs` for assertions that cannot fail (a swallowed click, a click only if the button exists, `toHaveText(/./)`, absent text no source has). It is a lower bound, not an inventory.

## Evidence

Every run writes to `$VDT_EVIDENCE/<run-id>/<journey>/`. The default root is `do-the-hard-thing-e2e/` under your temp directory (`$TMPDIR`, or `/tmp`), outside the repo and kept by cleanup. Override it with `VDT_EVIDENCE` and `VDT_RUN_ID`. Each folder holds:
- `NN-<step>.png` (full page) and `NN-<step>.aria.txt` (ARIA snapshot) after every action, plus `failure.*` on failure
- `localStorage.json`: the stored `one-thing:v3` at the end, the side-effect proof
- `result.json`: pass/fail, error, the action log with the faked local time at each step, and any `pageerror`

Proof standards:
- Drive the real UI only. Never seed `localStorage` or call app functions. Returning-user states are built by running an earlier day through the UI, then `setSystemTime` and `reload`. The one documented exception is `migrate-v2`: an old `one-thing:v2` store cannot be made through today's UI, so an init script writes it before the first load.
- Assert the visible state and the stored state (for example `start-end-block` checks `endReason: "stopped"` in storage).
- A PASS line names its evidence dir. Quote that dir, not just the word PASS.
- `midnight-rollover`, `block-across-midnight` and `block-reload-after-midnight` cover the date rollover (a block belongs to the day it started). A FAIL there is a regression. Do not weaken their assertions.

## Cleanup

```bash
e2e/vdt cleanup   # with the VDT_PORT you launched on
```

This kills only the process group in `$TMPDIR/vdt-$PORT.pid` (never by name) and deletes the pid file. Browsers close at the end of each journey. Evidence and `dist/` are left alone. Run cleanup after failed iterations too.

## Helpers

- `e2e/vdt {launch|doctor|journey <names…>|list|cleanup}`: executable bash, with the env vars `VDT_PORT` (required for `launch` and `cleanup`), `VDT_EVIDENCE` and `VDT_RUN_ID`.
- `e2e/run.mjs`: the parallel runner behind `npm run journeys`, `journeys:fast` and `check:full`.
- `e2e/drive.mjs`: the journeys, run by `vdt journey`. Run it with `node` directly only if `VDT_URL` is set.
- `e2e/gaps.mjs`: the known-gaps runner behind `npm run gaps` (see Known gaps above); `e2e/known-gaps.json` is its registry.

Feature recipes and what each proves: [features/README.md](features/README.md). `npm run check:maps` (part of `npm run check:fast`) fails when the maps and the journeys' meta disagree, and says how to fix it.
