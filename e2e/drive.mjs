// Headless Playwright journeys for Do The Hard Thing. Own Chromium, fresh context per journey.
// Run through e2e/vdt journey <name>. Times are America/New_York local (context timezone).
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
// the app's own copy: Node 22 strips the types (erasable TypeScript only), so a wording change in src/copy.ts moves these assertions too
import { BRAND, SITE_URL, TALK_URL, fmt, t } from '../src/copy.ts';
// the short labels the journeys press and look for, each one entry (YES_LABEL, since YES is the Close Yes button below)
const NEXT = t('next'); const BACK = t('back'); const DONE = t('done'); const ABOUT = t('about'); const NO = t('no');
const YES_LABEL = t('close.yes'); const PICK_ONE = t('pick.eyebrow'); const ADD = t('name.add'); const SKIP = t('name.skip');
const OFF = t('about.off'); const HOLDING = t('block.holding'); const EARLIER = t('days.earlier');

// Journey times are America/New_York wall-clock strings (see the context timezone below). `new Date('2026-10-14T23:30:00')` reads them
// in the host timezone, so pin it: on a UTC runner the midnight journeys otherwise start at 19:30 and never cross midnight.
process.env.TZ = 'America/New_York';

const URL = process.env.VDT_URL ?? 'http://127.0.0.1:4317';
const RUN = process.env.VDT_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const ROOT = path.join(process.env.VDT_EVIDENCE ?? path.join(os.tmpdir(), 'do-the-hard-thing-e2e'), RUN);
const KEY = 'one-thing:v3';

// `seed` ({ key, value }) writes one localStorage key before the app's first load. Only `migrate-v2` uses it (see e2e/README.md).
async function session(name, startLocal, { permissions = [], channel, seed, before, viewport, mobile } = {}) {
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const context = await browser.newContext({ timezoneId: 'America/New_York', viewport: viewport ?? { width: 390, height: 844 }, locale: 'en-US', permissions, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  if (seed) await context.addInitScript(({ key, value }) => { if (localStorage.getItem(key) == null) localStorage.setItem(key, value); }, seed);
  // against the live site no journey may add to the real counts: /api/event is answered locally (a journey's own route, added next, wins)
  if (!URL.startsWith('http://127.')) await context.route('**/api/event', (route) => route.fulfill({ status: 204, body: '' }));
  if (before) await before(context); // network rules and init scripts that must exist before the first load
  const page = await context.newPage();
  const log = []; let n = 0;
  context.on('page', (pg) => pg.on('pageerror', (e) => log.push({ pageerror: String(e) })));
  page.on('pageerror', (e) => log.push({ pageerror: String(e) }));
  await page.clock.install({ time: new Date(startLocal) }); // the clock belongs to the context: a second tab shares it
  await page.clock.pauseAt(new Date(startLocal)); // time moves only via runFor/fastForward/setSystemTime
  await page.goto(URL);
  // `s.page` is the tab being driven; a journey with two tabs swaps it, and evidence follows it
  const s = { page, context, dir, log };
  s.shot = async (label) => {
    const f = `${String(++n).padStart(2, '0')}-${label}`;
    await s.page.screenshot({ path: path.join(dir, f + '.png'), fullPage: true });
    fs.writeFileSync(path.join(dir, f + '.aria.txt'), await s.page.locator('body').ariaSnapshot());
    log.push({ step: f, at: await s.page.evaluate(() => new Date().toString()) });
  };
  s.step = async (label, fn) => { log.push({ action: label }); await fn(); await s.shot(label); };
  s.store = async (k = KEY) => s.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
  s.done = async (ok, err) => {
    fs.writeFileSync(path.join(dir, 'localStorage.json'), JSON.stringify(await s.store().catch(() => null), null, 2));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ journey: name, url: URL, ok, error: err ? String(err) : null, log }, null, 2));
    await browser.close();
  };
  return s;
}

