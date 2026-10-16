---
name: verify-do-the-hard-thing
description: Verify Do The Hard Thing in a headless browser with the repo's end-to-end journeys (e2e/). Use to prove onboarding, pick and start, the block timer, closing the day, your days, the reminder or a returning or bad day before or after a change.
---

# Verify Do The Hard Thing

The harness lives in [`e2e/`](../../../e2e/README.md); read that file for the commands, the stable handles and the proof standards. This note only says how to use it here.

- Run from the repo root with a port of your own, the same for every command: `export VDT_PORT=4400`, then `e2e/vdt launch`, `e2e/vdt journey <names>` (or `e2e/vdt journey $(e2e/vdt list)` for all), then `e2e/vdt cleanup`. `launch` and `cleanup` refuse to run without `VDT_PORT`: the default 4317 is shared by every agent on the machine. Port 4173 is `vite preview`'s default, so leave it alone.
- Faster, in parallel: `npm run build`, then `VDT_PORT=4400 npm run journeys` (or `journeys:fast`, or `npm run journeys -- <names>`). It serves `dist/` itself and stops it afterwards.
- Journeys drive the real UI in a fresh browser context with a fake clock. Never seed `localStorage` or call app functions.
- Evidence (screenshots, ARIA snapshots, stored state) goes to `$VDT_EVIDENCE` (default under your temp directory), outside the repo.
- Live site: `VDT_URL=https://dothehardthing.app node e2e/drive.mjs <journeys>`. `/api/event` is stubbed whenever the URL is not `http://127.*`, so a live run never adds to the real counts. Retry once after about 30 s right after a deploy.
- The full suite takes ten minutes or more one by one (a few minutes with `npm run journeys`): start it detached and poll its log.
- Keep [`e2e/features/`](../../../e2e/features/README.md) in sync when journeys change.
