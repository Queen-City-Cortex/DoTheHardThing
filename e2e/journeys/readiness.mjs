import { expect } from '@playwright/test';
import { t } from '../../src/copy.ts';
import { NEXT, BACK, DONE, ABOUT, ADD, h1, row, addItem, answerAll, FIRST_H1, READY, PUSHED_Q, throughToPick, startBlock, YES, CLOSE_TODAY, SEE_DAYS, NOTE, FIRST_DAY, expectClose, answer, closeToday, newDayAt } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';
import { noPageErrors } from './analytics.mjs';

// ---------- launch-readiness: offline, small phones, blocked storage, no Notification API, hostile text, reload mid-naming ----------

// Every box and every line of text must sit inside the page's padded column (so no sideways scroll, nothing clipped, nothing past the side margin). Returns what does not.
export const layoutProblems = (p) => p.evaluate(() => {
  const de = document.documentElement, vw = de.clientWidth, out = []; // clientWidth, not innerWidth: a touch browser widens innerWidth to fit overflowing content and hides the overflow
  if (de.scrollWidth > vw + 1) out.push(`page scrollWidth ${de.scrollWidth} > ${vw}`);
  const main = document.querySelector('main'); const mb = main.getBoundingClientRect(), ms = getComputedStyle(main);
  const mL = mb.left + parseFloat(ms.paddingLeft), mR = mb.right - parseFloat(ms.paddingRight);
  for (const e of document.querySelectorAll('main *, header *')) {
    const inMain = main.contains(e); const L = inMain ? mL : 0, R = inMain ? mR : vw;
    const b = e.getBoundingClientRect(); const id = `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`;
    if (b.width > 0 && (b.right > R + 1 || b.left < L - 1)) out.push(`${id} box ${Math.round(b.left)}..${Math.round(b.right)} outside ${Math.round(L)}..${Math.round(R)}`);
    const ox = getComputedStyle(e).overflowX; if (ox !== 'visible' && e.scrollWidth > e.clientWidth + 1) out.push(`${id} clips its content (${e.scrollWidth} > ${e.clientWidth})`);
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width > 0 && (q.right > R + 1 || q.left < L - 1)) { out.push(`${id} text "${n.textContent.trim().slice(0, 18)}" ${Math.round(q.left)}..${Math.round(q.right)}`); break; } }
  }
  return [...new Set(out)].slice(0, 6);
});

// WCAG AA text contrast of everything on screen, as rendered: every element with its own text, colour against the first opaque background behind it (opacity folded in).
// Disabled controls are exempt (WCAG 1.4.3). Large text (24px, or 18.66px bold) needs 3:1, the rest 4.5:1. Returns the failures.
export const contrastFailures = (p) => p.evaluate(() => {
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bgOf = (e) => { const chain = []; for (let n = e; n; n = n.parentElement) chain.push(n); let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const n of chain.reverse()) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) bg = over(c, bg); } return bg; };
  const out = [];
  for (const e of document.body.querySelectorAll('*')) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (e.closest(':disabled, [aria-disabled=true]')) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1; for (let n = e; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const bg = bgOf(e); const fg = over({ ...parse(cs.color), a: parse(cs.color).a * op }, bg);
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700, need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio(fg, bg); if (r < need) out.push(`${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''} "${e.textContent.trim().slice(0, 20)}" ${r.toFixed(2)}:1 < ${need}`);
  }
  return [...new Set(out)].slice(0, 8);
});
// the app shell is precached and the page controlled by the service worker (a fresh context has neither at first load)
async function waitForOfflineReady(p) {
  for (let i = 0; i < 80; i++) {
    const n = await p.evaluate(async () => { const ks = await caches.keys(); let c = 0; for (const k of ks) c += (await (await caches.open(k)).keys()).length; return c; });
    if (n >= 8) break; await p.waitForTimeout(500);
  }
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => 1));
  await p.reload(); // the first load is not controlled; this one is
  await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
