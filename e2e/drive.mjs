// Headless Playwright journeys for Do The Hard Thing. Own Chromium, fresh context per journey.
// Run through e2e/vdt journey <name>. Times are America/New_York local (context timezone).
// The pieces: e2e/drive/ (session, actions, registry, context) and e2e/journeys/ (the journeys, in groups merged into J below).

import { session } from './drive/session.mjs';
import { J } from './drive/registry.mjs';
import { firstVisitJourneys } from './journeys/first-visit.mjs';
import { blocksJourneys } from './journeys/blocks.mjs';
import { closeAndReturnJourneys } from './journeys/close-and-return.mjs';
import { copyAndMidnightJourneys } from './journeys/copy-and-midnight.mjs';
import { historyJourneys } from './journeys/history.mjs';
import { storageAndReminderJourneys } from './journeys/storage-and-reminder.mjs';
import { analyticsJourneys } from './journeys/analytics.mjs';
import { readinessJourneys } from './journeys/readiness.mjs';
import { reviewJourneys } from './journeys/review.mjs';
import { blindSpotJourneys } from './journeys/blind-spots.mjs';
import { gapJourneys } from './journeys/gaps.mjs';
import { CONTEXT, START } from './drive/context.mjs';

Object.assign(J, firstVisitJourneys);
Object.assign(J, blocksJourneys);
Object.assign(J, closeAndReturnJourneys);
Object.assign(J, copyAndMidnightJourneys);
Object.assign(J, historyJourneys);
Object.assign(J, storageAndReminderJourneys);
Object.assign(J, analyticsJourneys);
Object.assign(J, readinessJourneys);
Object.assign(J, reviewJourneys);
Object.assign(J, blindSpotJourneys);
Object.assign(J, gapJourneys);

const args = process.argv.slice(2);
// gap-* journeys are left out of the list, so nothing that runs the list runs them; --list-gaps lists them for e2e/gaps.mjs
if (args[0] === '--list' || !args.length) { console.log(Object.keys(J).filter((n) => !(n in gapJourneys)).join('\n')); process.exit(0); }
if (args[0] === '--list-gaps') { console.log(Object.keys(gapJourneys).join('\n')); process.exit(0); }
let failed = 0;
for (const name of args) {
  if (!J[name]) { console.log(`UNKNOWN ${name}`); failed++; continue; }
  const s = await session(name, START[name] ?? '2026-10-14T07:30:00', CONTEXT[name]);
  try { await J[name](s); await s.shot('final'); await s.done(true); console.log(`PASS ${name}  ${s.dir}`); }
  catch (e) { await s.shot('failure').catch(() => {}); await s.done(false, e); failed++; console.log(`FAIL ${name}  ${s.dir}\n  ${String(e).split('\n')[0]}`); }
}
process.exit(failed ? 1 : 0);