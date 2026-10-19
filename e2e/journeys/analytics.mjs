import { expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { BRAND, SITE_URL, t } from '../../src/copy.ts';
import { URL } from '../drive/session.mjs';
import { DONE, ABOUT, h1, SEE_DAYS, NOTE, FIRST_DAY, ritualDay, DAYS_H1, expectHistory } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';

// ---------- analytics: anonymous counts, never item text ----------
// NET records every request the app makes in a journey. `events` are the bodies sent to /api/event.
const NET = { all: [], events: [] };
export const watchNet = (mode) => async (context) => {
  NET.all = []; NET.events = [];
  context.on('request', (r) => NET.all.push({ method: r.method(), url: r.url(), body: r.postData() ?? '', headers: JSON.stringify(r.headers()) }));
  await context.route('**/api/event', async (route) => {
    if (mode === 'record') { NET.events.push(route.request().postData()); await route.fulfill({ status: 204, body: '' }); } else await route.abort('failed');
  });
  if (mode === 'blocked') await context.route(/cloudflareinsights\.com/, (route) => route.abort('blockedbyclient'));
};
const ITEMS = /raise|tax|letter|landlord|school/i;
function expectNoItemText() {
  for (const r of NET.all) if (ITEMS.test(r.url) || ITEMS.test(r.body) || ITEMS.test(r.headers)) throw new Error('item text left the device: ' + JSON.stringify(r));
  for (const b of NET.events) if (!/^\{"event":"(started|finished|opened_history)"\}$/.test(b)) throw new Error('event body is not just a name: ' + b);
}
export const noPageErrors = (s) => { const e = s.log.filter((l) => l.pageerror); if (e.length) throw new Error('page errors: ' + JSON.stringify(e)); };
// the dev-server-free default build has no token: no Cloudflare script, and the privacy line is on About
export const PRIVACY = ['privacy.device', 'privacy.tallies', 'privacy.dnt', 'privacy.host'].map(t);
async function expectPrivacyNote(p) {
  await p.getByRole('button', { name: ABOUT }).click();
  for (const line of PRIVACY) await expect(p.getByText(line, { exact: true })).toBeVisible();
  await expect(p.getByText(t('about.free'), { exact: true })).toBeVisible();
  await expect(p.getByRole('link', { name: /tip/i })).toHaveCount(0); // no donation or tip link
  await p.getByRole('button', { name: DONE }).click();
}
export const analyticsJourneys = {
  'analytics-anonymous-counts': journey({ id: 'analytics-anonymous-counts', feature: 'analytics', proves: ['an-started', 'an-finished', 'an-history', 'an-once-a-day', 'an-privacy-note', 'an-no-script'], strings: ['yourDays'] }, async (s) => { // started, finished and opened_history each go out once, as a bare name; no item text anywhere
    const p = s.page;
    await s.step('privacy-note', async () => { await expectPrivacyNote(p); });
    // no token in a local build: no third-party script. The live site is behind Cloudflare, which may inject its own beacon, so only check locally.
    if (URL.startsWith('http://127.')) await expect(p.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
    if (NET.events.length) throw new Error('an event was sent before step 0: ' + NET.events);
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); });
    await expect.poll(() => NET.events.length).toBe(3);
    const got = [...NET.events].sort().join(' ');
    if (got !== '{"event":"finished"} {"event":"opened_history"} {"event":"started"}') throw new Error('events: ' + got);
    await s.step('reload-and-reopen', async () => { // a refresh does not count twice
      await p.reload(); await p.getByRole('button', { name: ABOUT }).click(); await p.getByRole('button', { name: t('yourDays') }).click();
      await expect(h1(p)).toHaveText(DAYS_H1);
    });
    await p.waitForTimeout(300);
    if (NET.events.length !== 3) throw new Error('repeat events: ' + NET.events);
    expectNoItemText();
    const st = await p.evaluate(() => Object.keys(localStorage).sort().join(','));
    if (st !== 'one-thing:events,one-thing:v3') throw new Error('storage keys: ' + st);
    const rec = JSON.parse(await p.evaluate(() => localStorage.getItem('one-thing:events')));
    if (ITEMS.test(JSON.stringify(rec))) throw new Error('events record holds item text');
  }),
  'social-preview': journey({ id: 'social-preview', feature: 'analytics', proves: ['an-share', 'an-privacy-note'], strings: [] }, async (s) => { // the share tags are absolute, and the 1200x630 image is served as a PNG
    const p = s.page;
    const meta = async (attr, name) => p.locator(`meta[${attr}="${name}"]`).getAttribute('content');
    await s.step('tags', async () => {
      for (const [a, n, v] of [['property', 'og:type', 'website'], ['property', 'og:site_name', BRAND], ['property', 'og:title', BRAND],
        ['property', 'og:url', `${SITE_URL}/`], ['property', 'og:image', `${SITE_URL}/og-image.png`], ['name', 'twitter:card', 'summary_large_image'],
        ['name', 'twitter:title', BRAND], ['name', 'twitter:image', `${SITE_URL}/og-image.png`]]) {
        const got = await meta(a, n); if (got !== v) throw new Error(`${n}: ${got}`);
      }
      for (const [a, n] of [['property', 'og:description'], ['name', 'twitter:description']]) if (!(await meta(a, n))?.includes('pick one thing')) throw new Error(`${n} missing`);
      for (const [a, n, v] of [['property', 'og:image:type', 'image/png'], ['property', 'og:image:width', '1200'], ['property', 'og:image:height', '630']]) { const got = await meta(a, n); if (got !== v) throw new Error(`${n}: ${got}`); }
      for (const [a, n] of [['property', 'og:image:alt'], ['name', 'twitter:image:alt']]) if (!(await meta(a, n))?.includes('Pick one thing')) throw new Error(`${n} missing`);
      if ((await meta('name', 'description')) !== (await meta('property', 'og:description'))) throw new Error('og:description differs from the page description');
    });
    await s.step('image', async () => {
      const r = await p.request.get(`${URL}/og-image.png`);
      const b = await r.body();
      if (r.status() !== 200 || !/image\/png/.test(r.headers()['content-type'] ?? '')) throw new Error(`og-image: ${r.status()} ${r.headers()['content-type']}`);
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      if (w !== 1200 || h !== 630) throw new Error(`og-image is ${w}x${h}`);
      if (b.length > 1_000_000) throw new Error(`og-image is ${b.length} bytes; keep it small for crawlers`);
      // what is served is the committed image (public/og-image.png), so a stale deploy or an unregenerated image shows up here
      const want = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '../public/og-image.png'))).digest('hex');
      if (crypto.createHash('sha256').update(b).digest('hex') !== want) throw new Error('served og-image.png differs from public/og-image.png');
    });
    await s.step('about-privacy', async () => { await expectPrivacyNote(p); });
  }),
  'analytics-do-not-track': journey({ id: 'analytics-do-not-track', feature: 'analytics', proves: ['an-dnt'], strings: [] }, async (s) => { // the browser says Do Not Track: no event leaves, and nothing is remembered about it
    const p = s.page;
    if (await p.evaluate(() => navigator.doNotTrack) !== '1') throw new Error('the Do Not Track signal is not set');
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); });
    await p.waitForTimeout(300);
    if (NET.events.length || NET.all.some((r) => /api\/event/.test(r.url))) throw new Error('sent despite Do Not Track: ' + JSON.stringify(NET.events));
    if ((await s.store()).days[0].didIt !== true) throw new Error('the day did not count');
  }),
  'analytics-blocked': journey({ id: 'analytics-blocked', feature: 'analytics', proves: ['an-silent'], strings: [] }, async (s) => { // /api/event and the Cloudflare script are blocked (an ad blocker): the whole day still works
    const p = s.page;
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expectHistory(p, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] }); });
    await p.waitForTimeout(300);
    noPageErrors(s);
    expectNoItemText();
  }),
  'analytics-offline': journey({ id: 'analytics-offline', feature: 'analytics', proves: ['an-silent'], strings: [] }, async (s) => { // the network drops right after load: counts fail silently, the app is unaffected
    const p = s.page;
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => 1)); // let the service worker finish registering first; going offline mid-registration is a page error on newer Playwright
    await s.context.setOffline(true);
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expectHistory(p, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] }); });
    await p.waitForTimeout(300);
    noPageErrors(s);
    if ((await s.store()).days[0].doneText !== 'Ask for the raise') throw new Error('the day did not save offline');
  }),
};