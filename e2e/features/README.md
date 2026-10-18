# Do The Hard Thing verification map

This directory describes how to verify the user-facing behavior of Do The Hard Thing. Read this index, then use the matching feature file. The harness is `e2e/vdt` (see `../README.md`).

## Baseline preconditions

- `vdt launch` has printed `ready` for a build of the current HEAD, and `vdt doctor` prints `OK`, with no WARN.
- Each journey starts from an empty fresh context: no localStorage and no service worker, with the clock paused at its `START` time in America/New_York.
- Drive the local `vdt` preview. The live site only through `VDT_URL=https://dothehardthing.app node e2e/drive.mjs …` (see `../README.md`), where every journey answers `/api/event` itself so no real count is added. Keep it off the `npm run dev` and `vite preview` default ports (5173 and 4173) so it never collides with your own server.

## Driving conventions

- Use only role and accessible-name locators (the `.q` Yes/No group is the one exception).
- Move time only with the Playwright clock. Use `setSystemTime` and `reload()` for "a later day".
- Build history by running a real earlier day through the UI, never by writing storage. The one documented exception is `migrate-v2`, which seeds an old `one-thing:v2` store before the first load (see [history.md](./history.md)).
- Every Close journey asserts that `a start, not a full block` and `got its block` appear nowhere.

## Proof and skip reporting

- Proof is the step screenshot and ARIA snapshot for each action, plus `localStorage.json`, in the evidence dir that the PASS line names.
- Report FAIL with the journey's `result.json` error. No journey is expected to fail, except the `gap-*` journeys: each asserts the wanted behavior of a known gap in [../known-gaps.json](../known-gaps.json), fails on purpose while the gap is open, and runs only through `node e2e/gaps.mjs` (`vdt list` leaves them out; see `../README.md`, Known gaps).
- An entry point listed here but not exercised is reported as unverified.

## Feature entry contract

Each file has an H1 and a one-paragraph description, then `Sub-features`, `How to get to it (user POV)`, `Driving it with vdt` (opening with `Preconditions:`) and `Gotchas`.

Every journey is listed exactly once, in the map its meta's `feature` names, with a "Run `vdt journey <name>`" line (any code span with `vdt journey <name>` in it counts as a listing); another map that needs it writes see `<name>` in [map.md](./map.md). Each sub-feature id is listed in one map only and is proved by some journey's meta `proves`, or its line says "not verified by vdt" (and why). A new journey: wrap it in `journey({ id, feature, proves, strings }, fn)` in `drive.mjs`, add its line here, then run `npm run check:maps`.

## Features

- [First-visit onboarding](./first-visit.md): the new-user welcome at any hour, and the Name steps (one item can answer several steps).
- [Pick and start](./pick-and-start.md): two questions, the pick list, duration, Start.
- [Block timer](./block-timer.md): countdown, End block, a step-away longer than 10 minutes, one pause per block, a block across midnight.
- [Close the day](./close-day.md): "Did you do it?" Yes / Not today whatever the block did, the gentle count, leftovers after each answer, reload persistence, start over with an inline confirmation.
- [Your days (history)](./history.md): only done days, an up-only count, the empty state, the ways in and back, v2 migration, two tabs.
- [Morning reminder](./reminder.md): an honest status line, saved only when permission is granted, Off cancels everything.
- [Anonymous analytics and sharing](./analytics.md): three bare-name counts, once a day, Do Not Track, blocked and offline, the About privacy line, and the social preview tags and `DoTheHardThing.app` image.
- [Resilience](./resilience.md): offline reload with the service worker, a 375×667 touch phone, reload mid-naming, blocked storage, no Notification API, hostile item text, long unbroken URLs at 320 to 430 wide, and WCAG AA text contrast in light and dark; also the one known gap (Close today needs a scroll at 320×568).
- [Returning user and bad days](./returning-user.md): late start, missed days, empty peek visits, midnight.
