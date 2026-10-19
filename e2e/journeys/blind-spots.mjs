import { expect } from '@playwright/test';
import { fmt, t } from '../../src/copy.ts';
import { NEXT, BACK, DONE, ABOUT, NO, YES_LABEL, SKIP, h1, addItem, READY, throughToPick, startBlock, YES, SEE_DAYS, NOTE, FIRST_DAY, expectClose, answer, closeToday, newDayAt, DAYS_H1, expectFraming, expectLateOnlyWelcome, expectWelcomeBack } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';

// ---- blind spots: behaviors that only a journey can see, each found by a mutation that every other journey let through ----
const radio = (p, name) => p.getByRole('radio', { name, exact: true });
// Pick's length radios: exactly `on` is checked; Start is pressed without touching a radio, so the timer shows the default
async function startWithDefault(s, { on, off, timer, label = 'pick-default' }) {
  const p = s.page;
  await s.step(label, async () => {
    await expect(radio(p, on)).toHaveAttribute('aria-checked', 'true');
    for (const name of off) await expect(radio(p, name)).toHaveAttribute('aria-checked', 'false');
    await p.getByRole('button', { name: /Ask for the raise/ }).click();
    await p.getByRole('button', { name: t('pick.start') }).click();
  });
  await expect(p.getByRole('timer')).toContainText(timer);
}
// Pick's line under the lengths: the morning one or the late one (fmt.pickLine), never both
async function expectPickLine(p, late) {
  await expect(p.getByText(fmt.pickLine(false, late), { exact: true })).toBeVisible();
  await expect(p.getByText(fmt.pickLine(false, !late), { exact: true })).toHaveCount(0);
}
export const ASK_YES = (p, q) => p.locator('.q').nth(q).getByRole('button', { name: YES_LABEL, exact: true });
const ASK_NO = (p, q) => p.locator('.q').nth(q).getByRole('button', { name: NO, exact: true });
export const blindSpotJourneys = {
  'close-first-day-after-nav': journey({ id: 'close-first-day-after-nav', feature: 'close-day', proves: ['cd-lines'], strings: ['close.firstCount', 'close.first', 'close.hero', 'yourDays'] }, async (s) => { // the first-day line stays on Close after Your days (Back or Done) and About, with Yes still on
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p); });
    await s.step('answer-yes', async () => { await answer(p, true, NOTE.first, FIRST_DAY); });
    // each way out of Close and back: the same Close, Yes on, the first-Yes note and the first-day line
    const stillFirst = async () => {
      await expect(h1(p)).toHaveText(t('close.hero'));
      await expect(YES(p)).toHaveClass(/\bon\b/);
      await expect(p.getByText(NOTE.first, { exact: true })).toBeVisible();
      await expect(p.getByText(FIRST_DAY, { exact: true })).toBeVisible();
      await expect(p.getByRole('main')).not.toContainText(/\d/);
    };
    await s.step('days-back-to-close', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); await p.getByRole('button', { name: BACK }).click(); await stillFirst(); });
    await s.step('days-done-to-close', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); await p.getByRole('button', { name: DONE }).click(); await stillFirst(); });
    await s.step('about-done-to-close', async () => { await p.getByRole('button', { name: ABOUT }).click(); await expect(h1(p)).toHaveText(ABOUT); await p.getByRole('button', { name: DONE }).click(); await stillFirst(); });
    await s.step('about-days-to-close', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await p.getByRole('button', { name: t('yourDays') }).click(); await expect(h1(p)).toHaveText(DAYS_H1);
      await p.getByRole('button', { name: DONE }).click(); await expect(h1(p)).toHaveText(ABOUT);
      await p.getByRole('button', { name: DONE }).click(); await stillFirst();
    });
    await s.step('close-today', async () => { await closeToday(p, true); });
  }),
  'ask-back': journey({ id: 'ask-back', feature: 'pick-and-start', proves: ['ps-ask-back'], strings: ['twoQuestions', 'name.risky', 'name.anxious'] }, async (s) => { // Back on Ask: the second item goes back to the first with its answers kept; the first goes back to Name with the items kept
    const p = s.page;
    await s.step('to-ask', async () => {
      await p.getByRole('button', { name: READY }).click();
      await p.getByRole('button', { name: SKIP }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
      await addItem(p, 'Ask for the raise'); await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await addItem(p, 'Tax letter'); await p.getByRole('button', { name: t('twoQuestions') }).click();
    });
    await s.step('ask-first', async () => {
      await expect(h1(p)).toContainText('Ask for the raise');
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
      await ASK_YES(p, 0).click(); await ASK_NO(p, 1).click();
      await p.getByRole('button', { name: NEXT }).click();
    });
    await s.step('ask-second', async () => {
      await expect(h1(p)).toContainText('Tax letter');
      await expect(p.getByLabel(fmt.steps(2, 2))).toBeVisible();
      await ASK_NO(p, 0).click(); await ASK_YES(p, 1).click();
    });
    await s.step('back-to-first-item', async () => {
      await p.getByRole('button', { name: BACK }).click();
      await expect(h1(p)).toContainText('Ask for the raise');
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
      await expect(ASK_YES(p, 0)).toHaveClass(/\bon\b/); await expect(ASK_NO(p, 0)).not.toHaveClass(/\bon\b/);
      await expect(ASK_NO(p, 1)).toHaveClass(/\bon\b/); await expect(ASK_YES(p, 1)).not.toHaveClass(/\bon\b/);
    });
    await s.step('back-to-name', async () => {
      await p.getByRole('button', { name: BACK }).click();
      // Name opens on its last step, the anxious one the user came from (back-to-last-substep in first-visit.md)
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await expect(p.getByLabel(fmt.steps(3, 3))).toBeVisible();
      await expect(p.getByRole('textbox')).toBeVisible();
    });
    const items = (await s.store()).days.at(-1).items.map((i) => [i.text, i.satisfied, i.leverage]);
    if (JSON.stringify(items) !== JSON.stringify([['Ask for the raise', true, false], ['Tax letter', false, true]])) throw new Error('items or answers lost after Back: ' + JSON.stringify(items));
  }),
  'late-cutoffs': journey({ id: 'late-cutoffs', feature: 'returning-user', proves: ['ru-late-cutoffs', 'ps-block-copy'], strings: ['morning.hero', 'bad.late', 'bad.hero', 'bad.missed'] }, async (s) => { // the one late cutoff, 12:00, for the Welcome and for Pick's line
    const p = s.page;
    await throughToPick(s);
    await newDayAt(p, '2026-10-15T11:59:00');
    await s.step('1159-morning', async () => {
      await expect(h1(p)).toHaveText(t('morning.hero'));
      await expectFraming(p, false);
      await p.getByRole('button', { name: READY }).click(); await addItem(p, 'Call mom'); // content on 10-15, so 10-16 is not a missed day
    });
    await newDayAt(p, '2026-10-16T12:00:00');
    await s.step('1200-late', async () => {
      await expectLateOnlyWelcome(p);
      await p.getByRole('button', { name: READY }).click(); await addItem(p, 'Call dad'); // content on 10-16, so 10-17 is not a missed day
    });
    await newDayAt(p, '2026-10-17T11:59:00');
    await s.step('1159-morning-again', async () => {
      await expect(h1(p)).toHaveText(t('morning.hero'));
      await expectFraming(p, false);
    });
    await throughToPick(s);
    await s.step('1159-pick-morning-line', async () => { await expectPickLine(p, false); });
    await p.clock.runFor('01:00'); // 12:00: Pick reads the hour when it draws, so choosing an item shows the change
    await s.step('1200-pick-late-line', async () => {
      await p.getByRole('button', { name: /Ask for the raise/ }).click();
      await expectPickLine(p, true);
    });
    await newDayAt(p, '2026-10-19T08:00:00'); // 10-18 missed
    await s.step('missed-morning', async () => { await expectWelcomeBack(p, false); });
    await newDayAt(p, '2026-10-21T12:00:00'); // 10-19 was a peek, so still missed days (from 10-17): the full welcome back, late framing
    await s.step('missed-late', async () => { await expectWelcomeBack(p, true); });
  }),
  'pick-default-length': journey({ id: 'pick-default-length', feature: 'pick-and-start', proves: ['ps-default-length', 'ps-small'], strings: ['pick.start', 'bad.shorter', 'pick.smallNote'] }, async (s) => { // Start with no radio touched: 2h, or 1½h with the shorter-block toggle
    const p = s.page;
    await throughToPick(s);
    await startWithDefault(s, { on: '2h', off: ['2½h', '3h'], timer: '2:00:00' });
    await s.step('end-and-close', async () => {
      await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p);
      await answer(p, false, NOTE.no, null); await closeToday(p, false);
    });
    if ((await s.store()).days.at(-1).block?.targetMin !== 120) throw new Error('default block not stored as 120 min: ' + JSON.stringify((await s.store()).days.at(-1).block));
    await newDayAt(p, '2026-10-15T14:00:00');
    await s.step('toggle-shorter', async () => { await p.getByRole('checkbox', { name: t('bad.shorter') }).check(); });
    await throughToPick(s);
    await expect(p.getByText(t('pick.smallNote'))).toBeVisible();
    await startWithDefault(s, { on: '1½h', off: ['1h', '2h'], timer: '1:30:00', label: 'pick-default-shorter' });
    const d = (await s.store()).days.find((x) => x.date === '2026-10-15');
    if (d?.block?.targetMin !== 90) throw new Error('default shorter block not stored as 90 min: ' + JSON.stringify(d?.block));
  }),
};