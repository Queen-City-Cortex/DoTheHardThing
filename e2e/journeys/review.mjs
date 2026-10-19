import { expect } from '@playwright/test';
import { TALK_URL, fmt, t } from '../../src/copy.ts';
import { NEXT, BACK, DONE, ABOUT, NO, YES_LABEL, PICK_ONE, HOLDING, h1, row, addItem, answerAll, TALK, HOUR_LINE, ASSURE, expectFirstWelcome, PUSHED_Q, throughToPick, startBlock, YES, CLOSE_TODAY, SEE_DAYS, newDayAt, DAYS_H1 } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';
import { PRIVACY } from './analytics.mjs';
import { layoutProblems, contrastFailures } from './readiness.mjs';

// ---- first-visit welcome, focus after navigation, and copy review ----
const focused = (p) => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: (a?.textContent || '').trim().slice(0, 40), label: a?.getAttribute('aria-label') ?? '' }; });
async function expectFocusOnHeading(p, text, label) {
  await expect(h1(p)).toHaveText(text);
  const f = await focused(p);
  if (f.tag !== 'H1' || !f.text.startsWith(text.slice(0, 20))) throw new Error(`after ${label}: focus is on ${JSON.stringify(f)}, not the heading "${text}"`);
}
const noEmDash = (p, label) => expect(p.locator('body'), `em dash on ${label}`).not.toContainText(/\u2014/);
export const reviewJourneys = {
  'welcome-v1': journey({ id: 'welcome-v1', feature: 'first-visit', proves: ['fv-fits', 'fv-back'], strings: ['first.start', 'morning.hero', 'welcome.ready'] }, async (s) => { // the first-visit welcome fits every phone width, reads in both colour schemes, and Start/Back/About work; a returning morning still gets the old welcome
    const p = s.page; const problems = [];
    await s.step('welcome', async () => { await expectFirstWelcome(p); });
    // width x height of real phones: Start, the hour line and the assurance must all end inside the screen (no scroll) from 320x640 up
    for (const [w, h] of [[320, 640], [360, 640], [375, 667], [390, 844], [430, 932]]) {
      await p.setViewportSize({ width: w, height: h });
      for (const x of await layoutProblems(p)) problems.push(`@${w}x${h}: ${x}`);
      const startBox = await p.getByRole('button', { name: t('first.start'), exact: true }).boundingBox(); const linkBox = await p.getByRole('link', { name: TALK }).boundingBox();
      if (startBox.height < 44 || linkBox.height < 44) problems.push(`@${w}x${h}: Start ${startBox.height}px / link ${linkBox.height}px tall, under 44`);
      for (const [n, l] of [['Start', p.getByRole('button', { name: t('first.start'), exact: true })], ['hour line', p.getByText(HOUR_LINE, { exact: true })], ['assurance', p.getByText(ASSURE, { exact: true })]]) { const b = await l.boundingBox(); if (b.y + b.height > h) problems.push(`@${w}x${h}: ${n} ends at ${Math.round(b.y + b.height)}, below the ${h}px fold`); }
      if (w === 390 || w === 320) await s.shot(`welcome-${w}`);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    for (const scheme of ['light', 'dark']) { await p.emulateMedia({ colorScheme: scheme }); for (const x of await contrastFailures(p)) problems.push(`welcome (${scheme}): ${x}`); }
    await p.emulateMedia({ colorScheme: 'light' });
    if (problems.length) throw new Error(`${problems.length} problems: ` + problems.slice(0, 6).join(' | '));
    await s.step('start-and-back', async () => { await p.getByRole('button', { name: t('first.start'), exact: true }).click(); await expect(h1(p)).toHaveText(PUSHED_Q); await p.getByRole('button', { name: BACK }).click(); await expectFirstWelcome(p); });
    await s.step('about-from-welcome', async () => { await p.getByRole('button', { name: ABOUT }).click(); await expect(h1(p)).toHaveText(ABOUT); await p.getByRole('button', { name: DONE }).click(); await expectFirstWelcome(p); });
    await throughToPick(s, { risky: ['Ask for the raise'], anxious: [] }); await startBlock(s); await p.clock.runFor('02:00:01');
    await YES(p).click(); await CLOSE_TODAY(p).click();
    await newDayAt(p, '2026-10-15T08:00:00');
    await s.step('returning-welcome', async () => { await expect(h1(p)).toHaveText(t('morning.hero')); await expect(p.getByRole('button', { name: t('welcome.ready') })).toBeVisible(); await expect(p.getByRole('button', { name: t('first.start'), exact: true })).toHaveCount(0); await expect(p.getByRole('listitem')).toHaveCount(0); });
  }),
  'focus-after-nav': journey({ id: 'focus-after-nav', feature: 'resilience', proves: ['rs-focus'], strings: ['first.start', 'name.risky', 'name.anxious', 'twoQuestions', 'pick.hero', 'pick.start', 'block.end', 'close.hero', 'closed.done', 'close.today', 'seeDays'] }, async (s) => { // after every screen change focus is on the new heading (the input on the name steps), so a keyboard user can type and press Enter at once
    const p = s.page; const A = (n) => p.getByRole('button', { name: n, exact: true });
    await s.step('welcome', async () => { await expectFirstWelcome(p); });
    await A(t('first.start')).focus(); await p.keyboard.press('Enter');
    await s.step('name-1', async () => { await expect(p.getByRole('textbox', { name: PUSHED_Q })).toBeFocused(); await p.keyboard.type('Call mom'); await p.keyboard.press('Enter'); await expect(row(p, 'Call mom')).toBeVisible(); await expect(p.getByRole('textbox')).toBeFocused(); });
    await expect(p.getByRole('img', { name: fmt.steps(1, 3) })).toBeVisible(); // the progress dots are an image with a label, not a bare div
    await A(NEXT).focus(); await p.keyboard.press('Enter');
    await s.step('name-2', async () => { await expect(h1(p)).toHaveText(t('name.risky')); await expect(p.getByRole('textbox')).toBeFocused(); await p.keyboard.type('Ask for the raise'); await p.keyboard.press('Enter'); await expect(row(p, 'Ask for the raise')).toBeVisible(); });
    await A(NEXT).focus(); await p.keyboard.press('Enter');
    await s.step('name-3', async () => { await expect(h1(p)).toHaveText(t('name.anxious')); await expect(p.getByRole('textbox')).toBeFocused(); await p.keyboard.type('Tax letter'); await p.keyboard.press('Enter'); });
    await A(t('twoQuestions')).focus(); await p.keyboard.press('Enter');
    await A(BACK).focus(); await p.keyboard.press('Enter'); // Back from the first item reopens Name on its last step, its textbox focused
    await s.step('back-to-name-3', async () => { await expect(h1(p)).toHaveText(t('name.anxious')); await expect(p.getByRole('textbox')).toBeFocused(); });
    await A(t('twoQuestions')).focus(); await p.keyboard.press('Enter');
    await s.step('ask-1', async () => { await expect(h1(p)).toHaveText(/./); const f = await focused(p); if (f.tag !== 'H1') throw new Error('ask: ' + JSON.stringify(f)); await p.keyboard.press('Tab'); await expect(A(YES_LABEL).first()).toBeFocused(); await p.keyboard.press('Space'); await expect(A(YES_LABEL).first()).toHaveClass(/\bon\b/); });
    await p.locator('.q').nth(1).getByRole('button', { name: YES_LABEL }).click(); await A(NEXT).click();
    await s.step('ask-2-heading', async () => { const f = await focused(p); if (f.tag !== 'H1') throw new Error('ask item 2: ' + JSON.stringify(f)); });
    await p.locator('.q').nth(0).getByRole('button', { name: YES_LABEL }).click(); await p.locator('.q').nth(1).getByRole('button', { name: NO }).click(); await A(NEXT).click();
    await p.locator('.q').nth(0).getByRole('button', { name: YES_LABEL }).click(); await p.locator('.q').nth(1).getByRole('button', { name: NO }).click(); await A(PICK_ONE).click();
    await s.step('pick', async () => { await expectFocusOnHeading(p, t('pick.hero'), PICK_ONE); });
    await p.getByRole('button', { name: /Call mom/ }).click(); await p.getByRole('radio', { name: '2h', exact: true }).click(); await A(t('pick.start')).click();
    await s.step('block', async () => { await expectFocusOnHeading(p, 'Call mom', t('pick.start')); });
    await p.clock.runFor('05:00'); await A(t('block.end')).click();
    await s.step('close', async () => { await expectFocusOnHeading(p, t('close.hero'), t('block.end')); });
    await YES(p).click(); await CLOSE_TODAY(p).click();
    await s.step('closed', async () => { await expectFocusOnHeading(p, t('closed.done'), t('close.today')); });
    await SEE_DAYS(p).click();
    await s.step('days', async () => { await expectFocusOnHeading(p, DAYS_H1, t('seeDays')); });
    await p.getByRole('button', { name: DONE }).click();
    await s.step('back-to-closed', async () => { await expectFocusOnHeading(p, t('closed.done'), DONE); });
    await p.getByRole('button', { name: ABOUT }).click();
    await s.step('about', async () => { await expectFocusOnHeading(p, ABOUT, ABOUT); });
    await p.getByRole('button', { name: DONE }).click();
    // a plain page load does not grab focus
    await p.reload(); const f = await focused(p); if (f.tag !== 'BODY') throw new Error('page load moved focus: ' + JSON.stringify(f));
  }),
  'review-copy': journey({ id: 'review-copy', feature: 'pick-and-start', proves: ['ps-block-copy', 'an-privacy-note'], strings: ['block.pauseHint', 'first.step1.d', 'first.start', 'name.anxious.hint', 'twoQuestions', 'pick.small', 'block.focus', 'block.stepAway', 'block.back', 'block.pauseUsed', 'block.end', 'about.independent', 'about.free'] }, async (s) => { // block length, the pause line, name-step hints, About (eight steps to three, not affiliated, one talk link, four privacy lines); no em dash anywhere
    const p = s.page; const SPAUSE = t('block.pauseHint');
    await s.step('welcome', async () => { await noEmDash(p, 'welcome'); await expect(p.getByText(t('first.step1.d'))).toBeVisible(); await p.getByRole('button', { name: t('first.start'), exact: true }).click(); });
    await s.step('name-1', async () => { await noEmDash(p, 'name 1'); await expect(p.getByRole('img', { name: fmt.steps(1, 3) })).toBeVisible(); await addItem(p, 'Ask for the raise'); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: NEXT }).click(); });
    await s.step('name-3-his-words', async () => {
      await expect(p.getByText(t('name.anxious.hint'))).toBeVisible();
      await expect(p.locator('body')).not.toContainText(/chest/i); await noEmDash(p, 'name 3');
      await p.getByRole('button', { name: t('twoQuestions') }).click();
    });
    await answerAll(p, [[true, true]]);
    await s.step('pick-block-length', async () => {
      await expect(p.getByText(fmt.pickLine(false, false), { exact: true })).toBeVisible();
      await expect(p.getByText(t('pick.small'), { exact: false })).toHaveCount(0); await noEmDash(p, 'pick');
    });
    await startBlock(s);
    await s.step('block-pause-line', async () => {
      await expect(p.getByText(`${t('block.focus')} ${SPAUSE}`, { exact: true })).toBeVisible();
      await expect(p.getByText('One break of up to 10 minutes', { exact: false })).toHaveCount(0); await noEmDash(p, 'block');
    });
    await p.clock.runFor('05:00');
    await s.step('pause-still-works', async () => { // copy only: the pause behaves as before
      await p.getByRole('button', { name: t('block.stepAway') }).click(); await expect(p.getByText(HOLDING)).toBeVisible();
      await expect(p.getByText(fmt.pausedLine(0, 10), { exact: true })).toBeVisible();
      await p.clock.runFor('09:00'); await p.getByRole('button', { name: t('block.back') }).click();
      await expect(p.getByText(t('block.pauseUsed'))).toBeVisible(); await expect(p.getByRole('button', { name: t('block.stepAway') })).toHaveCount(0);
    });
    const d = (await s.store()).days.at(-1); if (d.block.endedAt != null || d.block.endReason) throw new Error('a 9-minute pause ended the block: ' + JSON.stringify(d.block));
    await p.getByRole('button', { name: t('block.end') }).click(); await YES(p).click(); await CLOSE_TODAY(p).click();
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click(); await expect(h1(p)).toHaveText(ABOUT); await noEmDash(p, ABOUT);
      await expect(p.getByText('his eight steps, condensed to three', { exact: false })).toBeVisible();
      await expect(p.getByText(t('about.independent'), { exact: true })).toBeVisible();
      const link = p.getByRole('link', { name: TALK }); await expect(link).toHaveCount(1); await expect(link).toHaveAttribute('href', TALK_URL);
      await expect(p.getByText('original post', { exact: false })).toHaveCount(0); await expect(p.getByRole('link')).toHaveCount(1); // the one link
      for (const line of PRIVACY) await expect(p.getByText(line, { exact: true })).toBeVisible();
      await expect(p.getByText(t('about.free'), { exact: true })).toBeVisible();
      const order = await p.locator('#privacy p').allTextContents(); if (JSON.stringify(order) !== JSON.stringify(PRIVACY)) throw new Error('privacy lines out of order: ' + JSON.stringify(order));
    });
  }),
};