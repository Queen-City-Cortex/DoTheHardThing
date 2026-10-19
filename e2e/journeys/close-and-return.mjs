// Journeys: close and return (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import { t } from '../../src/copy.ts';
import { BACK, h1, FIRST_H1, READY, PUSHED_Q, STEP0_HINT, throughToPick, startBlock, noVerdict, SEE_DAYS, NOTE, FIRST_DAY, expectClose, answer, closeToday, expectFraming, expectLateOnlyWelcome } from '../drive/actions.mjs';
import { journey, J } from '../drive/registry.mjs';

export const closeAndReturnJourneys = {
  'carryover-keeps-tag-drops-noyes': journey({ id: 'carryover-keeps-tag-drops-noyes', feature: 'returning-user', proves: ['ru-leftovers'], strings: ['block.end'] }, async (s) => { // leftovers keep their tag; a No/No item was set aside and does not come back
    const p = s.page;
    await throughToPick(s, { risky: ['Ask for the raise'], anxious: ['Tax letter', 'Old chore'], answers: [[true, true], [true, false], [false, false]] });
    await expect(p.getByRole('button', { name: /Old chore/ })).toHaveCount(0);
    await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('end-early', async () => { await p.getByRole('button', { name: t('block.end') }).click(); });
    await expectClose(p);
    await s.step('answer-not-today', async () => { await answer(p, false, NOTE.no, null); });
    await s.step('close-today', async () => { await closeToday(p, false); });
    await p.clock.setSystemTime(new Date('2026-10-15T07:30:00')); await p.reload();
    await s.step('next-morning-chips', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      const raise = p.getByRole('button', { name: /Ask for the raise/ });
      await expect(raise).toContainText('risky');
      await expect(raise).toContainText('pushed 1×');
      await expect(p.getByRole('button', { name: /Tax letter/ })).toContainText('anxious');
      await expect(p.getByRole('button', { name: /Old chore/ })).toHaveCount(0);
    });
    await s.step('bring-in-raise', async () => {
      await p.getByRole('button', { name: /Ask for the raise/ }).click();
      await expect(p.getByRole('listitem').filter({ hasText: 'Ask for the raise' })).toContainText('risky · pushed 1×');
    });
    await expect.poll(async () => (await s.store()).days.find((d) => d.date === '2026-10-15')?.items.map((i) => [i.text, i.tags, i.pushedCount]))
      .toEqual([['Ask for the raise', ['risky'], 1]]);
  }),
  'pick-requires-choice': journey({ id: 'pick-requires-choice', feature: 'pick-and-start', proves: ['ps-filter', 'ps-choice'], strings: ['pick.start'] }, async (s) => { // Start stays disabled until a listed item is chosen; No/No items are not offered
    const p = s.page;
    await throughToPick(s, { risky: ['Ask for the raise', 'Call the landlord'], anxious: [] });
    await s.step('pick-list', async () => {
      await expect(p.getByRole('button', { name: /Call the landlord/ })).toHaveCount(0); // answered No/No
      await expect(p.getByRole('button', { name: t('pick.start') })).toBeDisabled();
      await expect(p.getByRole('button', { name: BACK })).toHaveCount(0); // Pick has no Back (see Gotchas)
      await p.getByRole('button', { name: /Ask for the raise/ }).click();
      await expect(p.getByRole('button', { name: t('pick.start') })).toBeEnabled();
    });
  }),
  'close-day': journey({ id: 'close-day', feature: 'close-day', proves: ['cd-question', 'cd-never-verdict', 'cd-answer', 'cd-lines', 'cd-close', 'cd-persist'], strings: ['closed.eyebrow', 'closed.done'] }, async (s, opts) => {
    const p = s.page;
    await throughToPick(s, opts); await startBlock(s);
    await p.clock.runFor('02:00:01');
    await s.step('block-complete', async () => { await expectClose(p); }); // a full block answers nothing on its own
    await s.step('answer-yes', async () => { await answer(p, true, NOTE.first, FIRST_DAY); });
    await s.step('close', async () => { await closeToday(p, true); });
    await p.reload();
    await s.step('reload-still-closed', async () => {
      await expect(p.getByText(t('closed.eyebrow'))).toBeVisible();
      await expect(h1(p)).toHaveText(t('closed.done'));
      await expect(p.getByText('Let the rest of the urgent but less important stuff slide.', { exact: false })).toBeVisible();
      await expect(SEE_DAYS(p)).toBeVisible();
      await noVerdict(p);
    });
    const d = (await s.store()).days.at(-1);
    if (!d.closed || d.didIt !== true || d.doneText !== 'Ask for the raise' || d.block?.endReason !== 'complete') throw new Error('closed day stored wrong: ' + JSON.stringify(d));
  }),
  'start-over-confirm': journey({ id: 'start-over-confirm', feature: 'close-day', proves: ['cd-start-over'], strings: ['closed.done', 'closed.overGroup', 'closed.keep', 'closed.overYes'] }, async (s) => { // Start today over asks once inline; Keep today changes nothing
    const p = s.page;
    await J['close-day'](s);
    const closedHeading = t('closed.done');
    await s.step('ask-start-over', async () => {
      await p.getByRole('button', { name: t('closed.overGroup') }).click();
      await expect(p.getByText('Start over?')).toBeVisible();
      await expect(h1(p)).toHaveText(closedHeading);
    });
    await s.step('keep-today', async () => {
      await p.getByRole('button', { name: t('closed.keep') }).click();
      await expect(h1(p)).toHaveText(closedHeading);
      await expect(p.getByText('Start over?')).toHaveCount(0);
      await expect(p.getByRole('button', { name: t('closed.overGroup') })).toBeVisible();
    });
    const kept = (await s.store()).days.at(-1);
    if (!kept.closed || kept.items.length === 0) throw new Error('Keep today changed the day: ' + JSON.stringify(kept));
    await s.step('yes-start-over', async () => {
      await p.getByRole('button', { name: t('closed.overGroup') }).click();
      await p.getByRole('button', { name: t('closed.overYes') }).click();
      await expect(h1(p)).toHaveText(FIRST_H1);
    });
    await expect.poll(async () => (await s.store()).days.at(-1).items.length).toBe(0);
    const d = (await s.store()).days.at(-1);
    if (d.closed || d.date !== kept.date) throw new Error('start over did not reset today: ' + JSON.stringify(d));
  }),
  'returning-late': journey({ id: 'returning-late', feature: 'returning-user', proves: ['ru-late', 'ru-step0', 'ru-leftovers'], strings: ['block.end', 'bad.late', 'bad.shorter', 'name.placeholderNew'] }, async (s) => { // day 1 morning real ritual, day 2 opened at 14:00
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.getByRole('button', { name: t('block.end') }).click();
    await expectClose(p); await answer(p, false, NOTE.no, null); await closeToday(p, false);
    await p.clock.setSystemTime(new Date('2026-10-15T14:00:00')); await p.reload();
    await s.step('day2-late', async () => {
      await expectLateOnlyWelcome(p); // late with no missed days: the milder welcome
      await expect(p.getByRole('checkbox', { name: /shorter block.*modified practice/ })).toBeVisible();
    });
    await s.step('leftovers', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(p.getByText(STEP0_HINT)).toBeVisible();
      await expect(p.getByText('Bring in what still matters from before, or add something new.')).toHaveCount(0);
      await expect(p.getByRole('button', { name: /Ask for the raise.*risky · pushed 1×/ })).toBeVisible();
      await expect(p.getByRole('textbox', { name: PUSHED_Q })).toHaveAttribute('placeholder', t('name.placeholderNew'));
    });
  }),
  'missed-days': journey({ id: 'missed-days', feature: 'returning-user', proves: ['ru-missed'], strings: ['bad.hero', 'bad.missed'] }, async (s) => { // ritual Mon, empty peek Tue, back Thu 08:00
    const p = s.page;
    await throughToPick(s);
    await p.clock.setSystemTime(new Date('2026-10-13T08:00:00')); await p.reload();
    await s.step('tue-peek', async () => {});
    await p.clock.setSystemTime(new Date('2026-10-15T08:00:00')); await p.reload();
    await s.step('thu-welcome-back', async () => {
      await expect(h1(p)).toHaveText(t('bad.hero'));
      await expect(p.getByText(t('bad.missed'))).toBeVisible();
      await expectFraming(p, false); // bad only because of missed days: still a morning
    });
    await s.step('mon-leftovers', async () => { await p.getByRole('button', { name: READY }).click(); await expect(p.getByRole('button', { name: /Ask for the raise/ })).toBeVisible(); });
  }),
  'welcome-hour-line': journey({ id: 'welcome-hour-line', feature: 'returning-user', proves: ['ru-morning-line'], strings: ['morning.hero', 'morning.email'] }, async (s) => { // a returning user on a normal morning sees the hour-before line too
    const p = s.page;
    await throughToPick(s);
    await p.clock.setSystemTime(new Date('2026-10-15T08:00:00')); await p.reload();
    await s.step('next-morning-welcome', async () => {
      await expect(h1(p)).toHaveText(t('morning.hero'));
      await expect(p.getByText(t('morning.email'), { exact: false })).toBeVisible();
      await expect(p.getByText('Pen and paper', { exact: false })).toHaveCount(0);
      await expectFraming(p, false);
    });
  }),
};