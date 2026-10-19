// Mutation table: does the whole safety net go red when a behavior breaks? Each row is a small source edit applied in a
// COPY of the repo (never in this checkout). The copy is checked by every layer, each recorded in its own column:
//   lint      eslint . and scripts/check-text.mjs (what `npm run lint` runs)
//   types     tsc -b (a compile catch; when it fails there is no build, so journeys are n/a)
//   unit      vitest run (the whole suite; scripts/mutate.test.mjs is left out of the copy, it checks this table)
//   journeys  vite build, vite preview on VDT_PORT, then the row's journeys, one `node e2e/drive.mjs <name>` each
// Result per row:
//   KILLED       at least one layer failed (good: something guards the behavior); the result names the layers
//   SURVIVED     every layer passed with the behavior broken: a blind spot, or the row is wrong
//   NOT-APPLIED  a find string does not occur exactly once in its file (the table has rotted: fix the row)
// Before the rows the pristine copy must pass lint, types and unit; after them, every journey that failed in some row runs
// once more on the pristine build, and a journey that fails there too does not count as a catch.
// Usage: VDT_PORT=<free port above 4400> node scripts/mutate.mjs [ids...] [--fast] [--layers lint,types,unit,journeys]
//   --fast    stop each row at the first layer that catches it (in the order above)
//   --check   check the table against this tree (find strings, journey names, ids) and exit; runs nothing
// MUT_DIR (default $TMPDIR/mutate-<port>) is the copy, MUT_OUT (default $TMPDIR/mutate-<port>-results.json) the JSON, journey
// evidence goes to $TMPDIR/mutate-<port>-evidence (<port> is VDT_PORT, or this process id without the journeys layer), so two
// runs on different ports never clobber each other. Exit 1 when a row SURVIVED or was NOT-APPLIED.
// Each layer that fails says what caught the row (`by` in the JSON, after FAIL in the table): eslint rule ids and the first
// check-text line, the files tsc reports, the failing vitest test files, the failing journeys.
// The preview and every child (each layer, each journey) run in their own process group, killed on exit, SIGINT and
// SIGTERM, so an interrupted run leaves no server on VDT_PORT and no Chromium behind. Before the first journey of a build
// the served /index.html must equal the copy's dist/index.html, or the run stops: another server answers on the port.
// The quote-cut row is killed only with FERRISS_TRANSCRIPT set (the transcript is not in the repo); without it that row SURVIVES.
// Local only: run it by hand or from a scheduled job of your own; the repo has no scheduled workflow. About 15 to 30 minutes
// (36 rows took 27 minutes on a shared machine), NOT part of npm run check or the PR CI job.

import { pathToFileURL } from 'node:url';
import { MUTATIONS } from './mutate/table.mjs';
import { journeyNames, checkTable } from './mutate/check-table.mjs';
import { main } from './mutate/run.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
export { MUTATIONS };
export { checkTable, journeyNames };
