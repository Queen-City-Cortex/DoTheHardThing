import { expect } from '@playwright/test';
import { fmt, t } from '../../src/copy.ts';
import { NEXT, BACK, SKIP, h1, addItem, answerAll, READY } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';
import { ASK_YES } from './blind-spots.mjs';

// ---- known gaps: each journey asserts the behavior we want, so it FAILS while the gap is open ----
// Not in `--list` (so `vdt list`, e2e/run.mjs and CI never run them); `--list-gaps` lists them and `node e2e/gaps.mjs` runs
// them against e2e/known-gaps.json, where each has an owner and an expiry. A wanted behavior that is missing is noted with
// `gapOpen`, and the journey ends with one error of our own, `gap open (N of M): ...` (N wanted behaviors still missing of
// the M it checks), the text the entry's `fails_with` matches with its count, so a half-fixed gap reads WRONG, not XFAIL.
function gapOpen() {
  const open = []; let total = 0;
  return {
    want: (ok, what, saw) => { total++; if (!ok) open.push(`${what} (saw ${JSON.stringify(saw)})`); },
    end: () => { if (open.length) throw new Error(`gap open (${open.length} of ${total}): ${open.join('; ')}`); },
  };
}
const heading = async (p) => { await expect(h1(p)).toBeVisible(); return (await h1(p).textContent()).trim(); };
export const gapJourneys = {
  'gap-reload-keeps-step': journey({ id: 'gap-reload-keeps-step', feature: 'resilience', proves: [], strings: ['name.risky', 'twoQuestions'] }, async (s) => { // wanted: a reload during Name or Ask stays on the step the user was on
    const p = s.page; const gap = gapOpen();
    await s.step('name-step-2', async () => {
      await p.getByRole('button', { name: READY }).click();
      await addItem(p, 'Talking to leads'); await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
    });
    await s.step('reload-on-name-step-2', async () => { await p.reload(); });
    const onName = await heading(p);
    gap.want(onName === t('name.risky'), 'a reload keeps the step the user was on: Name step 2', onName);
    await s.step('back-to-step-2', async () => { // today's way back: Welcome, then Next up to step 2
      if (onName !== t('name.risky')) await p.getByRole('button', { name: READY }).click();
      while ((await heading(p)) !== t('name.risky')) await p.getByRole('button', { name: NEXT }).click();
    });
    await s.step('ask-item-2', async () => {
      await addItem(p, 'Ask for the raise'); await p.getByRole('button', { name: NEXT }).click();
      await addItem(p, 'Tax letter'); await p.getByRole('button', { name: t('twoQuestions') }).click();
      await ASK_YES(p, 0).click(); await ASK_YES(p, 1).click(); await p.getByRole('button', { name: NEXT }).click();
      await expect(p.getByLabel(fmt.steps(2, 3))).toBeVisible();
    });
    await s.step('reload-on-ask-item-2', async () => { await p.reload(); });
    const onAsk = await heading(p);
    gap.want(onAsk.startsWith('Ask for the raise') && await p.getByLabel(fmt.steps(2, 3)).isVisible(), 'a reload keeps the step the user was on: Ask item 2 of 3', onAsk);
    gap.end();
  }),
  'gap-back-to-last-substep': journey({ id: 'gap-back-to-last-substep', feature: 'first-visit', proves: [], strings: ['name.risky', 'name.anxious', 'twoQuestions', 'none.hero', 'none.again'] }, async (s) => { // wanted: Back (and Look again) return to the sub-step the user came from
    const p = s.page; const gap = gapOpen();
    await s.step('to-ask', async () => {
      await p.getByRole('button', { name: READY }).click();
      await p.getByRole('button', { name: SKIP }).click();
      await expect(h1(p)).toHaveText(t('name.risky'));
      await addItem(p, 'Ask for the raise'); await p.getByRole('button', { name: NEXT }).click();
      await expect(h1(p)).toHaveText(t('name.anxious'));
      await addItem(p, 'Tax letter'); await p.getByRole('button', { name: t('twoQuestions') }).click();
      await expect(p.getByLabel(fmt.steps(1, 2))).toBeVisible();
    });
    await s.step('back-from-first-ask-item', async () => { await p.getByRole('button', { name: BACK }).click(); });
    const fromAsk = await heading(p);
    gap.want(fromAsk === t('name.anxious'), "Back from the first Ask item returns to the step the user came from: Name's last step", fromAsk);
    await s.step('no-to-both', async () => {
      while (!(await p.getByRole('button', { name: t('twoQuestions') }).isVisible())) await p.getByRole('button', { name: NEXT }).click();
      await p.getByRole('button', { name: t('twoQuestions') }).click();
      await answerAll(p, [[false, false], [false, false]]);
      await expect(h1(p)).toHaveText(t('none.hero'));
    });
    await s.step('look-again', async () => { await p.getByRole('button', { name: t('none.again') }).click(); });
    const fromPick = await heading(p);
    gap.want(fromPick.startsWith('Tax letter') && await p.getByLabel(fmt.steps(2, 2)).isVisible(), 'Look again returns to the step the user came from: the last Ask item', fromPick);
    gap.end();
  }),
};