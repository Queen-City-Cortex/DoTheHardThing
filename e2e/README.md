# End-to-end journeys (Playwright)

The app is a single-screen offline-first PWA (Vite + React + TS, vite-plugin-pwa). No accounts and no server-side state; the only backend is the one-endpoint Worker for anonymous counts, which the journeys stub. All app state is one localStorage key, `one-thing:v3`. (`one-thing:events` holds only which anonymous count names went out today; see `features/analytics.md`.) The screen depends on that state and on the **local clock**, so every journey runs in a fresh browser context (empty storage, no service worker yet) with timezone `America/New_York` and a Playwright fake clock paused at a fixed local time.

The harness is `e2e/vdt` (bash) plus `e2e/drive.mjs` (Playwright journeys). It uses the repo's own devDependencies `playwright` and `@playwright/test` 1.64.1 and their own Chromium (`npx playwright install chromium`). Run every command from the repo root.

## Launch

```bash
e2e/vdt launch
```

This runs `npm ci` if needed, installs Chromium, runs `npm run build` (tsc and vite build, which generates `dist/sw.js`), then starts `vite preview` on `127.0.0.1:$VDT_PORT` (default **4317**, `--strictPort`). It writes the PID to `$TMPDIR/vdt-$PORT.pid` and the log to `$TMPDIR/vdt-$PORT.log` (`/tmp` when `TMPDIR` is unset). **Ready** = it prints `ready http://127.0.0.1:4317 (pid N)`. That happens after `/` serves `<div id="root">`. The launch refuses to run if the port is already busy. Port 4173 is `vite preview`'s default, so the harness avoids it. Use another port with `VDT_PORT=4400 vdt launch` (set the same `VDT_PORT` for every later command).

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

To add a journey, add an entry to `J` (and `START` if it needs a different start time) in `e2e/drive.mjs`. Reuse `throughToPick` and `startBlock`, and wrap each user action in `s.step(label, fn)` so it leaves evidence.

### Running against the live site, and long runs

`vdt journey` always points at the local preview (it exports `VDT_URL` itself). To drive the deployed site run the script directly: `VDT_URL=https://dothehardthing.app VDT_RUN_ID=live node $S/drive.mjs $(node $S/drive.mjs --list)`. Whenever the URL is not `http://127.*`, every journey answers `**/api/event` locally, so a live run never adds to the real analytics counts. The full suite takes about 10 to 15 minutes: start it detached (`nohup … &`, log to a file) so closing your terminal does not kill the preview server or the run, and poll the log. Allow a retry after about 30 s right after a deploy (propagation).

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
e2e/vdt cleanup
```

This kills only the process group in `$TMPDIR/vdt-$PORT.pid` (never by name) and deletes the pid file. Browsers close at the end of each journey. Evidence and `dist/` are left alone. Run cleanup after failed iterations too.

## Helpers

- `e2e/vdt {launch|doctor|journey <names…>|list|cleanup}`: executable bash, with the env vars `VDT_PORT`, `VDT_EVIDENCE` and `VDT_RUN_ID`.
- `e2e/drive.mjs`: the journeys, run by `vdt journey`. Run it with `node` directly only if `VDT_URL` is set.

Feature recipes and what each proves: [features/README.md](features/README.md). Keep the map in sync when journeys change.