// ---- reusable user actions (real UI only) ----
const h1 = (p) => p.getByRole('heading', { level: 1 });
// the Name list: plain rows with × on step 1, toggle rows (aria-pressed) in the `Already on your list` group on steps 2 and 3
const LISTED = t('name.listed');
const listed = (p) => p.getByRole('group', { name: LISTED }).getByRole('button');
const row = (p, text) => p.getByRole('listitem').or(listed(p)).filter({ hasText: text });
async function addItem(p, text) {
  await p.getByRole('textbox').fill(text);
  await p.getByRole('button', { name: ADD }).click();
  await expect(row(p, text)).toBeVisible();
}
async function answerAll(p, answers) { // answers: [[sat, lev], ...] in guided order
  for (let i = 0; i < answers.length; i++) {
    const qs = p.locator('.q');
    await qs.nth(0).getByRole('button', { name: answers[i][0] ? YES_LABEL : NO }).click();
    await qs.nth(1).getByRole('button', { name: answers[i][1] ? YES_LABEL : NO }).click();
    await p.getByRole('button', { name: i === answers.length - 1 ? PICK_ONE : NEXT }).click();
  }
}
const FIRST_H1 = t('first.hero');
/** A RegExp source that matches `s` literally: copy text often ends in `.` or `?`. */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The Your days row on About: its label, then the count (none before the first day) and the arrow. */
const daysRow = (total) => new RegExp(`^${rx(t('yourDays'))}\\s*${rx(fmt.daysLink(total))}$`);
const READY = new RegExp(`^(${rx(t('first.start'))}|${rx(t('welcome.ready'))})$`); // `Start` on the first-ever visit, `I'm ready` on every returning welcome
const TALK = t('talk.link');
const STEPS3 = [['first.step1', 'first.step1.d'], ['first.step2', 'first.step2.d'], ['first.step3', 'first.step3.d']].map(([a, b]) => [t(a), t(b)]);
const HOUR_LINE = t('welcome.hour');
const ASSURE = t('first.assure');
// the first-ever visit's welcome, at any hour: the promise, three numbered steps, the attribution and talk link, Start, the assurance line
async function expectFirstWelcome(p) {
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
const PUSHED_Q = t('name.pushed');
const STEP0_HINT = t('name.leftovers');
// answers default to Yes/Yes on the first item in guided order and No/No (set aside, not carried) on the rest
async function throughToPick(s, { pushed = [], risky = ['Ask for the raise'], anxious = ['Tax letter'], answers } = {}) {
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
async function startBlock(s, item = 'Ask for the raise', length = '2h', timer = '2:00:00') {
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
async function noVerdict(p) { await expect(p.locator('body')).not.toContainText(VERDICT); }
const YES = (p) => p.getByRole('button', { name: t('close.yes'), exact: true });
const NOT_TODAY = (p) => p.getByRole('button', { name: t('close.notToday') });
const CLOSE_TODAY = (p) => p.getByRole('button', { name: t('close.today') });
const SEE_DAYS = (p) => p.getByRole('button', { name: t('seeDays') });
const NOTE = { first: t('close.first'), yes: t('close.good'), no: t('close.alright') };
const FIRST_DAY = t('close.firstCount');
const count = (n) => fmt.closeCount(fmt.daysWord(n));
// Close before an answer: the question, the item, Yes / Not today, nothing chosen, Close today disabled, no quote, no verdict
async function expectClose(p, item = 'Ask for the raise') {
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
async function answer(p, yes, note, line) {
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
async function closeToday(p, didIt) {
  await CLOSE_TODAY(p).click();
  await expect(p.getByText(t('closed.eyebrow'))).toBeVisible();
  await expect(h1(p)).toHaveText(t(didIt ? 'closed.done' : 'closed.fresh'));
  await expect(SEE_DAYS(p)).toBeVisible();
  await noVerdict(p);
}
// one whole day through the UI: ritual with one risky item, a block ended after `end`, then the answer and Close today
async function ritualDay(s, { item = 'Ask for the raise', yes, note, line, end = '05:00' }) {
  const p = s.page;
  await throughToPick(s, { risky: [item], anxious: [] }); await startBlock(s, item);
  await p.clock.runFor(end);
  await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); await expectClose(p, item); });
  await s.step(yes ? 'answer-yes' : 'answer-not-today', async () => { await answer(p, yes, note, line); });
  await s.step('close-today', async () => { await closeToday(p, yes); });
}
async function newDayAt(p, at) { await p.clock.setSystemTime(new Date(at)); await p.reload(); }
// the history screen
const DAYS_H1 = t('days.hero');
const dateRows = (p, month) => p.getByRole('list', { name: month }).getByRole('listitem');
async function expectHistory(p, { total, month, rows = [], absent = [], earlier = [] }) {
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
async function nextMorningLeftover(s, at, label = 'next-morning-leftover') {
  const p = s.page;
  await p.clock.setSystemTime(new Date(at)); await p.reload();
  await s.step(label, async () => {
    await p.getByRole('button', { name: READY }).click();
    await expect(h1(p)).toHaveText(PUSHED_Q);
    await expect(p.getByRole('button', { name: /Ask for the raise.*risky · pushed 1×/ })).toBeVisible(); // keeps its original tag
  });
}

// welcome framing by the hour: before 11:00 `Before email` plus the hour-before line, from 11:00 `Start where you are` and no line
async function expectFraming(p, late) {
  const lateEyebrow = t('welcome.eyebrow.late'), morningEyebrow = t('welcome.eyebrow.morning');
  const [on, off] = late ? [lateEyebrow, morningEyebrow] : [morningEyebrow, lateEyebrow];
  await expect(p.getByText(on, { exact: true })).toBeVisible();
  await expect(p.getByText(off, { exact: true })).toHaveCount(0);
  if (late) await expect(p.getByText(HOUR_LINE)).toHaveCount(0); else await expect(p.getByText(HOUR_LINE)).toBeVisible();
}
// quoted from the talk, word for word
const RULE = 'What you do is more important than how you do everything else, and doing something well does not make it important. Material over method, the what over the how.';
const GUISE = t('guise');
const quote = (p, text) => p.getByRole('blockquote').filter({ hasText: text });

// ---- journeys ----
const J = {
  'first-visit': async (s) => { // the same welcome at 08:00 and (late) at 18:57
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
  },
  'name-pending-draft': async (s) => { // Next adds a typed-but-not-added draft under the current tag; the same text again tags it or says it's there
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
  },
  'same-answer-two-steps': async (s) => { // same answer on two steps: the thing put off is also the risky one; it is one item with both tags
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
  },
  'first-visit-late': async (s) => { await J['first-visit'](s); }, // the same welcome at 18:57, after the late hour: the hour line still shows and there is no `Start where you are`
  'peek-then-return': async (s) => { // empty evening visit must not make next morning look like a return
    const p = s.page;
    await s.step('evening-peek', async () => { await expect(h1(p)).toHaveText(FIRST_H1); });
    await p.clock.setSystemTime(new Date('2026-10-15T08:00:00')); await p.reload();
    await s.step('next-morning', async () => { await expect(h1(p)).toHaveText(FIRST_H1); });
  },
  'start-end-block': async (s) => {
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.runFor('05:00');
    await s.step('block-running', async () => { await expect(p.getByRole('timer')).toContainText('1:55:00'); });
    await s.step('end-block', async () => { await p.getByRole('button', { name: t('block.end') }).click(); });
    await expectClose(p);
    const st = await s.store(); const d = st.days.at(-1);
    if (d.block?.endReason !== 'stopped' || d.didIt !== null) throw new Error('stored block not stopped or already answered: ' + JSON.stringify(d));
  },
  'short-block-yes-counts': async (s) => { // ending after 5 min and answering Yes counts the day: no verdict on the block, the item is done
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
  },
  'small-block-modified': async (s) => { // day 1 ritual, day 2 at 14:00 picks the shorter option; the 1h block ends, Not today keeps the item for tomorrow
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
  },
  'yes-clears-item': async (s) => { // a Yes takes the one thing off tomorrow's leftovers; the rest still comes forward
    const p = s.page;
    await J['close-day'](s, { answers: [[true, true], [true, false]] }); // Tax letter Yes/No so it carries (No/No would not)
    await p.clock.setSystemTime(new Date('2026-10-15T07:30:00')); await p.reload();
    await s.step('next-morning-leftovers', async () => {
      await p.getByRole('button', { name: READY }).click();
      await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(p.getByRole('button', { name: /Tax letter.*anxious · pushed 1×/ })).toBeVisible();
      await expect(p.getByRole('button', { name: /Ask for the raise/ })).toHaveCount(0);
    });
  },
  'step-away-broken': async (s) => {
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await s.step('step-away', async () => { await p.getByRole('button', { name: t('block.stepAway') }).click(); await expect(p.getByText(HOLDING)).toBeVisible(); });
    await p.clock.fastForward('11:00');
    await s.step('back-after-11min', async () => { const b = p.getByRole('button', { name: t('block.back') }); if (await b.count()) await b.click(); });
    await expectClose(p);
    await expect(p.getByText('The break ran past 10 minutes', { exact: false })).toHaveCount(0);
    const d = (await s.store()).days.at(-1);
    if (d.block?.endReason !== 'broken') throw new Error('block not broken: ' + JSON.stringify(d.block));
  },
  'one-break-per-block': async (s) => { // one short step-away per block; after it, Step away is gone
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
  },
  'pushed-zero-label': async (s) => { // a pushed item added today (pushedCount 0) reads 'pushed', never 'pushed 0×'
    const p = s.page;
    await throughToPick(s, { pushed: ['Call mom'] });
    await s.step('pick-pushed-label', async () => {
      const b = p.getByRole('button', { name: /Call mom/ });
      await expect(b).toBeVisible();
      await expect(b).toContainText('pushed');
      await expect(b).not.toContainText('0×');
    });
  },
  'pick-order-risky-first': async (s) => { // Pick lists risky (rejection or conflict) first, even ahead of a pushed item written earlier
    const p = s.page;
    await throughToPick(s, { pushed: ['Tax letter'], risky: ['Ask for the raise'], anxious: [], answers: [[true, true], [true, true]] });
    await s.step('pick-order', async () => {
      const choices = p.locator('.choices').getByRole('button');
      await expect(choices).toHaveCount(2);
      await expect(choices.nth(0)).toHaveText(/Ask for the raise/);
      await expect(choices.nth(1)).toHaveText(/Tax letter/);
    });
  },
  'carryover-keeps-tag-drops-noyes': async (s) => { // leftovers keep their tag; a No/No item was set aside and does not come back
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
  },
  'pick-requires-choice': async (s) => { // Start stays disabled until a listed item is chosen; No/No items are not offered
    const p = s.page;
    await throughToPick(s, { risky: ['Ask for the raise', 'Call the landlord'], anxious: [] });
    await s.step('pick-list', async () => {
      await expect(p.getByRole('button', { name: /Call the landlord/ })).toHaveCount(0); // answered No/No
      await expect(p.getByRole('button', { name: t('pick.start') })).toBeDisabled();
      await expect(p.getByRole('button', { name: BACK })).toHaveCount(0); // Pick has no Back (see Gotchas)
      await p.getByRole('button', { name: /Ask for the raise/ }).click();
      await expect(p.getByRole('button', { name: t('pick.start') })).toBeEnabled();
    });
  },
  'close-day': async (s, opts) => {
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
  },
  'start-over-confirm': async (s) => { // Start today over asks once inline; Keep today changes nothing
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
  },
  'returning-late': async (s) => { // day 1 morning real ritual, day 2 opened at 14:00
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.getByRole('button', { name: t('block.end') }).click();
    await expectClose(p); await answer(p, false, NOTE.no, null); await closeToday(p, false);
    await p.clock.setSystemTime(new Date('2026-10-15T14:00:00')); await p.reload();
    await s.step('day2-late', async () => {
      await expect(h1(p)).toHaveText(t('bad.hero'));
      await expect(p.getByText(t('bad.late'))).toBeVisible();
      await expectFraming(p, true);
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
  },
  'missed-days': async (s) => { // ritual Mon, empty peek Tue, back Thu 08:00
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
  },
  'welcome-hour-line': async (s) => { // a returning user on a normal morning sees the hour-before line too
    const p = s.page;
    await throughToPick(s);
    await p.clock.setSystemTime(new Date('2026-10-15T08:00:00')); await p.reload();
    await s.step('next-morning-welcome', async () => {
      await expect(h1(p)).toHaveText(t('morning.hero'));
      await expect(p.getByText(t('morning.email'), { exact: false })).toBeVisible();
      await expect(p.getByText('Pen and paper', { exact: false })).toHaveCount(0);
      await expectFraming(p, false);
    });
  },
  'copy-from-the-talk': async (s) => { // the talk's own words on Name, Ask, Pick, Nothing got a yes and About; Close quotes nothing
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
  },
  'midnight-rollover': async (s) => { // a closed day left open past midnight moves to the new day
    const p = s.page;
    await throughToPick(s); await startBlock(s); await p.getByRole('button', { name: t('block.end') }).click();
    await expectClose(p); await answer(p, false, NOTE.no, null); await closeToday(p, false);
    await p.clock.runFor('02:00:00'); // 23:30 -> 01:30 next day, app left open
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await s.step('after-midnight', async () => { await expect(p.getByText(t('closed.eyebrow'))).toHaveCount(0); });
  },
  'block-across-midnight': async (s) => { // a block belongs to the day it started; closing it moves to the new day
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
  },
  'block-reload-after-midnight': async (s) => { // a block started before midnight is offered back after a reload
    const p = s.page;
    await throughToPick(s); await startBlock(s);
    await p.clock.setSystemTime(new Date('2026-10-15T00:10:00')); await p.reload();
    await s.step('reload-0010', async () => {
      await expect(h1(p)).toHaveText('Ask for the raise');
      await expect(p.getByRole('timer')).toContainText('1:20:00');
    });
    await p.clock.setSystemTime(new Date('2026-10-15T02:00:00')); await p.reload();
    await s.step('reload-0200', async () => { await expectClose(p); });
  },
  'close-not-today-count': async (s) => { // the first-ever Not today has no count line; a later Not today shows what is already done
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
  },
  'count-grows': async (s) => { // Yes, Not today, Yes, Yes: the count only goes up; history lists only the done days, then a new month moves them to Earlier
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
  },
  'history-empty': async (s) => { // a brand-new profile: the empty state, no zero anywhere
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
  },
  'history-from-close-and-about': async (s) => { // the first Yes ever shows no number; both ways in to Your days; Done and Back return to where you came from, one step at a time
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
  },
  'step0-bring-in': async (s) => { // yesterday's open items are offered on step 1, nothing pre-selected; only what is tapped comes along
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
  },
  'start-over-count': async (s) => { // Start today over takes back only today's own Yes; earlier days stay counted and listed
    const p = s.page;
    await ritualDay(s, { item: 'Ask for the raise', yes: true, note: NOTE.first, line: FIRST_DAY });
    await newDayAt(p, '2026-10-15T07:30:00');
    await ritualDay(s, { item: 'Call the landlord', yes: true, note: NOTE.yes, line: count(2) });
    await s.step('start-over', async () => {
      await p.getByRole('button', { name: t('closed.overGroup') }).click();
      await p.getByRole('button', { name: t('closed.overYes') }).click();
      await expect(h1(p)).toHaveText(t('morning.hero'));
    });
    await s.step('about-count', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(p.getByRole('button', { name: t('yourDays') })).toHaveText(daysRow(1));
    });
    await s.step('history-keeps-earlier', async () => {
      await p.getByRole('button', { name: t('yourDays') }).click();
      await expectHistory(p, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']], absent: ['Thu 15', 'Call the landlord'] });
    });
    const st = await s.store();
    const d14 = st.days.find((d) => d.date === '2026-10-14'), d15 = st.days.find((d) => d.date === '2026-10-15');
    if (d14?.didIt !== true || !d14.closed || d14.doneText !== 'Ask for the raise') throw new Error('earlier day touched: ' + JSON.stringify(d14));
    if (!d15 || d15.didIt !== null || d15.closed || d15.items.length || d15.doneText !== null) throw new Error('today not reset: ' + JSON.stringify(d15));
  },
  'migrate-v2': async (s) => { // the one seeded journey: an old v2 store becomes v3 on first load (see CONTEXT and e2e/README.md)
    const p = s.page;
    await s.step('welcome-returning', async () => { await expect(h1(p)).toHaveText(t('morning.hero')); });
    await s.step('about-count', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(p.getByRole('button', { name: t('yourDays') })).toHaveText(daysRow(1));
    });
    await s.step('history', async () => {
      await p.getByRole('button', { name: t('yourDays') }).click();
      await expectHistory(p, { total: 1, month: 'October', rows: [['Mon 12', 'Ask for the raise']], absent: ['Tue 13', 'Call the landlord'] });
    });
    await s.step('leftover-single-tag', async () => { // the gotBlock false day stays unanswered, so its one thing is offered again
      await p.getByRole('button', { name: DONE }).click();
      await p.getByRole('button', { name: DONE }).click();
      await p.getByRole('button', { name: READY }).click();
      await expect(p.getByRole('button', { name: /^Call the landlord\s*risky · pushed 1×$/ })).toBeVisible();
      await expect(p.getByRole('button', { name: /^Ask for the raise/ })).toHaveCount(0);
    });
    const v3 = await s.store(), v2 = await s.store('one-thing:v2');
    const got = v3?.days.map((d) => [d.date, d.gotBlock, d.didIt, d.doneText, d.items.map((i) => [i.text, i.tags, 'tag' in i])]);
    const want = [['2026-10-12', true, true, 'Ask for the raise', [['Ask for the raise', ['risky'], false]]], ['2026-10-13', false, null, null, [['Call the landlord', ['risky'], false]]]];
    if (JSON.stringify(got?.slice(0, 2)) !== JSON.stringify(want)) throw new Error('v3 not migrated: ' + JSON.stringify(got));
    if (JSON.stringify(v2) !== V2_SEED) throw new Error('v2 key changed or gone: ' + JSON.stringify(v2));
  },
  'two-tabs': async (s) => { // tab B opened first and left stale; tab A finishes the day; B's save must not undo it, and B's focus shows it
    const B = s.page;
    await s.step('tab-b-open', async () => { await expect(h1(B)).toHaveText(FIRST_H1); });
    const A = await s.context.newPage(); await A.goto(URL);
    s.page = A;
    await ritualDay(s, { item: 'Ask for the raise', yes: true, note: NOTE.first, line: FIRST_DAY });
    const done14 = (st) => st?.days.find((d) => d.date === '2026-10-14');
    s.page = B;
    await s.step('tab-b-adds-item', async () => { // B still shows its stale Welcome; adding an item saves B's store
      await expect(h1(B)).toHaveText(FIRST_H1);
      await B.getByRole('button', { name: READY }).click();
      await addItem(B, 'Call mom');
    });
    await expect.poll(async () => { const d = done14(await s.store()); return [d?.didIt, d?.closed, d?.doneText]; }).toEqual([true, true, 'Ask for the raise']);
    await s.step('tab-b-focus', async () => { // the real refresh: focus pulls in what tab A saved
      await B.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(h1(B)).toHaveText(t('closed.done'));
      await noVerdict(B);
    });
    await s.step('tab-b-history', async () => { await SEE_DAYS(B).click(); await expectHistory(B, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] }); });
    const d = done14(await s.store());
    if (d?.didIt !== true || !d.closed || d.items.some((i) => i.text === 'Call mom')) throw new Error('tab A day lost: ' + JSON.stringify(d));
  },
  'reminder-honest-granted': async (s) => { // context grants notifications; Chromium has no TimestampTrigger, so open-only copy
    const p = s.page;
    const status = p.getByRole('status');
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(status).toHaveText(t('reminder.allowed'));
      await expect(p.getByText('Reminders are local.')).toHaveCount(0);
    });
    await s.step('set-0630', async () => {
      await p.getByLabel(t('about.time')).fill('06:30');
      await expect(status).toHaveText(fmt.reminderSet('06:30', false));
      await expect(p.getByLabel(t('about.time'))).toHaveValue('06:30');
    });
    await expect.poll(async () => (await s.store())?.reminder).toBe('06:30');
    await s.step('off', async () => {
      await p.getByRole('button', { name: OFF }).click();
      await expect(status).toHaveText(t('reminder.allowed'));
      await expect(p.getByRole('button', { name: OFF })).toHaveCount(0);
      await expect(p.getByLabel(t('about.time'))).toHaveValue('');
    });
    await expect.poll(async () => (await s.store())?.reminder).toBeNull();
  },
  'reminder-honest-denied': async (s) => { // headless-shell Chromium starts with notifications 'denied' (no prompt): the blocked state
    const p = s.page;
    const status = p.getByRole('status');
    const perm = () => p.evaluate(async () => ({ notification: Notification.permission, query: (await navigator.permissions.query({ name: 'notifications' })).state }));
    const probe = { before: await perm() }; // written as evidence even on FAIL
    try {
      if (probe.before.notification !== 'denied') throw new Error('precondition: expected denied permission, got ' + JSON.stringify(probe.before));
      await s.step('about-blocked', async () => {
        await p.getByRole('button', { name: ABOUT }).click();
        await expect(status).toHaveText(t('reminder.denied'));
        await expect(p.getByLabel(t('about.time'))).toBeDisabled();
        await expect(p.getByLabel(t('about.time'))).toHaveValue('');
        await expect(p.getByRole('button', { name: OFF })).toHaveCount(0);
        await expect(p.getByText('Reminder set for')).toHaveCount(0);
      });
    } finally {
      probe.after = await perm().catch((e) => String(e));
      fs.writeFileSync(path.join(s.dir, 'permission.json'), JSON.stringify(probe, null, 2));
    }
    const st = await s.store();
    if (st?.reminder != null) throw new Error('denied permission still saved a reminder: ' + JSON.stringify(st.reminder));
  },
};

