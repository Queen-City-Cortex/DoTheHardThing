// Journeys: copy and midnight (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import { t } from '../../src/copy.ts';
import { NEXT, ABOUT, SKIP, h1, addItem, answerAll, READY, throughToPick, startBlock, CLOSE_TODAY, NOTE, FIRST_DAY, count, expectClose, answer, closeToday, ritualDay, newDayAt, RULE, GUISE, quote } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';

export const copyAndMidnightJourneys = {
  'copy-from-the-talk': journey({ id: 'copy-from-the-talk', feature: 'pick-and-start', proves: ['ps-talk-copy'], strings: ['name.risky.hint', 'twoQuestions', 'ask.satisfied', 'ask.leverage', 'none.hero', 'cite.tim', 'none.again', 'pick.hero', 'pick.ten', 'about.busy'] }, async (s) => { // the talk's own words on Name, Ask, Pick, Nothing got a yes and About; Close quotes nothing
    const p = s.page;
    await p.getByRole('button', { name: READY }).click();
    await p.getByRole('button', { name: SKIP }).click();
    await s.step('risky-hint', async () => {
      await expect(p.getByText(t('name.risky.hint'))).toBeVisible();
      await addItem(p, 'Ask for the raise');
      await p.getByRole('button', { name: NEXT }).click();
      await p.getByRole('button', { name: t('twoQuestions') }).click();
    });
    await s.step('ask-questions', async () => {
      await expect(p.locator('.q').nth(0)).toContainText(t('ask.satisfied'));
      await expect(p.locator('.q').nth(1)).toContainText(t('ask.leverage'));
      await answerAll(p, [[false, false]]);
    });
    await s.step('nothing-got-a-yes', async () => {
      await expect(h1(p)).toHaveText(t('none.hero'));
      await expect(quote(p, GUISE)).toContainText(t('cite.tim'));
      await p.getByRole('button', { name: t('none.again') }).click();
    });
    await s.step('ask-again', async () => { await answerAll(p, [[true, true]]); });
    await s.step('pick-hint', async () => {
      await expect(h1(p)).toHaveText(t('pick.hero'));
      await expect(p.getByText(t('pick.ten'))).toBeVisible();
      await expect(p.getByText('Most important usually means most uncomfortable.')).toHaveCount(0);
    });
    await startBlock(s);
    await p.clock.runFor('02:00:01');
    await s.step('close-no-quote', async () => { // Close asks one plain question and quotes nothing
      await expectClose(p);
      await expect(p.getByText(RULE)).toHaveCount(0);
      await expect(p.getByText('only measure', { exact: false })).toHaveCount(0);
      await expect(p.getByText('Anything left comes forward tomorrow.')).toHaveCount(0);
    });
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(quote(p, t('about.busy'))).toContainText(t('cite.tim'));
      await expect(quote(p, GUISE)).toContainText(t('cite.tim'));
      await expect(p.getByText('No streaks', { exact: false })).toHaveCount(0);
    });
  }),
  'midnight-rollover': journey({ id: 'midnight-rollover', feature: 'returning-user', proves: ['ru-midnight'], strings: ['block.end', 'closed.eyebrow'] }, async (s) => { // a closed day left open past midnight moves to the new day
    const p = s.page;
    await throughToPick(s); await startBlock(s); await p.getByRole('button', { name: t('block.end') }).click();
    await expectClose(p); await answer(p, false, NOTE.no, null); await closeToday(p, false);
    await p.clock.runFor('02:00:00'); // 23:30 -> 01:30 next day, app left open
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await s.step('after-midnight', async () => { await expect(p.getByText(t('closed.eyebrow'))).toHaveCount(0); });
  }),
  'block-across-midnight': journey({ id: 'block-across-midnight', feature: 'block-timer', proves: ['bt-midnight'], strings: ['morning.hero', 'closed.eyebrow'] }, async (s) => { // a block belongs to the day it started; closing it moves to the new day
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('01:00:00'); // 23:30 -> 00:30 next day, app left open
    await s.step('still-running-after-midnight', async () => {
      await expect(h1(p)).toHaveText('Ask for the raise');
      await expect(p.getByRole('timer')).toContainText('1:00:00');
    });
    await p.clock.runFor('01:00:00');
    await s.step('block-complete', async () => { await expectClose(p); });
    await s.step('close', async () => {
      await answer(p, true, NOTE.first, FIRST_DAY);
      await CLOSE_TODAY(p).click();
    });
    await s.step('new-day-welcome', async () => {
      await expect(h1(p)).toHaveText(t('morning.hero'));
      await expect(p.getByText(t('closed.eyebrow'))).toHaveCount(0);
    });
    const st = await s.store(); const d14 = st.days.find((d) => d.date === '2026-10-14');
    if (!d14?.closed || d14.didIt !== true || d14.doneText !== 'Ask for the raise') throw new Error('2026-10-14 not closed as done: ' + JSON.stringify(d14));
    if (!st.days.some((d) => d.date === '2026-10-15')) throw new Error('no 2026-10-15 record: ' + JSON.stringify(st.days.map((d) => d.date)));
  }),
  'block-reload-after-midnight': journey({ id: 'block-reload-after-midnight', feature: 'block-timer', proves: ['bt-midnight', 'ru-carried'], strings: [] }, async (s) => { // a block started before midnight is offered back after a reload
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.setSystemTime(new Date('2026-10-15T00:10:00')); await p.reload();
    await s.step('reload-0010', async () => {
      await expect(h1(p)).toHaveText('Ask for the raise');
      await expect(p.getByRole('timer')).toContainText('1:20:00');
    });
    await p.clock.setSystemTime(new Date('2026-10-15T02:00:00')); await p.reload();
    await s.step('reload-0200', async () => { await expectClose(p); });
  }),
  'close-not-today-count': journey({ id: 'close-not-today-count', feature: 'close-day', proves: ['cd-count-now', 'cd-no-streaks', 'cd-lines'], strings: ['block.end', 'closed.noStreaks'] }, async (s) => { // the first-ever Not today has no count line; a later Not today shows what is already done
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('20:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p); });
    await s.step('first-not-today', async () => {
      await answer(p, false, NOTE.no, null);
      await expect(p.getByRole('main')).not.toContainText(/\d/);
    });
    await s.step('switch-to-yes', async () => { await answer(p, true, NOTE.first, FIRST_DAY); });
    await s.step('switch-back-not-today', async () => { await answer(p, false, NOTE.no, null); });
    await s.step('yes-again', async () => { await answer(p, true, NOTE.first, FIRST_DAY); });
    await s.step('close-today', async () => { await closeToday(p, true); await expect(p.getByText(t('closed.noStreaks'))).toHaveCount(0); }); // a done day says nothing about streaks
    await newDayAt(p, '2026-10-15T07:30:00');
    await ritualDay(s, { item: 'Call the landlord', yes: false, note: NOTE.no, line: count(1) });
    await expect(p.getByText(t('closed.noStreaks'))).toBeVisible(); // Not today, closed: a gentle line, no number
    await expect(p.getByText(count(1), { exact: true })).toHaveCount(0); // gone with Close
    const st = await s.store();
    const got = st.days.map((d) => [d.date, d.didIt, d.doneText]);
    if (JSON.stringify(got) !== JSON.stringify([['2026-10-14', true, 'Ask for the raise'], ['2026-10-15', false, null]])) throw new Error('days stored wrong: ' + JSON.stringify(got));
  }),
};