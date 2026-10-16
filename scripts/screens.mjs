// Regenerates docs/screenshots/*.png from a running production build (npm run build && npx vite preview --port 4173).
// Env: SCREENS_URL (default http://127.0.0.1:4173/), CHROMIUM_PATH (optional; default is Playwright's own full Chromium, so notification permission reads as granted).
import fs from 'node:fs';
import { chromium } from 'playwright';
const URL = process.env.SCREENS_URL ?? 'http://127.0.0.1:4173/';
const OUT = 'docs/screenshots/';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' });
const T = (h, m = 0, d = 15) => new Date(2026, 9, d, h, m).getTime();
const mk = (id, text, tag, pc) => ({ id, text, tags: [tag], satisfied: true, leverage: false, pushedCount: pc });
const seed = (lastDate) => ({ reminder: '06:30', archive: {}, days: [{ date: lastDate, openedAt: 0, chosenId: 'x', block: null, gotBlock: false, didIt: false, doneText: null, closed: true,
  items: [mk('x', 'Book the dentist appointment', 'risky', 1), mk('y', 'Call the insurance company', 'pushed', 2), mk('z', 'Clean out the garage', 'anxious', 0)] }] });
async function ctx(scheme, data, time) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['notifications'], colorScheme: scheme });
  const p = await c.newPage();
  await p.clock.setFixedTime(time);
  await p.addInitScript((d) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('one-thing:v3', JSON.stringify(d)); } }, data);
  await p.goto(URL);
  return { c, p };
}
const S = (p, n) => p.screenshot({ path: OUT + n + '.png' });
{ const { c, p } = await ctx('light', seed('2026-10-14'), T(6, 40));
  await S(p, '01-before-screens');
  await p.getByText("I'm ready").click();
  await p.getByText('Call the insurance company').click();
  await p.getByText('Book the dentist appointment').click();
  await S(p, '02-name-pushed');
  await p.getByRole('button', { name: 'Next' }).click();
  await p.locator('.adder input').fill('Ask my manager for a deadline extension'); await p.getByRole('button', { name: 'Add' }).click();
  await S(p, '03-name-risky');
  await p.getByRole('button', { name: 'Next' }).click();
  await p.locator('.adder input').fill('Clean out the garage'); await p.getByRole('button', { name: 'Add' }).click();
  await S(p, '04-name-anxious');
  await p.getByText('Two questions').click();
  const ans = [[1, 0], [0, 1], [1, 1], [0, 0]];
  for (let i = 0; i < ans.length; i++) {
    const y = p.getByRole('button', { name: 'Yes', exact: true }), n = p.getByRole('button', { name: 'No', exact: true });
    await (ans[i][0] ? y.nth(0) : n.nth(0)).click(); await (ans[i][1] ? y.nth(1) : n.nth(1)).click();
    if (i === 0) await S(p, '05-two-questions');
    await p.getByRole('button', { name: i === ans.length - 1 ? 'Pick one' : 'Next', exact: true }).click();
  }
  await p.locator('.choice').first().click();
  await S(p, '06-pick-one');
  await p.getByText('Start the block').click();
  await p.clock.setFixedTime(T(7, 25));
  await p.reload(); await p.waitForTimeout(800);
  await p.getByText('Gently come back to your one to-do').click();
  await S(p, '07-block-after-reload');
  await p.getByText('Step away briefly').click();
  await p.clock.setFixedTime(T(7, 31)); await p.waitForTimeout(1200);
  await S(p, '08-block-stepped-away');
  await p.clock.setFixedTime(T(7, 37)); await p.reload(); await p.waitForTimeout(800);
  await S(p, '09-close-day-broken-block');
  await p.getByRole('button', { name: 'Yes', exact: true }).click();
  await p.getByText('Close today').click();
  await p.getByText('About').click();
  await S(p, '10-about');
  console.log('sw', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  await c.close(); }
{ const { c, p } = await ctx('light', seed('2026-10-10'), T(7, 0)); await S(p, '11-bad-day'); await c.close(); }
{ const { c, p } = await ctx('dark', seed('2026-10-14'), T(6, 40)); await p.getByText("I'm ready").click(); await p.getByText('Call the insurance company').click(); await S(p, 'dark-02-name-pushed'); await c.close(); }
await b.close();
