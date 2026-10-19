// Journeys: first visit (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import { BRAND, fmt, t } from '../../src/copy.ts';
import { NEXT, BACK, ADD, SKIP, NO, h1, listed, row, addItem, answerAll, FIRST_H1, READY, expectFirstWelcome, PUSHED_Q } from '../drive/actions.mjs';
import { journey, J } from '../drive/registry.mjs';

export const firstVisitJourneys = {
  'first-visit': journey({ id: 'first-visit', feature: 'first-visit', proves: ['fv-welcome', 'fv-name', 'fv-back'], strings: [] }, async (s) => { // the same welcome at 08:00 and (late) at 18:57
    const p = s.page;
    await s.step('welcome', async () => {
      await expect(p.getByRole('banner')).toContainText(BRAND);
      await expectFirstWelcome(p);
    });
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
    await expect(h1(p)).toHaveText(PUSHED_Q);
    await expect(p.getByLabel(fmt.steps(1, 3))).toBeVisible();
    await expect(p.getByRole('textbox', { name: PUSHED_Q })).toBeVisible();
    await expect(p.getByRole('button', { name: SKIP })).toBeVisible();
    await s.step('back-to-welcome', async () => { await p.getByRole('button', { name: BACK }).click(); });
    await expect(h1(p)).toHaveText(FIRST_H1);
  }),
  'name-pending-draft': journey({ id: 'name-pending-draft', feature: 'first-visit', proves: ['fv-draft', 'fv-same-answer'], strings: ['name.risky', 'name.anxious'] }, async (s) => { // Next adds a typed-but-not-added draft under the current tag; the same text again tags it or says it's there
    const p = s.page;
    await p.getByRole('button', { name: READY }).click();
    await s.step('pushed-draft', async () => {
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await p.getByRole('textbox').fill('Call mom');
      await p.getByRole('button', { name: NEXT }).click();
    });
    await s.step('risky-has-draft', async () => {
      await expect(h1(p)).toHaveText(t('name.risky'));
      const r = row(p, 'Call mom');
      await expect(r).toBeVisible();
      await expect(r).toHaveText(/Call mom\s*pushed$/);
      await expect(r).toHaveAttribute('aria-pressed', 'false');
      await expect(p.getByRole('textbox')).toHaveValue('');
    });
    await s.step('risky-add', async () => { await addItem(p, 'Ask for the raise'); });
    await s.step('duplicate-same-tag', async () => { // already risky: a gentle note, the draft clears, nothing is copied
      await p.getByRole('textbox').fill(' ask for the RAISE');
      await p.getByRole('button', { name: ADD }).click();
      await expect(p.getByText(fmt.noteAlready('risky'))).toBeVisible();
      await expect(p.getByText('That is already on the list.')).toHaveCount(0);
      await expect(p.getByRole('textbox')).toHaveValue('');
      await expect(listed(p)).toHaveCount(2);
    });
    await s.step('duplicate-other-tag', async () => { // listed as pushed: typing it here marks it risky too
      await p.getByRole('textbox').fill('call mom');
      await p.getByRole('button', { name: ADD }).click();
      await expect(p.getByText(fmt.noteTagged('risky'))).toBeVisible();
      await expect(p.getByRole('textbox')).toHaveValue('');
      await expect(listed(p)).toHaveCount(2);
      await expect(row(p, 'Call mom')).toContainText('risky · pushed');
      await expect(row(p, 'Call mom')).toHaveAttribute('aria-pressed', 'true');
    });
    await s.step('duplicate-then-next', async () => { // a duplicate draft does not block Next
      await p.getByRole('textbox').fill('Call mom');
      await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.anxious'));
    });
    await expect.poll(async () => (await s.store()).days.at(-1).items.map((i) => [i.text, i.tags]))
      .toEqual([['Call mom', ['pushed', 'risky']], ['Ask for the raise', ['risky']]]);
  }),
  'same-answer-two-steps': journey({ id: 'same-answer-two-steps', feature: 'first-visit', proves: ['fv-same-answer', 'fv-listed', 'ps-pushed-label'], strings: ['name.risky', 'name.listedTap', 'name.anxious', 'twoQuestions', 'pick.hero'] }, async (s) => { // same answer on two steps: the thing put off is also the risky one; it is one item with both tags
    const p = s.page;
    const Q = 'Talking to leads';
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
    await s.step('pushed-add', async () => {
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await addItem(p, Q);
      await expect(p.getByRole('listitem').filter({ hasText: Q })).toContainText('pushed');
      await p.getByRole('button', { name: NEXT }).click();
    });
    await s.step('risky-same-text', async () => {
      await expect(h1(p)).toHaveText(t('name.risky'));
      await expect(p.getByText(t('name.listedTap'))).toBeVisible();
      await p.getByRole('textbox').fill(Q);
      await p.getByRole('button', { name: ADD }).click();
      await expect(p.getByText(fmt.noteTagged('risky'))).toBeVisible();
      await expect(p.getByText('That is already on the list.')).toHaveCount(0);
      await expect(p.getByRole('textbox')).toHaveValue('');
      await expect(listed(p)).toHaveCount(1);
      await expect(row(p, Q)).toContainText('risky · pushed');
      await expect(row(p, Q)).toHaveAttribute('aria-pressed', 'true');
      await p.getByRole('button', { name: NEXT }).click();
    });
    await s.step('anxious-tap', async () => {
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await expect(listed(p)).toHaveCount(1);
      await expect(row(p, Q)).toHaveAttribute('aria-pressed', 'false');
      await row(p, Q).click();
      await expect(row(p, Q)).toHaveAttribute('aria-pressed', 'true');
      await expect(row(p, Q)).toContainText('risky · anxious · pushed');
    });
    await s.step('anxious-already', async () => {
      await p.getByRole('textbox').fill(Q);
      await p.getByRole('button', { name: ADD }).click();
      await expect(p.getByText(fmt.noteAlready('risky · anxious · pushed'))).toBeVisible();
      await expect(p.getByRole('textbox')).toHaveValue('');
      await expect(listed(p)).toHaveCount(1);
      await p.getByRole('button', { name: t('twoQuestions') }).click();
    });
    await s.step('ask-once', async () => {
      await expect(p.getByLabel(fmt.steps(1, 1))).toBeVisible();
      await expect(h1(p)).toHaveText(`${Q} risky · anxious · pushed`);
      await answerAll(p, [[true, true]]);
    });
    await s.step('pick-once', async () => {
      await expect(h1(p)).toHaveText(t('pick.hero'));
      const choices = p.locator('.choices').getByRole('button');
      await expect(choices).toHaveCount(1);
      await expect(choices.nth(0)).toHaveText(new RegExp(`${Q}\\s*risky · anxious · pushed`));
    });
    const items = (await s.store()).days.at(-1).items;
    if (items.length !== 1 || items[0].text !== Q || JSON.stringify(items[0].tags) !== '["pushed","risky","anxious"]' || 'tag' in items[0])
      throw new Error('stored items wrong: ' + JSON.stringify(items));
  }),
  'back-to-last-substep': journey({ id: 'back-to-last-substep', feature: 'first-visit', proves: ['fv-back-from-ask', 'ps-look-again'], strings: ['name.risky', 'name.anxious', 'twoQuestions', 'none.hero', 'none.again'] }, async (s) => { // Back from the first Ask item returns to Name's last step and Look again to Ask's last item: the step the user came from
    const p = s.page;
    await s.step('to-ask', async () => {
      await p.getByRole('button', { name: READY }).click();
      await p.getByRole('button', { name: SKIP }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
      await addItem(p, 'Ask for the raise'); await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await addItem(p, 'Tax letter'); await p.getByRole('button', { name: t('twoQuestions') }).click();
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
    });
    await s.step('back-from-first-ask-item', async () => {
      await p.getByRole('button', { name: BACK }).click();
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await expect(p.getByLabel(fmt.steps(3, 3))).toBeVisible();
      await expect(p.getByRole('textbox', { name: t('name.anxious') })).toBeVisible();
      await expect(row(p, 'Ask for the raise')).toBeVisible(); await expect(row(p, 'Tax letter')).toBeVisible();
    });
    await s.step('back-inside-name', async () => { // Back inside Name still goes to the step before
      await p.getByRole('button', { name: BACK }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
      await expect(p.getByLabel(fmt.steps(2, 3))).toBeVisible();
    });
    await s.step('no-to-both', async () => {
      await p.getByRole('button', { name: NEXT }).click();
      await p.getByRole('button', { name: t('twoQuestions') }).click();
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
      await answerAll(p, [[false, false], [false, false]]);
      await expect(h1(p)).toHaveText(t('none.hero'));
    });
    await s.step('look-again', async () => {
      await p.getByRole('button', { name: t('none.again') }).click();
      await expect(h1(p)).toContainText('Tax letter');
      await expect(p.getByLabel(fmt.steps(2, 2))).toBeVisible();
      await expect(h1(p)).toBeFocused(); // the screen change to Ask moves focus to its heading, as on every screen
      for (const q of [0, 1]) await expect(p.locator('.q').nth(q).getByRole('button', { name: NO, exact: true })).toHaveClass(/\bon\b/);
    });
    await s.step('back-inside-ask', async () => { // Back inside Ask still goes to the item before
      await p.getByRole('button', { name: BACK }).click();
      await expect(h1(p)).toContainText('Ask for the raise');
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
    });
    const items = (await s.store()).days.at(-1).items.map((i) => [i.text, i.satisfied, i.leverage]);
    if (JSON.stringify(items) !== JSON.stringify([['Ask for the raise', false, false], ['Tax letter', false, false]])) throw new Error('items or answers lost: ' + JSON.stringify(items));
  }),
  'first-visit-late': journey({ id: 'first-visit-late', feature: 'first-visit', proves: ['fv-welcome-late'], strings: [] }, async (s) => { await J['first-visit'](s); }), // the same welcome at 18:57, after the late hour: the hour line still shows and there is no `Start where you are`
};