// ---------- analytics: anonymous counts, never item text ----------
// NET records every request the app makes in a journey. `events` are the bodies sent to /api/event.
const NET = { all: [], events: [] };
const watchNet = (mode) => async (context) => {
  NET.all = []; NET.events = [];
  context.on('request', (r) => NET.all.push({ method: r.method(), url: r.url(), body: r.postData() ?? '', headers: JSON.stringify(r.headers()) }));
  await context.route('**/api/event', async (route) => {
    if (mode === 'record') { NET.events.push(route.request().postData()); await route.fulfill({ status: 204, body: '' }); } else await route.abort('failed');
  });
  if (mode === 'blocked') await context.route(/cloudflareinsights\.com/, (route) => route.abort('blockedbyclient'));
};
const ITEMS = /raise|tax|letter|landlord|school/i;
function expectNoItemText() {
  for (const r of NET.all) if (ITEMS.test(r.url) || ITEMS.test(r.body) || ITEMS.test(r.headers)) throw new Error('item text left the device: ' + JSON.stringify(r));
  for (const b of NET.events) if (!/^\{"event":"(started|finished|opened_history)"\}$/.test(b)) throw new Error('event body is not just a name: ' + b);
}
const noPageErrors = (s) => { const e = s.log.filter((l) => l.pageerror); if (e.length) throw new Error('page errors: ' + JSON.stringify(e)); };
// the dev-server-free default build has no token: no Cloudflare script, and the privacy line is on About
const PRIVACY = ['privacy.device', 'privacy.tallies', 'privacy.dnt', 'privacy.host'].map(t);
async function expectPrivacyNote(p) {
  await p.getByRole('button', { name: ABOUT }).click();
  for (const line of PRIVACY) await expect(p.getByText(line, { exact: true })).toBeVisible();
  await expect(p.getByText(t('about.free'), { exact: true })).toBeVisible();
  await expect(p.getByRole('link', { name: /tip/i })).toHaveCount(0); // no donation or tip link
  await p.getByRole('button', { name: DONE }).click();
}
const analyticsJourneys = {
  'analytics-anonymous-counts': async (s) => { // started, finished and opened_history each go out once, as a bare name; no item text anywhere
    const p = s.page;
    await s.step('privacy-note', async () => { await expectPrivacyNote(p); });
    // no token in a local build: no third-party script. The live site is behind Cloudflare, which may inject its own beacon, so only check locally.
    if (URL.startsWith('http://127.')) await expect(p.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
    if (NET.events.length) throw new Error('an event was sent before step 0: ' + NET.events);
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); });
    await expect.poll(() => NET.events.length).toBe(3);
    const got = [...NET.events].sort().join(' ');
    if (got !== '{"event":"finished"} {"event":"opened_history"} {"event":"started"}') throw new Error('events: ' + got);
    await s.step('reload-and-reopen', async () => { // a refresh does not count twice
      await p.reload(); await p.getByRole('button', { name: ABOUT }).click(); await p.getByRole('button', { name: t('yourDays') }).click();
      await expect(h1(p)).toHaveText(DAYS_H1);
    });
    await p.waitForTimeout(300);
    if (NET.events.length !== 3) throw new Error('repeat events: ' + NET.events);
    expectNoItemText();
    const st = await p.evaluate(() => Object.keys(localStorage).sort().join(','));
    if (st !== 'one-thing:events,one-thing:v3') throw new Error('storage keys: ' + st);
    const rec = JSON.parse(await p.evaluate(() => localStorage.getItem('one-thing:events')));
    if (ITEMS.test(JSON.stringify(rec))) throw new Error('events record holds item text');
  },
  'social-preview': async (s) => { // the share tags are absolute, and the 1200x630 image is served as a PNG
    const p = s.page;
    const meta = async (attr, name) => p.locator(`meta[${attr}="${name}"]`).getAttribute('content');
    await s.step('tags', async () => {
      for (const [a, n, v] of [['property', 'og:type', 'website'], ['property', 'og:site_name', BRAND], ['property', 'og:title', BRAND],
        ['property', 'og:url', `${SITE_URL}/`], ['property', 'og:image', `${SITE_URL}/og-image.png`], ['name', 'twitter:card', 'summary_large_image'],
        ['name', 'twitter:title', BRAND], ['name', 'twitter:image', `${SITE_URL}/og-image.png`]]) {
        const got = await meta(a, n); if (got !== v) throw new Error(`${n}: ${got}`);
      }
      for (const [a, n] of [['property', 'og:description'], ['name', 'twitter:description']]) if (!(await meta(a, n))?.includes('pick one thing')) throw new Error(`${n} missing`);
      for (const [a, n, v] of [['property', 'og:image:type', 'image/png'], ['property', 'og:image:width', '1200'], ['property', 'og:image:height', '630']]) { const got = await meta(a, n); if (got !== v) throw new Error(`${n}: ${got}`); }
      for (const [a, n] of [['property', 'og:image:alt'], ['name', 'twitter:image:alt']]) if (!(await meta(a, n))?.includes('Pick one thing')) throw new Error(`${n} missing`);
      if ((await meta('name', 'description')) !== (await meta('property', 'og:description'))) throw new Error('og:description differs from the page description');
    });
    await s.step('image', async () => {
      const r = await p.request.get(`${URL}/og-image.png`);
      const b = await r.body();
      if (r.status() !== 200 || !/image\/png/.test(r.headers()['content-type'] ?? '')) throw new Error(`og-image: ${r.status()} ${r.headers()['content-type']}`);
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      if (w !== 1200 || h !== 630) throw new Error(`og-image is ${w}x${h}`);
      if (b.length > 1_000_000) throw new Error(`og-image is ${b.length} bytes; keep it small for crawlers`);
      // what is served is the committed image (public/og-image.png), so a stale deploy or an unregenerated image shows up here
      const want = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), '../public/og-image.png'))).digest('hex');
      if (crypto.createHash('sha256').update(b).digest('hex') !== want) throw new Error('served og-image.png differs from public/og-image.png');
    });
    await s.step('about-privacy', async () => { await expectPrivacyNote(p); });
  },
  'analytics-do-not-track': async (s) => { // the browser says Do Not Track: no event leaves, and nothing is remembered about it
    const p = s.page;
    if (await p.evaluate(() => navigator.doNotTrack) !== '1') throw new Error('the Do Not Track signal is not set');
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expect(h1(p)).toHaveText(DAYS_H1); });
    await p.waitForTimeout(300);
    if (NET.events.length || NET.all.some((r) => /api\/event/.test(r.url))) throw new Error('sent despite Do Not Track: ' + JSON.stringify(NET.events));
    if ((await s.store()).days[0].didIt !== true) throw new Error('the day did not count');
  },
  'analytics-blocked': async (s) => { // /api/event and the Cloudflare script are blocked (an ad blocker): the whole day still works
    const p = s.page;
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expectHistory(p, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] }); });
    await p.waitForTimeout(300);
    noPageErrors(s);
    expectNoItemText();
  },
  'analytics-offline': async (s) => { // the network drops right after load: counts fail silently, the app is unaffected
    const p = s.page;
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => 1)); // let the service worker finish registering first; going offline mid-registration is a page error on newer Playwright
    await s.context.setOffline(true);
    await ritualDay(s, { yes: true, note: NOTE.first, line: FIRST_DAY });
    await s.step('open-history', async () => { await SEE_DAYS(p).click(); await expectHistory(p, { total: 1, month: 'October', rows: [['Wed 14', 'Ask for the raise']] }); });
    await p.waitForTimeout(300);
    noPageErrors(s);
    if ((await s.store()).days[0].doneText !== 'Ask for the raise') throw new Error('the day did not save offline');
  },
};
Object.assign(J, analyticsJourneys);

