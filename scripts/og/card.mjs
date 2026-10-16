// Builds public/og-image.png (1200x630), the OG card: title, tagline, DoTheHardThing.app, and a phone showing the Pick screen.
// The phone is a real screenshot of the app, so the card follows the app's wording: just re-run this when the Pick screen changes.
// Run (from the repo root):  npm run build && npx vite preview --port 4173 &   then   node scripts/og/card.mjs
// Env: OG_URL (default http://127.0.0.1:4173), OG_OUT (default public/og-image.png)
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const APP = process.env.OG_URL || 'http://127.0.0.1:4173';
const OUT = path.resolve(process.env.OG_OUT || 'public/og-image.png');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
const pickPng = path.join(tmp, 'pick.png');

const browser = await chromium.launch();

// 1. Screenshot the Pick screen at a frozen time, with a short example list.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: 'America/New_York', locale: 'en-US', colorScheme: 'light' });
  await ctx.route('**/api/event', (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-14T07:15:00') });
  await p.clock.pauseAt(new Date('2026-10-14T07:15:00'));
  await p.goto(APP);
  await p.addStyleTag({ content: 'input{caret-color:transparent!important}*{-webkit-tap-highlight-color:transparent}' });
  const btn = (n, o = {}) => p.getByRole('button', { name: n, ...o });
  const add = async (t) => { await p.getByRole('textbox').click(); await p.keyboard.type(t); await p.keyboard.press('Enter'); await p.waitForTimeout(150); };
  await p.waitForTimeout(300);
  await btn(/^(Start|I'm ready)$/).click(); await p.waitForTimeout(200);
  await add('Talking to leads'); await add('Tax letter');
  await btn('Next').click(); await p.waitForTimeout(200);
  await p.getByRole('group', { name: 'Already on your list' }).getByRole('button', { name: /Talking to leads/ }).click();
  await add('Talk to my landlord');
  await btn('Next').click(); await p.waitForTimeout(200);
  await btn('Two questions').click(); await p.waitForTimeout(200);
  for (let i = 0; i < 3; i++) {
    const qs = p.locator('.q');
    await qs.nth(0).getByRole('button', { name: i == 2 ? 'No' : 'Yes' }).click();
    await qs.nth(1).getByRole('button', { name: i == 1 ? 'No' : 'Yes' }).click();
    await btn(i == 2 ? 'Pick one' : 'Next').click(); await p.waitForTimeout(200);
  }
  await p.waitForTimeout(300);
  await btn(/Talking to leads/).click(); await p.waitForTimeout(200);
  await p.getByRole('radio', { name: '2h', exact: true }).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: pickPng });
  await ctx.close();
}

// 2. Compose the card.
const NM = path.resolve('node_modules/@fontsource-variable');
const font = (pkg, file) => pathToFileURL(path.join(NM, pkg, 'files', file)).href;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:N;font-style:normal;font-weight:200 800;src:url('${font('newsreader', 'newsreader-latin-wght-normal.woff2')}')}
@font-face{font-family:N;font-style:italic;font-weight:200 800;src:url('${font('newsreader', 'newsreader-latin-wght-italic.woff2')}')}
@font-face{font-family:I;font-weight:400 700;src:url('${font('instrument-sans', 'instrument-sans-latin-wght-normal.woff2')}')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#f4f3ef;color:#1f2329;font-family:N,Georgia,serif;position:relative;overflow:hidden}
.sans{font-family:I,sans-serif}
i{font-weight:400}
.phone{position:absolute;border:10px solid #1f2329;border-radius:46px 46px 0 0;border-bottom:none;overflow:hidden;background:#f4f3ef;box-shadow:0 24px 60px rgba(31,35,41,.28)}
.phone img{display:block;width:100%}
.t{position:absolute;left:96px;top:66px;width:620px}
.k{font-size:24px;letter-spacing:.14em;color:#5c616a;font-weight:600}
h1{font-size:118px;line-height:.98;font-weight:500;letter-spacing:-.025em;margin-top:22px;white-space:nowrap}
p{font-size:32px;line-height:1.25;color:#2e343b;margin-top:28px}
.url{position:absolute;left:96px;bottom:50px;font-size:28px;font-weight:600;color:#1f2329}
.phone{left:748px;top:34px;width:356px;height:620px}
</style><div class="t"><div class="k sans">A MORNING METHOD</div><h1>Do The<br><i>Hard Thing</i></h1>
<p>Name what&rsquo;s uncomfortable.<br>Pick one thing.<br>Protect one block.</p></div>
<div class="url sans">DoTheHardThing.app</div>
<div class="phone"><img src="${pathToFileURL(pickPng).href}"></div>`;
const htmlPath = path.join(tmp, 'card.html');
fs.writeFileSync(htmlPath, html);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', OUT);