export const readinessJourneys = {
  'offline-reload': journey({ id: 'offline-reload', feature: 'resilience', proves: ['rs-offline'], strings: ['closed.eyebrow'] }, async (s) => { // real service worker: after one online visit the whole app works with the network off, and a block survives an offline reload
    const p = s.page;
    await s.step('online-visit', async () => { await waitForOfflineReady(p); });
    await s.context.setOffline(true);
    await s.step('offline-reload', async () => { await p.reload(); await expect(h1(p)).toHaveText(FIRST_H1); });
    await throughToPick(s); await startBlock(s);
    await s.step('block-survives-offline-reload', async () => { await p.reload(); await expect(p.getByRole('timer')).toContainText('2:00:00'); });
    await p.clock.runFor('02:00:01');
    await s.step('close-offline', async () => { await expectClose(p); await answer(p, true, NOTE.first, FIRST_DAY); await closeToday(p, true); });
    await s.step('closed-survives-offline-reload', async () => { await p.reload(); await expect(p.getByText(t('closed.eyebrow'))).toBeVisible(); });
    const st = await s.store(); if (st?.days?.[0]?.didIt !== true) throw new Error('the offline day did not save');
  }),
  'small-phone-layout': journey({ id: 'small-phone-layout', feature: 'resilience', proves: ['rs-small-phone'], strings: [] }, async (s) => { // 375x667 (iPhone SE class, touch): a whole day with no sideways scroll, the key action reachable on every screen
    const p = s.page; const at = async (label) => { const bad = await layoutProblems(p); if (bad.length) throw new Error(`layout problems on ${label}: ${bad.join(' | ')}`); };
    await at('welcome');
    await throughToPick(s, { risky: ['Prepare the quarterly numbers for the investor update and send them to everyone on the list'], anxious: ['Tax letter'] });
    await at('pick'); await startBlock(s, 'Prepare the quarterly');
    await at('block'); await p.clock.runFor('02:00:01');
    await s.step('close', async () => { await at('close'); await YES(p).click(); await at('close-yes'); await expect(CLOSE_TODAY(p)).toBeEnabled(); await CLOSE_TODAY(p).scrollIntoViewIfNeeded(); await CLOSE_TODAY(p).click(); });
    await s.step('closed-days-about', async () => { await at('closed'); await SEE_DAYS(p).click(); await at('days'); await p.getByRole('button', { name: DONE }).click(); await p.getByRole('button', { name: ABOUT }).click(); await at('about'); });
  }),
  'long-url-widths': journey({ id: 'long-url-widths', feature: 'resilience', proves: ['rs-long-text'], strings: ['twoQuestions', 'pick.start'] }, async (s) => { // a pasted URL (55+ chars, no break opportunity) as an item on every screen that shows item text, at 320, 375, 390 and 430 wide: it wraps, nothing is clipped, nothing scrolls sideways
    const p = s.page; const problems = [];
    const U1 = 'https://example.com/investors/q3-update-deck-final-v2-FINAL-reviewed-by-legal';
    const U2 = 'https://docs.example.org/shared/folder/tax-letter-response-2026-10-draft3';
    const at = async (label) => { // measure at every width, screenshot at the two smallest; always return to 320
      for (const w of [430, 390, 375, 320]) {
        await p.setViewportSize({ width: w, height: 760 });
        for (const x of await layoutProblems(p)) problems.push(`${label} @${w}: ${x}`);
        if (w === 375 || w === 320) await s.shot(`${label}-${w}`);
      }
    };
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
    await p.getByRole('textbox').fill(U1); await p.getByRole('button', { name: ADD }).click(); await at('name-pushed');
    await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('textbox').fill(U2); await p.getByRole('button', { name: ADD }).click(); await at('name-risky');
    await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: t('twoQuestions') }).click(); await at('ask');
    await answerAll(p, [[true, true], [true, false]]); await at('pick');
    await p.getByRole('button', { name: /q3-update-deck/ }).click(); await p.getByRole('radio', { name: '2h', exact: true }).click(); await p.getByRole('button', { name: t('pick.start') }).click();
    await expect(p.getByRole('timer')).toContainText('2:00:00'); await at('block');
    await p.clock.runFor('02:00:01'); await at('close'); await YES(p).click(); await at('close-yes');
    await CLOSE_TODAY(p).click(); await at('closed'); await SEE_DAYS(p).click(); await at('days');
    await p.getByRole('button', { name: DONE }).click(); await newDayAt(p, '2026-10-15T07:15:00');
    await p.getByRole('button', { name: READY }).click(); await at('bring-in');
    await p.getByRole('button', { name: /tax-letter-response/ }).click(); await at('bring-in-picked');
    await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: t('twoQuestions') }).click(); await at('ask-day2');
    if (problems.length) throw new Error(`${problems.length} layout problems on ${[...new Set(problems.map((x) => x.split(' ')[0]))].join(', ')}: ` + problems.slice(0, 6).join(' | '));
  }),
  'contrast-aa': journey({ id: 'contrast-aa', feature: 'resilience', proves: ['rs-contrast', 'dm-contrast'], strings: ['twoQuestions', 'pick.start', 'block.stepAway', 'block.back', 'block.end'] }, async (s) => { // every screen of a day, light and dark: all text meets WCAG AA (4.5:1; 3:1 for large text), so the muted grey cannot slip back under
    const p = s.page; const fails = [];
    const at = async (label) => {
      for (const scheme of ['light', 'dark']) { await p.emulateMedia({ colorScheme: scheme }); for (const f of await contrastFailures(p)) fails.push(`${label} (${scheme}): ${f}`); }
      await p.emulateMedia({ colorScheme: 'light' });
    };
    await at('welcome'); await p.getByRole('button', { name: READY }).click();
    await addItem(p, 'Move the Q3 deadline'); await at('name-pushed'); await p.getByRole('button', { name: NEXT }).click();
    await addItem(p, 'Ask for the raise'); await at('name-risky'); await p.getByRole('button', { name: NEXT }).click();
    await addItem(p, 'Tax letter'); await p.getByRole('button', { name: t('twoQuestions') }).click(); await at('ask');
    await answerAll(p, [[true, true], [true, false], [true, false]]); await at('pick');
    await p.getByRole('button', { name: /Move the Q3/ }).click(); await p.getByRole('radio', { name: '2h', exact: true }).click(); await p.getByRole('button', { name: t('pick.start') }).click();
    await expect(p.getByRole('timer')).toContainText('2:00:00'); await p.clock.runFor('00:10'); await at('block');
    await p.getByRole('button', { name: t('block.stepAway') }).click(); await at('block-paused'); await p.getByRole('button', { name: t('block.back') }).click();
    await p.getByRole('button', { name: t('block.end') }).click(); await at('close'); await YES(p).click(); await at('close-yes');
    await CLOSE_TODAY(p).click(); await at('closed'); await SEE_DAYS(p).click(); await at('days'); await p.getByRole('button', { name: DONE }).click();
    await p.getByRole('button', { name: ABOUT }).click(); await at('about'); await p.getByRole('button', { name: BACK }).click().catch(() => {});
    await newDayAt(p, '2026-10-15T07:15:00'); await p.getByRole('button', { name: READY }).click(); await at('bring-in');
    if (fails.length) throw new Error(`${fails.length} contrast failures: ` + fails.slice(0, 8).join(' | '));
  }),
  'reload-mid-naming': journey({ id: 'reload-mid-naming', feature: 'resilience', proves: ['rs-reload-mid-naming'], strings: [] }, async (s) => { // the app has no step memory: a reload during naming returns to Welcome, and the items already added are still there (a typed, unadded draft is lost)
    const p = s.page;
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
    await s.step('two-steps', async () => { await addItem(p, 'Talking to leads'); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('textbox').fill('typed but not added'); });
    await s.step('reload', async () => { await p.reload(); await expect(h1(p)).toHaveText(FIRST_H1); });
    await s.step('ready-again', async () => {
      await p.getByRole('button', { name: READY }).click(); await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(row(p, 'Talking to leads')).toBeVisible(); await expect(p.getByText('typed but not added')).toHaveCount(0);
    });
  }),
  'storage-blocked': journey({ id: 'storage-blocked', feature: 'resilience', proves: ['rs-storage-blocked'], strings: ['saveNote', 'twoQuestions'] }, async (s) => { // storage refuses writes (private mode, full disk): a visible note, nothing crashes, the day can still be worked in memory
    const p = s.page;
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); await addItem(p, 'Ask for the raise'); });
    await s.step('note', async () => { await expect(p.getByText(t('saveNote'))).toBeVisible(); });
    await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: t('twoQuestions') }).click();
    await answerAll(p, [[true, true]]); await startBlock(s, 'Ask for the raise');
    noPageErrors(s);
  }),
  'no-notification-api': journey({ id: 'no-notification-api', feature: 'resilience', proves: ['rs-no-notification'], strings: ['reminder.unsupported', 'about.time'] }, async (s) => { // iPhone Safari outside the home-screen app has no Notification API: About says so, offers no time input, nothing throws
    const p = s.page;
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(p.getByText(t('reminder.unsupported'))).toBeVisible();
      await expect(p.getByLabel(t('about.time'))).toHaveCount(0);
    });
    noPageErrors(s);
  }),
  'hostile-text': journey({ id: 'hostile-text', feature: 'resilience', proves: ['rs-hostile-text'], strings: [] }, async (s) => { // items are plain text whatever is typed: markup is shown literally, nothing runs, blanks cannot be added
    const p = s.page; let dialog = false; p.on('dialog', (d) => { dialog = true; d.dismiss(); });
    const evil = '<img src=x onerror=alert(1)> & "quotes" \u{1F525} \u65E5\u672C\u8A9E';
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); await addItem(p, evil); });
    await s.step('blank', async () => { await p.getByRole('textbox').fill('   '); await expect(p.getByRole('button', { name: ADD })).toBeDisabled(); });
    if (dialog) throw new Error('script in an item ran'); if (await p.locator('main img').count()) throw new Error('markup in an item was rendered');
    const st = await s.store(); if (st.days.at(-1).items[0].text !== evil) throw new Error('stored text changed: ' + st.days.at(-1).items[0].text);
    noPageErrors(s);
  }),
};