// ---------- launch-readiness: offline, small phones, blocked storage, no Notification API, hostile text, reload mid-naming ----------

// Every box and every line of text must sit inside the page's padded column (so no sideways scroll, nothing clipped, nothing past the side margin). Returns what does not.
const layoutProblems = (p) => p.evaluate(() => {
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
const contrastFailures = (p) => p.evaluate(() => {
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
const readinessJourneys = {
  'offline-reload': async (s) => { // real service worker: after one online visit the whole app works with the network off, and a block survives an offline reload
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
  },
  'small-phone-layout': async (s) => { // 375x667 (iPhone SE class, touch): a whole day with no sideways scroll, the key action reachable on every screen
    const p = s.page; const at = async (label) => { const bad = await layoutProblems(p); if (bad.length) throw new Error(`layout problems on ${label}: ${bad.join(' | ')}`); };
    await at('welcome');
    await throughToPick(s, { risky: ['Prepare the quarterly numbers for the investor update and send them to everyone on the list'], anxious: ['Tax letter'] });
    await at('pick'); await startBlock(s, 'Prepare the quarterly');
    await at('block'); await p.clock.runFor('02:00:01');
    await s.step('close', async () => { await at('close'); await YES(p).click(); await at('close-yes'); await expect(CLOSE_TODAY(p)).toBeEnabled(); await CLOSE_TODAY(p).scrollIntoViewIfNeeded(); await CLOSE_TODAY(p).click(); });
    await s.step('closed-days-about', async () => { await at('closed'); await SEE_DAYS(p).click(); await at('days'); await p.getByRole('button', { name: DONE }).click(); await p.getByRole('button', { name: ABOUT }).click(); await at('about'); });
  },
  'long-url-widths': async (s) => { // a pasted URL (55+ chars, no break opportunity) as an item on every screen that shows item text, at 320, 375, 390 and 430 wide: it wraps, nothing is clipped, nothing scrolls sideways
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
  },
  'contrast-aa': async (s) => { // every screen of a day, light and dark: all text meets WCAG AA (4.5:1; 3:1 for large text), so the muted grey cannot slip back under
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
  },
  'reload-mid-naming': async (s) => { // the app has no step memory: a reload during naming returns to Welcome, and the items already added are still there (a typed, unadded draft is lost)
    const p = s.page;
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); });
    await s.step('two-steps', async () => { await addItem(p, 'Talking to leads'); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('textbox').fill('typed but not added'); });
    await s.step('reload', async () => { await p.reload(); await expect(h1(p)).toHaveText(FIRST_H1); });
    await s.step('ready-again', async () => {
      await p.getByRole('button', { name: READY }).click(); await expect(h1(p)).toHaveText(PUSHED_Q);
      await expect(row(p, 'Talking to leads')).toBeVisible(); await expect(p.getByText('typed but not added')).toHaveCount(0);
    });
  },
  'storage-blocked': async (s) => { // storage refuses writes (private mode, full disk): a visible note, nothing crashes, the day can still be worked in memory
    const p = s.page;
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); await addItem(p, 'Ask for the raise'); });
    await s.step('note', async () => { await expect(p.getByText(t('saveNote'))).toBeVisible(); });
    await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: NEXT }).click(); await p.getByRole('button', { name: t('twoQuestions') }).click();
    await answerAll(p, [[true, true]]); await startBlock(s, 'Ask for the raise');
    noPageErrors(s);
  },
  'no-notification-api': async (s) => { // iPhone Safari outside the home-screen app has no Notification API: About says so, offers no time input, nothing throws
    const p = s.page;
    await s.step('about', async () => {
      await p.getByRole('button', { name: ABOUT }).click();
      await expect(p.getByText(t('reminder.unsupported'))).toBeVisible();
      await expect(p.getByLabel(t('about.time'))).toHaveCount(0);
    });
    noPageErrors(s);
  },
  'hostile-text': async (s) => { // items are plain text whatever is typed: markup is shown literally, nothing runs, blanks cannot be added
    const p = s.page; let dialog = false; p.on('dialog', (d) => { dialog = true; d.dismiss(); });
    const evil = '<img src=x onerror=alert(1)> & "quotes" \u{1F525} \u65E5\u672C\u8A9E';
    await s.step('ready', async () => { await p.getByRole('button', { name: READY }).click(); await addItem(p, evil); });
    await s.step('blank', async () => { await p.getByRole('textbox').fill('   '); await expect(p.getByRole('button', { name: ADD })).toBeDisabled(); });
    if (dialog) throw new Error('script in an item ran'); if (await p.locator('main img').count()) throw new Error('markup in an item was rendered');
    const st = await s.store(); if (st.days.at(-1).items[0].text !== evil) throw new Error('stored text changed: ' + st.days.at(-1).items[0].text);
    noPageErrors(s);
  },
};
Object.assign(J, readinessJourneys);
// ---- first-visit welcome, focus after navigation, and copy review ----
const focused = (p) => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, text: (a?.textContent || '').trim().slice(0, 40), label: a?.getAttribute('aria-label') ?? '' }; });
async function expectFocusOnHeading(p, text, label) {
  await expect(h1(p)).toHaveText(text);
  const f = await focused(p);
  if (f.tag !== 'H1' || !f.text.startsWith(text.slice(0, 20))) throw new Error(`after ${label}: focus is on ${JSON.stringify(f)}, not the heading "${text}"`);
}
const noEmDash = (p, label) => expect(p.locator('body'), `em dash on ${label}`).not.toContainText(/\u2014/);
const reviewJourneys = {
  'welcome-v1': async (s) => { // the first-visit welcome fits every phone width, reads in both colour schemes, and Start/Back/About work; a returning morning still gets the old welcome
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
  },
  'focus-after-nav': async (s) => { // after every screen change focus is on the new heading (the input on the name steps), so a keyboard user can type and press Enter at once
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
  },
  'review-copy': async (s) => { // block length, the pause line, name-step hints, About (eight steps to three, not affiliated, one talk link, four privacy lines); no em dash anywhere
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
  },
};
Object.assign(J, reviewJourneys);

