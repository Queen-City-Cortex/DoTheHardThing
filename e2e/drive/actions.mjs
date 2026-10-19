// Reusable user actions and the labels they press (real UI only), shared by every journey group in e2e/journeys/.

import { expect } from '@playwright/test';
import { TALK_URL, fmt, t } from '../../src/copy.ts';

// the short labels the journeys press and look for, each one entry (YES_LABEL, since YES is the Close Yes button below)
export const NEXT = t('next'); export const BACK = t('back'); export const DONE = t('done'); export const ABOUT = t('about'); export const NO = t('no');
export const YES_LABEL = t('close.yes'); export const PICK_ONE = t('pick.eyebrow'); export const ADD = t('name.add'); export const SKIP = t('name.skip');
export const OFF = t('about.off'); export const HOLDING = t('block.holding'); export const EARLIER = t('days.earlier');

// ---- reusable user actions (real UI only) ----
export const h1 = (p) => p.getByRole('heading', { level: 1 });
// the Name list: plain rows with × on step 1, toggle rows (aria-pressed) in the `Already on your list` group on steps 2 and 3
const LISTED = t('name.listed');
export const listed = (p) => p.getByRole('group', { name: LISTED }).getByRole('button');
export const row = (p, text) => p.getByRole('listitem').or(listed(p)).filter({ hasText: text });
export async function addItem(p, text) {
  await p.getByRole('textbox').fill(text);
  await p.getByRole('button', { name: ADD }).click();
  await expect(row(p, text)).toBeVisible();
}
export async function answerAll(p, answers) { // answers: [[sat, lev], ...] in guided order
  for (let i = 0; i < answers.length; i++) {
    const qs = p.locator('.q');
    await qs.nth(0).getByRole('button', { name: answers[i][0] ? YES_LABEL : NO }).click();
    await qs.nth(1).getByRole('button', { name: answers[i][1] ? YES_LABEL : NO }).click();
    await p.getByRole('button', { name: i === answers.length - 1 ? PICK_ONE : NEXT }).click();
  }
}
export const FIRST_H1 = t('first.hero');
/** A RegExp source that matches `s` literally: copy text often ends in `.` or `?`. */
export const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The Your days row on About: its label, then the count (none before the first day) and the arrow. */
export const daysRow = (total) => new RegExp(`^${rx(t('yourDays'))}\\s*${rx(fmt.daysLink(total))}$`);
export const READY = new RegExp(`^(${rx(t('first.start'))}|${rx(t('welcome.ready'))})$`); // `Start` on the first-ever visit, `I'm ready` on every returning welcome
export const TALK = t('talk.link');
const STEPS3 = [['first.step1', 'first.step1.d'], ['first.step2', 'first.step2.d'], ['first.step3', 'first.step3.d']].map(([a, b]) => [t(a), t(b)]);
export const HOUR_LINE = t('welcome.hour');
export const ASSURE = t('first.assure');
// the first-ever visit's welcome, at any hour: the promise, three numbered steps, the attribution and talk link, Start, the assurance line
export async function expectFirstWelcome(p) {
  await expect(h1(p)).toHaveText(FIRST_H1);
  await expect(p.getByText(t('first.eyebrow'), { exact: true })).toBeVisible();
  const how = p.getByRole('listitem'); await expect(how).toHaveCount(3);
  for (const [i, [title, d]] of STEPS3.entries()) await expect(how.nth(i)).toHaveText(`${i + 1}${title}${d}`);
  await expect(p.getByText(t('first.source'))).toBeVisible();
  const link = p.getByRole('link', { name: TALK }); await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', TALK_URL); await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', /noreferrer/);
  await expect(p.getByRole('button', { name: t('first.start'), exact: true })).toBeVisible();
  await expect(p.getByRole('button', { name: t('welcome.ready') })).toHaveCount(0);
  await expect(p.getByText(ASSURE, { exact: true })).toBeVisible();
  // the talk's [3:55] hour-before advice sits under Start, above the assurance line, at any hour
  await expect(p.getByText(HOUR_LINE, { exact: true })).toBeVisible();
  const y = async (l) => (await l.boundingBox()).y;
  const [ys, yh, ya] = [await y(p.getByRole('button', { name: t('first.start'), exact: true })), await y(p.getByText(HOUR_LINE, { exact: true })), await y(p.getByText(ASSURE, { exact: true }))];
  if (!(ys < yh && yh < ya)) throw new Error(`welcome order: Start ${ys}, hour line ${yh}, assurance ${ya}`);
  for (const gone of ['Welcome back', 'Later start today', t('welcome.eyebrow.morning'), t('welcome.eyebrow.late')]) await expect(p.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(p.locator('body')).not.toContainText(/\u2014/); // no em dash
}
export const PUSHED_Q = t('name.pushed');
export const STEP0_HINT = t('name.leftovers');
// answers default to Yes/Yes on the first item in guided order and No/No (set aside, not carried) on the rest
export async function throughToPick(s, { pushed = [], risky = ['Ask for the raise'], anxious = ['Tax letter'], answers } = {}) {
  const p = s.page;
  await s.step('welcome', async () => {});
  await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
  await s.step('pushed', async () => {
    await expect(h1(p)).toHaveText(PUSHED_Q);
    await expect(p.getByLabel(fmt.steps(1, 3))).toBeVisible();
    await expect(p.getByRole('textbox', { name: PUSHED_Q })).toBeVisible();
    for (const text of pushed) await addItem(p, text);
    await p.getByRole('button', { name: pushed.length ? NEXT : SKIP }).click();
  });
  await s.step('risky', async () => {
    await expect(h1(p)).toHaveText(t('name.risky'));
    for (const text of risky) await addItem(p, text);
    await p.getByRole('button', { name: NEXT }).click();
  });
  await s.step('anxious', async () => {
    await expect(h1(p)).toHaveText(t('name.anxious'));
    for (const text of anxious) await addItem(p, text);
    await p.getByRole('button', { name: t('twoQuestions') }).click();
  });
  await s.step('ask', async () => { await answerAll(p, answers ?? [...pushed, ...risky, ...anxious].map((_, i) => (i === 0 ? [true, true] : [false, false]))); });
  await expect(h1(p)).toHaveText(t('pick.hero'));
}
export async function startBlock(s, item = 'Ask for the raise', length = '2h', timer = '2:00:00') {
  const p = s.page;
  await s.step('pick', async () => {
    const start = p.getByRole('button', { name: t('pick.start') });
    await expect(start).toBeDisabled();
    await p.getByRole('button', { name: new RegExp(item) }).click();
    await p.getByRole('radio', { name: length, exact: true }).click();
    await expect(start).toBeEnabled();
    await start.click();
  });
  await expect(p.getByRole('timer')).toContainText(timer);
}
// Close asks the user, whatever the block did. The old verdicts must never show again.
const VERDICT = /a start, not a full block|got its block/;
export async function noVerdict(p) { await expect(p.locator('body')).not.toContainText(VERDICT); }
export const YES = (p) => p.getByRole('button', { name: t('close.yes'), exact: true });
const NOT_TODAY = (p) => p.getByRole('button', { name: t('close.notToday') });
export const CLOSE_TODAY = (p) => p.getByRole('button', { name: t('close.today') });
export const SEE_DAYS = (p) => p.getByRole('button', { name: t('seeDays') });
export const NOTE = { first: t('close.first'), yes: t('close.good'), no: t('close.alright') };
export const FIRST_DAY = t('close.firstCount');
export const count = (n) => fmt.closeCount(fmt.daysWord(n));
// Close before an answer: the question, the item, Yes / Not today, nothing chosen, Close today disabled, no quote, no verdict
export async function expectClose(p, item = 'Ask for the raise') {
  await expect(p.getByText(t('close.eyebrow'), { exact: true })).toBeVisible();
  await expect(h1(p)).toHaveText(t('close.hero'));
  await expect(p.getByText(fmt.closeItem(item))).toBeVisible();
  await expect(YES(p)).not.toHaveClass(/\bon\b/);
  await expect(NOT_TODAY(p)).not.toHaveClass(/\bon\b/);
  await expect(CLOSE_TODAY(p)).toBeDisabled();
  await expect(p.getByRole('blockquote')).toHaveCount(0);
  await expect(SEE_DAYS(p)).toHaveCount(0);
  await expect(p.getByText(/since you started/)).toHaveCount(0);
  await expect(p.getByText('The full block ran.')).toHaveCount(0);
  await noVerdict(p);
}
// answer on Close: the chosen button is on, the note shows, Close today is enabled; `line` is the count line or null for none
export async function answer(p, yes, note, line) {
  await (yes ? YES(p) : NOT_TODAY(p)).click();
  await expect(yes ? YES(p) : NOT_TODAY(p)).toHaveClass(/\bon\b/);
  await expect(yes ? NOT_TODAY(p) : YES(p)).not.toHaveClass(/\bon\b/);
  await expect(p.getByText(note, { exact: true })).toBeVisible();
  if (line) await expect(p.getByText(line, { exact: true })).toBeVisible();
  else { await expect(p.getByText(/since you started/)).toHaveCount(0); await expect(p.getByText(FIRST_DAY)).toHaveCount(0); }
  await expect(SEE_DAYS(p)).toBeVisible();
  await expect(CLOSE_TODAY(p)).toBeEnabled();
  await noVerdict(p);
}
export async function closeToday(p, didIt) {
  await CLOSE_TODAY(p).click();
  await expect(p.getByText(t('closed.eyebrow'))).toBeVisible();
  await expect(h1(p)).toHaveText(t(didIt ? 'closed.done' : 'closed.fresh'));
  await expect(SEE_DAYS(p)).toBeVisible();
  await noVerdict(p);
}
// one whole day through the UI: ritual with one risky item, a block ended after `end`, then the answer and Close today
export async function ritualDay(s, { item = 'Ask for the raise', yes, note, line, end = '05:00' }) {
  const p = s.page;
  await throughToPick(s, { risky: [item], anxious: [] }); await startBlock(s, item);
  await p.clock.runFor(end);
  await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p, item); });
  await s.step(yes ? 'answer-yes' : 'answer-not-today', async () => { await answer(p, yes, note, line); });
  await s.step('close-today', async () => { await closeToday(p, yes); });
}
export async function newDayAt(p, at) { await p.clock.setSystemTime(new Date(at)); await p.reload(); }
// the history screen
export const DAYS_H1 = t('days.hero');
const dateRows = (p, month) => p.getByRole('list', { name: month }).getByRole('listitem');
export async function expectHistory(p, { total, month, rows = [], absent = [], earlier = [] }) {
  await expect(p.getByText(t('yourDays'), { exact: true })).toBeVisible();
  await expect(h1(p)).toHaveText(DAYS_H1);
  await expect(p.getByRole('button', { name: DONE })).toBeVisible();
  await expect(p.getByRole('button', { name: BACK })).toBeVisible();
  await expect(p.getByText(t('days.only'))).toBeVisible();
  await expect(p.getByText(fmt.daysCount(fmt.daysWord(total)), { exact: true })).toBeVisible();
  if (month) {
    await expect(p.getByText(fmt.monthLine(month, fmt.daysWord(rows.length)), { exact: true })).toBeVisible();
    await expect(dateRows(p, month)).toHaveCount(rows.length);
    for (const [i, [d, text]] of rows.entries()) await expect(dateRows(p, month).nth(i)).toHaveText(new RegExp(`^${d}\\s*${text}$`));
  }
  for (const d of absent) await expect(p.getByText(d, { exact: true })).toHaveCount(0);
  if (earlier.length) {
    await expect(p.getByText(EARLIER, { exact: true })).toBeVisible();
    const ms = p.getByRole('list', { name: EARLIER }).getByRole('listitem');
    await expect(ms).toHaveCount(earlier.length);
    for (const [i, [m, n]] of earlier.entries()) await expect(ms.nth(i)).toHaveText(new RegExp(`^${m}\\s*${n}$`));
  } else await expect(p.getByText(EARLIER, { exact: true })).toHaveCount(0);
  await expect(p.getByRole('main')).not.toContainText(/\b0\b/); // never a zero
  await noVerdict(p);
}
export async function nextMorningLeftover(s, at, label = 'next-morning-leftover') {
  const p = s.page;
  await p.clock.setSystemTime(new Date(at)); await p.reload();
  await s.step(label, async () => {
    await p.getByRole('button', { name: READY }).click();
    await expect(h1(p)).toHaveText(PUSHED_Q);
    await expect(p.getByRole('button', { name: /Ask for the raise.*risky · pushed 1×/ })).toBeVisible(); // keeps its original tag
  });
}

