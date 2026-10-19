// Journeys: blocks (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import { t } from '../../src/copy.ts';
import { HOLDING, h1, FIRST_H1, READY, PUSHED_Q, throughToPick, startBlock, NOTE, FIRST_DAY, expectClose, answer, closeToday, newDayAt, nextMorningLeftover } from '../drive/actions.mjs';
import { journey, J } from '../drive/registry.mjs';

export const blocksJourneys = {
  'peek-then-return': journey({ id: 'peek-then-return', feature: 'returning-user', proves: ['ru-peek'], strings: [] }, async (s) => { // empty evening visit must not make next morning look like a return
    const p = s.page;
    await s.step('evening-peek', async () => { await expect(h1(p)).toHaveText(FIRST_H1); });
    await p.clock.setSystemTime(new Date('2026-10-15T08:00:00')); await p.reload();
    await s.step('next-morning', async () => { await expect(h1(p)).toHaveText(FIRST_H1); });
  }),
  'start-end-block': journey({ id: 'start-end-block', feature: 'block-timer', proves: ['bt-countdown', 'bt-end', 'ps-name', 'ps-ask', 'ps-start'], strings: ['block.end'] }, async (s) => {
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('block-running', async () => { await expect(p.getByRole('timer')).toContainText('1:55:00'); });
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); });
    await expectClose(p);
    const st = await s.store(); const d = st.days.at(-1);
    if (d.block?.endReason !== 'stopped' || d.didIt !== null) throw new Error('stored block not stopped or already answered: ' + JSON.stringify(d));
  }),
  'short-block-yes-counts': journey({ id: 'short-block-yes-counts', feature: 'block-timer', proves: ['bt-end', 'cd-answer', 'cd-leftovers'], strings: ['block.end', 'name.pushed.hint'] }, async (s) => { // ending after 5 min and answering Yes counts the day: no verdict on the block, the item is done
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); });
    await s.step('close-asks', async () => { await expectClose(p); });
    await s.step('answer-yes', async () => { await answer(p, true, NOTE.first, FIRST_DAY); });
    await s.step('close-today', async () => { await closeToday(p, true); });
    const d = (await s.store()).days.at(-1);
    if (d.didIt !== true || d.doneText !== 'Ask for the raise' || !d.closed || d.block?.endReason !== 'stopped') throw new Error('short block Yes stored wrong: ' + JSON.stringify(d));
    await newDayAt(p, '2026-10-15T07:30:00');
    await s.step('next-morning-done-item-gone', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(p.getByRole('button', { name: /Ask for the raise/ })).toHaveCount(0);
      await expect(p.getByText(t('name.pushed.hint'))).toBeVisible(); // nothing left over
    });
  }),
  'small-block-modified': journey({ id: 'small-block-modified', feature: 'returning-user', proves: ['ru-small', 'ps-small'], strings: ['bad.hero', 'bad.shorter', 'pick.smallNote'] }, async (s) => { // day 1 ritual, day 2 at 14:00 picks the shorter option; the 1h block ends, Not today keeps the item for tomorrow
    const p = s.page;
    await throughToPick(s);
    await p.clock.setSystemTime(new Date('2026-10-15T14:00:00')); await p.reload();
    await s.step('toggle-shorter', async () => {
      await expect(h1(p)).toHaveText(t('bad.hero'));
      await p.getByRole('checkbox', { name: t('bad.shorter') }).check();
    });
    await throughToPick(s);
    await expect(p.getByText(t('pick.smallNote'))).toBeVisible();
    await expect(p.getByRole('radio', { name: '2h', exact: true })).toBeVisible(); // 120 stays offered: a full block
    await startBlock(s, 'Ask for the raise', '1h', '1:00:00');
    await p.clock.runFor('01:00:01');
    await s.step('close-asks', async () => { await expectClose(p); });
    await s.step('answer-not-today', async () => { await answer(p, false, NOTE.no, null); }); // nothing done yet: no count line at all
    await s.step('close-today', async () => { await closeToday(p, false); });
    const d = (await s.store()).days.find((x) => x.date === '2026-10-15');
    if (d?.didIt !== false || d.doneText !== null || d.block?.endReason !== 'complete' || d.block?.targetMin !== 60) throw new Error('1h block stored wrong: ' + JSON.stringify(d));
    await nextMorningLeftover(s, '2026-10-16T08:00:00');
  }),
  'yes-clears-item': journey({ id: 'yes-clears-item', feature: 'close-day', proves: ['cd-leftovers'], strings: [] }, async (s) => { // a Yes takes the one thing off tomorrow's leftovers; the rest still comes forward
    const p = s.page;
    await J['close-day'](s, { answers: [[true, true], [true, false]] }); // Tax letter Yes/No so it carries (No/No would not)
    await p.clock.setSystemTime(new Date('2026-10-15T07:30:00')); await p.reload();
    await s.step('next-morning-leftovers', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(p.getByRole('button', { name: /Tax letter.*anxious · pushed 1×/ })).toBeVisible();
      await expect(p.getByRole('button', { name: /Ask for the raise/ })).toHaveCount(0);
    });
  }),
  'step-away-broken': journey({ id: 'step-away-broken', feature: 'block-timer', proves: ['bt-broken'], strings: ['block.stepAway', 'block.back'] }, async (s) => {
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await s.step('step-away', async () => { await p.getByRole('button', { name: t('block.stepAway') }).click(); await expect(p.getByText(HOLDING)).toBeVisible(); });
    await p.clock.fastForward('11:00');
    await s.step('back-after-11min', async () => { const b = p.getByRole('button', { name: t('block.back') }); if (await b.count()) await b.click(); });
    await expectClose(p);
    await expect(p.getByText('The break ran past 10 minutes', { exact: false })).toHaveCount(0);
    const d = (await s.store()).days.at(-1);
    if (d.block?.endReason !== 'broken') throw new Error('block not broken: ' + JSON.stringify(d.block));
  }),
  'one-break-per-block': journey({ id: 'one-break-per-block', feature: 'block-timer', proves: ['bt-one-break'], strings: ['block.pauseHint', 'block.stepAway', 'block.onePause', 'block.back', 'block.pauseUsed'] }, async (s) => { // one short step-away per block; after it, Step away is gone
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await expect(p.getByText(t('block.pauseHint'))).toBeVisible();
    await p.clock.runFor('05:00');
    await s.step('step-away', async () => { await p.getByRole('button', { name: t('block.stepAway') }).click(); await expect(p.getByText(HOLDING)).toBeVisible(); });
    await expect(p.getByText(t('block.onePause'))).toBeVisible();
    await p.clock.runFor('03:00');
    await s.step('back-after-3min', async () => { await p.getByRole('button', { name: t('block.back') }).click(); });
    await expect(p.getByRole('button', { name: t('block.stepAway') })).toHaveCount(0);
    await expect(p.getByText(t('block.pauseUsed'))).toBeVisible();
    await expect(p.getByRole('timer')).toContainText('1:55:00');
    await p.clock.runFor('01:00');
    await s.step('still-counting', async () => { await expect(p.getByRole('timer')).toContainText('1:54:00'); });
    const b = (await s.store()).days.at(-1).block;
    if (b.breaks !== 1 || b.pausedAt !== null || b.endedAt !== null) throw new Error('stored block wrong: ' + JSON.stringify(b));
  }),
  'pushed-zero-label': journey({ id: 'pushed-zero-label', feature: 'pick-and-start', proves: ['ps-pushed-label'], strings: [] }, async (s) => { // a pushed item added today (pushedCount 0) reads 'pushed', never 'pushed 0×'
    const p = s.page;
    await throughToPick(s, { pushed: ['Call mom'] });
    await s.step('pick-pushed-label', async () => {
      const b = p.getByRole('button', { name: /Call mom/ });
      await expect(b).toBeVisible();
      await expect(b).toContainText('pushed');
      await expect(b).not.toContainText('0×');
    });
  }),
  'pick-order-risky-first': journey({ id: 'pick-order-risky-first', feature: 'pick-and-start', proves: ['ps-order'], strings: [] }, async (s) => { // Pick lists risky (rejection or conflict) first, even ahead of a pushed item written earlier
    const p = s.page;
    await throughToPick(s, { pushed: ['Tax letter'], risky: ['Ask for the raise'], anxious: [], answers: [[true, true], [true, true]] });
    await s.step('pick-order', async () => {
      const choices = p.locator('.choices').getByRole('button');
      await expect(choices).toHaveCount(2);
      await expect(choices.nth(0)).toHaveText(/Ask for the raise/);
      await expect(choices.nth(1)).toHaveText(/Tax letter/);
    });
  }),
};