// Journeys: history (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import { t } from '../../src/copy.ts';
import { NEXT, BACK, DONE, ABOUT, SKIP, h1, listed, row, FIRST_H1, daysRow, READY, PUSHED_Q, STEP0_HINT, throughToPick, startBlock, noVerdict, YES, SEE_DAYS, NOTE, FIRST_DAY, count, expectClose, answer, closeToday, ritualDay, newDayAt, DAYS_H1, expectHistory } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';

export const historyJourneys = {
  'count-grows': journey({ id: 'count-grows', feature: 'history', proves: ['hi-list', 'hi-month', 'hi-earlier'], strings: ['block.end', 'yourDays'] }, async (s) => { // Yes, Not today, Yes, Yes: the count only goes up; history lists only the done days, then a new month moves them to Earlier
    const p = s.page;
    await ritualDay(s, { item: 'Ask for the raise', yes: true, note: NOTE.first, line: FIRST_DAY });
    await newDayAt(p, '2026-10-15T07:30:00');
    await ritualDay(s, { item: 'Call the landlord', yes: false, note: NOTE.no, line: count(1) });
    await newDayAt(p, '2026-10-16T07:30:00');
    await ritualDay(s, { item: 'Draft the proposal', yes: true, note: NOTE.yes, line: count(2) });
    await newDayAt(p, '2026-10-17T07:30:00');
    const item = 'Email the school';
    await throughToPick(s, { risky: [item], anxious: [] }); await startBlock(s, item);
    await p.clock.runFor('45:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p, item); });
    await s.step('not-today-holds', async () => { await answer(p, false, NOTE.no, count(2)); }); // a missed day adds nothing, takes nothing
    await s.step('yes-adds-one', async () => { await answer(p, true, NOTE.yes, count(3)); });
    await s.step('close-today', async () => { await closeToday(p, true); });
    await s.step('history-october', async () => {
      await SEE_DAYS(p).click();
      await expectHistory(p, { total: 3, month: 'October', rows: [['Sat 17', item], ['Fri 16', 'Draft the proposal'], ['Wed 14', 'Ask for the raise']], absent: ['Thu 15', 'Call the landlord'] });
    });
    await newDayAt(p, '2026-11-02T08:00:00');
    await s.step('november-about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(p.getByRole('button', { name: t('yourDays') })).toHaveText(daysRow(3));
    });
    await s.step('november-history', async () => {
      await p.getByRole('button', { name: t('yourDays') }).click();
      await expectHistory(p, { total: 3, earlier: [['October', '3 days']], absent: ['Sat 17', 'Wed 14'] });
      await expect(p.getByText(/^November/)).toHaveCount(0); // no month block for a month with nothing done
    });
  }),
  'history-empty': journey({ id: 'history-empty', feature: 'history', proves: ['hi-empty'], strings: ['yourDays', 'days.empty'] }, async (s) => { // a brand-new profile: the empty state, no zero anywhere
    const p = s.page;
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      const row = p.getByRole('button', { name: t('yourDays') });
      await expect(row).toHaveText(daysRow(0));
      await expect(row).not.toContainText(/\d/);
    });
    await s.step('your-days-empty', async () => {
      await p.getByRole('button', { name: t('yourDays') }).click();
      await expect(p.getByText(t('yourDays'), { exact: true })).toBeVisible();
      await expect(h1(p)).toHaveText(DAYS_H1);
      await expect(p.getByText(t('days.empty'))).toBeVisible();
      await expect(p.getByText(/since you started/)).toHaveCount(0);
      await expect(p.getByText('Only the days you did it are listed.', { exact: false })).toHaveCount(0);
      await expect(p.getByRole('list')).toHaveCount(0);
      await expect(p.getByRole('main')).not.toContainText(/\d/);
      await noVerdict(p);
    });
    await s.step('back-to-about', async () => { await p.getByRole('button', { name: BACK }).click(); await expect(h1(p)).toHaveText(ABOUT); });
    await s.step('done-to-welcome', async () => { await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(FIRST_H1); });
  }),
  'history-from-close-and-about': journey({ id: 'history-from-close-and-about', feature: 'history', proves: ['hi-entries', 'hi-back', 'hi-now'], strings: ['block.end', 'close.hero', 'closed.done', 'yourDays'] }, async (s) => { // the first Yes ever shows no number; both ways in to Your days; Done and Back return to where you came from, one step at a time
    const p = s.page;
    const one = { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] };
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p); });
    await s.step('answer-yes', async () => { await answer(p, true, NOTE.first, FIRST_DAY); await expect(p.getByRole('main')).not.toContainText(/\d/); }); // the first day shows no number at all
    await s.step('close-to-days', async () => { await SEE_DAYS(p).click(); await expectHistory(p, one); });
    await s.step('done-to-close', async () => { await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(t('close.hero')); await expect(YES(p)).toHaveClass(/\bon\b/); });
    await s.step('close-to-days-again', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); });
    await s.step('back-to-close', async () => { await p.getByRole('button', { name: BACK }).click(); await expect(h1(p)).toHaveText(t('close.hero')); });
    await s.step('close-today', async () => { await closeToday(p, true); });
    await s.step('closed-to-days', async () => { await SEE_DAYS(p).click(); await expectHistory(p, one); });
    await s.step('done-to-closed', async () => { await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(t('closed.done')); });
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(h1(p)).toHaveText(ABOUT);
      await expect(p.getByRole('button', { name: t('yourDays') })).toHaveText(daysRow(1));
    });
    await s.step('about-to-days', async () => { await p.getByRole('button', { name: t('yourDays') }).click(); await expectHistory(p, one); });
    await s.step('done-to-about', async () => { await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(ABOUT); });
    await s.step('about-to-days-back', async () => {
      await p.getByRole('button', { name: t('yourDays') }).click();
      await p.getByRole('button', { name: BACK }).click();
      await expect(h1(p)).toHaveText(ABOUT);
    });
    await s.step('done-to-closed-again', async () => { await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(t('closed.done')); });
  }),
  'step0-bring-in': journey({ id: 'step0-bring-in', feature: 'returning-user', proves: ['ru-step0'], strings: ['block.end', 'name.placeholderNew', 'name.risky'] }, async (s) => { // yesterday's open items are offered on step 1, nothing pre-selected; only what is tapped comes along
    const p = s.page;
    await throughToPick(s, { pushed: ['Tax letter'], risky: ['Ask for the raise'], anxious: ['Email the school'], answers: [[true, false], [true, true], [false, true]] });
    await startBlock(s);
    await p.clock.runFor('10:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p); });
    await s.step('not-today', async () => { await answer(p, false, NOTE.no, null); });
    await s.step('close-today', async () => { await closeToday(p, false); });
    await newDayAt(p, '2026-10-15T07:30:00');
    const offer = (text) => p.getByRole('button', { name: new RegExp(`^${text}`) });
    await s.step('step0-offered', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(p.getByText(STEP0_HINT)).toBeVisible();
      await expect(p.getByRole('textbox', { name: PUSHED_Q })).toHaveAttribute('placeholder', t('name.placeholderNew'));
      for (const text of ['Tax letter', 'Ask for the raise', 'Email the school']) await expect(offer(text)).toHaveAttribute('aria-pressed', 'false');
      await expect(offer('Tax letter')).toContainText('pushed 1×');
      await expect(offer('Ask for the raise')).toContainText('risky · pushed 1×');
      await expect(p.getByRole('listitem')).toHaveCount(0); // nothing carried on its own
      await expect(p.getByRole('button', { name: SKIP })).toBeVisible();
    });
    await s.step('tap-tax-letter', async () => {
      await offer('Tax letter').click();
      await expect(offer('Tax letter')).toHaveAttribute('aria-pressed', 'true');
      await expect(p.getByRole('listitem').filter({ hasText: 'Tax letter' })).toBeVisible();
      await expect(p.getByRole('button', { name: NEXT })).toBeVisible();
      await expect(p.getByRole('button', { name: SKIP })).toHaveCount(0);
    });
    await s.step('tap-email-twice', async () => { // tapped and tapped again: it stays behind
      await offer('Email the school').click();
      await expect(p.getByRole('listitem')).toHaveCount(2);
      await offer('Email the school').click();
      await expect(offer('Email the school')).toHaveAttribute('aria-pressed', 'false');
      await expect(p.getByRole('listitem')).toHaveCount(1);
    });
    await s.step('next-step-lists-one', async () => {
      await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
      await expect(listed(p)).toHaveCount(1);
      await expect(row(p, 'Tax letter')).toBeVisible();
    });
    await expect.poll(async () => (await s.store()).days.find((d) => d.date === '2026-10-15')?.items.map((i) => [i.text, i.pushedCount]))
      .toEqual([['Tax letter', 1]]);
  }),
};