// welcome framing by the hour: before 12:00 `Before email` plus the hour-before line, from 12:00 `Start where you are` and no line
export async function expectFraming(p, late) {
  const lateEyebrow = t('welcome.eyebrow.late'), morningEyebrow = t('welcome.eyebrow.morning');
  const [on, off] = late ? [lateEyebrow, morningEyebrow] : [morningEyebrow, lateEyebrow];
  await expect(p.getByText(on, { exact: true })).toBeVisible();
  await expect(p.getByText(off, { exact: true })).toHaveCount(0);
  if (late) await expect(p.getByText(HOUR_LINE)).toHaveCount(0); else await expect(p.getByText(HOUR_LINE)).toBeVisible();
}
// the lines of the full welcome back, which a late start with no missed days leaves out
const WELCOME_BACK = ['bad.hero', 'bad.everybody', 'bad.vonnegut', 'bad.notAlone'];
const SHORTER = t('bad.shorter');
// a late start with no missed days: `Later start today.` is the heading, the late framing, the shorter-block toggle and
// I'm ready, and nothing of the welcome back
export async function expectLateOnlyWelcome(p) {
  await expect(h1(p)).toHaveText(t('bad.late'));
  await expectFraming(p, true);
  await expect(p.getByRole('checkbox', { name: SHORTER })).toBeVisible();
  await expect(p.getByRole('button', { name: READY })).toBeVisible();
  for (const id of WELCOME_BACK) await expect(p.getByText(t(id))).toHaveCount(0);
  await expect(p.getByRole('blockquote')).toHaveCount(0);
}
// missed days, late or not: the full welcome back with `It’s been a few days.`, its talk lines and the toggle; the
// framing follows the hour
export async function expectWelcomeBack(p, late) {
  await expect(h1(p)).toHaveText(t('bad.hero'));
  await expect(p.getByText(t('bad.missed'))).toBeVisible();
  await expect(p.getByText(t('bad.late'))).toHaveCount(0);
  for (const id of WELCOME_BACK.slice(1)) await expect(p.getByText(t(id))).toBeVisible();
  await expect(p.getByRole('checkbox', { name: SHORTER })).toBeVisible();
  await expectFraming(p, late);
}
// quoted from the talk, word for word
export const RULE = 'What you do is more important than how you do everything else, and doing something well does not make it important. Material over method, the what over the how.';
export const GUISE = t('guise');
export const quote = (p, text) => p.getByRole('blockquote').filter({ hasText: text });