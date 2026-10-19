// Per-journey browser context options (CONTEXT) and start times (START), read by drive.mjs when it opens a session.

import { watchNet } from '../journeys/analytics.mjs';


// the default headless shell reports Notification.permission 'denied' even when granted; full Chromium (new headless) honors the grant
// migrate-v2 is the only journey that seeds storage: a v2 store as the app wrote it before "Did you do it?" (single `tag`, gotBlock only)
const v2Day = (date, id, text, gotBlock) => ({ date, openedAt: new Date(`${date}T07:30:00`).getTime(), closed: true, chosenId: id, block: null, gotBlock,
  items: [{ id, text, tag: 'risky', satisfied: true, leverage: true, pushedCount: 0 }] });
export const V2_SEED = JSON.stringify({ reminder: null, days: [v2Day('2026-10-12', 'a', 'Ask for the raise', true), v2Day('2026-10-13', 'b', 'Call the landlord', false)] });
const dnt = (mode) => async (context) => { await context.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' })); await watchNet(mode)(context); };
const initOnly = (fn) => async (context) => { await context.addInitScript(fn); };
export const CONTEXT = { 'storage-blocked': { before: initOnly(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError'); }; }) },
  'no-notification-api': { before: initOnly(() => { delete window.Notification; }) },
  'small-phone-layout': { viewport: { width: 375, height: 667 }, mobile: true },
  'long-url-widths': { viewport: { width: 320, height: 760 }, mobile: true },
  'welcome-v1': { viewport: { width: 390, height: 844 }, mobile: true },
  'analytics-anonymous-counts': { before: watchNet('record') }, 'analytics-do-not-track': { before: dnt('record') },
  'analytics-blocked': { before: watchNet('blocked') }, 'analytics-offline': { before: watchNet('record') },
  'reminder-honest-granted': { permissions: ['notifications'], channel: 'chromium' }, 'migrate-v2': { seed: { key: 'one-thing:v2', value: V2_SEED } } };
export const START = { 'first-visit': '2026-10-14T08:00:00', 'first-visit-late': '2026-10-14T18:57:00', 'peek-then-return': '2026-10-14T20:00:00',
  'missed-days': '2026-10-12T08:00:00', 'midnight-rollover': '2026-10-14T23:30:00', 'block-across-midnight': '2026-10-14T23:30:00',
  'block-reload-after-midnight': '2026-10-14T23:30:00' };
