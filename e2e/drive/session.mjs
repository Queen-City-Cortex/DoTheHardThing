// The journey session: URL, run id and evidence dir from the environment, and session(), which gives one journey its own
// Chromium, a fresh context, its own fake clock and its own evidence. drive.mjs imports this file first: it pins TZ.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Journey times are America/New_York wall-clock strings (see the context timezone below). `new Date('2026-10-14T23:30:00')` reads them
// in the host timezone, so pin it: on a UTC runner the midnight journeys otherwise start at 19:30 and never cross midnight.
process.env.TZ = 'America/New_York';

export const URL = process.env.VDT_URL ?? 'http://127.0.0.1:4317';
const RUN = process.env.VDT_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const ROOT = path.join(process.env.VDT_EVIDENCE ?? path.join(os.tmpdir(), 'do-the-hard-thing-e2e'), RUN);
const KEY = 'one-thing:v3';

// `seed` ({ key, value }) writes one localStorage key before the app's first load. Only `migrate-v2` uses it (see e2e/README.md).
export async function session(name, startLocal, { permissions = [], channel, seed, before, viewport, mobile } = {}) {
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const context = await browser.newContext({ timezoneId: 'America/New_York', viewport: viewport ?? { width: 390, height: 844 }, locale: 'en-US', permissions, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  if (seed) await context.addInitScript(({ key, value }) => { if (localStorage.getItem(key) == null) localStorage.setItem(key, value); }, seed);
  // against the live site no journey may add to the real counts: /api/event is answered locally (a journey's own route, added next, wins)
  if (!URL.startsWith('http://127.')) await context.route('**/api/event', (route) => route.fulfill({ status: 204, body: '' }));
  if (before) await before(context); // network rules and init scripts that must exist before the first load
  const page = await context.newPage();
  const log = []; let n = 0;
  context.on('page', (pg) => pg.on('pageerror', (e) => log.push({ pageerror: String(e) })));
  page.on('pageerror', (e) => log.push({ pageerror: String(e) }));
  await page.clock.install({ time: new Date(startLocal) }); // the clock belongs to the context: a second tab shares it
  await page.clock.pauseAt(new Date(startLocal)); // time moves only via runFor/fastForward/setSystemTime
  await page.goto(URL);
  // `s.page` is the tab being driven; a journey with two tabs swaps it, and evidence follows it
  const s = { page, context, dir, log };
  s.shot = async (label) => {
    const f = `${String(++n).padStart(2, '0')}-${label}`;
    await s.page.screenshot({ path: path.join(dir, f + '.png'), fullPage: true });
    fs.writeFileSync(path.join(dir, f + '.aria.txt'), await s.page.locator('body').ariaSnapshot());
    log.push({ step: f, at: await s.page.evaluate(() => new Date().toString()) });
  };
  s.step = async (label, fn) => { log.push({ action: label }); await fn(); await s.shot(label); };
  s.store = async (k = KEY) => s.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
  s.done = async (ok, err) => {
    fs.writeFileSync(path.join(dir, 'localStorage.json'), JSON.stringify(await s.store().catch(() => null), null, 2));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ journey: name, url: URL, ok, error: err ? String(err) : null, log }, null, 2));
    await browser.close();
  };
  return s;
}