// the default headless shell reports Notification.permission 'denied' even when granted; full Chromium (new headless) honors the grant
// migrate-v2 is the only journey that seeds storage: a v2 store as the app wrote it before "Did you do it?" (single `tag`, gotBlock only)
const v2Day = (date, id, text, gotBlock) => ({ date, openedAt: new Date(`${date}T07:30:00`).getTime(), closed: true, chosenId: id, block: null, gotBlock,
  items: [{ id, text, tag: 'risky', satisfied: true, leverage: true, pushedCount: 0 }] });
const V2_SEED = JSON.stringify({ reminder: null, days: [v2Day('2026-10-12', 'a', 'Ask for the raise', true), v2Day('2026-10-13', 'b', 'Call the landlord', false)] });
const dnt = (mode) => async (context) => { await context.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' })); await watchNet(mode)(context); };
const initOnly = (fn) => async (context) => { await context.addInitScript(fn); };
const CONTEXT = { 'storage-blocked': { before: initOnly(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError'); }; }) },
  'no-notification-api': { before: initOnly(() => { delete window.Notification; }) },
  'small-phone-layout': { viewport: { width: 375, height: 667 }, mobile: true },
  'long-url-widths': { viewport: { width: 320, height: 760 }, mobile: true },
  'welcome-v1': { viewport: { width: 390, height: 844 }, mobile: true },
  'analytics-anonymous-counts': { before: watchNet('record') }, 'analytics-do-not-track': { before: dnt('record') },
  'analytics-blocked': { before: watchNet('blocked') }, 'analytics-offline': { before: watchNet('record') },
  'reminder-honest-granted': { permissions: ['notifications'], channel: 'chromium' }, 'migrate-v2': { seed: { key: 'one-thing:v2', value: V2_SEED } } };
const START = { 'first-visit': '2026-10-14T08:00:00', 'first-visit-late': '2026-10-14T18:57:00', 'peek-then-return': '2026-10-14T20:00:00',
  'missed-days': '2026-10-12T08:00:00', 'midnight-rollover': '2026-10-14T23:30:00', 'block-across-midnight': '2026-10-14T23:30:00',
  'block-reload-after-midnight': '2026-10-14T23:30:00' };

const args = process.argv.slice(2);
if (args[0] === '--list' || !args.length) { console.log(Object.keys(J).join('\n')); process.exit(0); }
let failed = 0;
for (const name of args) {
  if (!J[name]) { console.log(`UNKNOWN ${name}`); failed++; continue; }
  const s = await session(name, START[name] ?? '2026-10-14T07:30:00', CONTEXT[name]);
  try { await J[name](s); await s.shot('final'); await s.done(true); console.log(`PASS ${name}  ${s.dir}`); }
  catch (e) { await s.shot('failure').catch(() => {}); await s.done(false, e); failed++; console.log(`FAIL ${name}  ${s.dir}\n  ${String(e).split('\n')[0]}`); }
}
process.exit(failed ? 1 : 0);
