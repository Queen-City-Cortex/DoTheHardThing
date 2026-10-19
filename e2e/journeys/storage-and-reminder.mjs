// Journeys: storage and reminder (the first of the groups merged into J by e2e/drive.mjs, in file order).

import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fmt, t } from '../../src/copy.ts';
import { URL } from '../drive/session.mjs';
import { DONE, ABOUT, OFF, h1, addItem, FIRST_H1, daysRow, READY, noVerdict, SEE_DAYS, NOTE, FIRST_DAY, count, ritualDay, newDayAt, expectHistory } from '../drive/actions.mjs';
import { journey } from '../drive/registry.mjs';
import { V2_SEED } from '../drive/context.mjs';

export const storageAndReminderJourneys = {
  'start-over-count': journey({ id: 'start-over-count', feature: 'close-day', proves: ['cd-start-over'], strings: ['closed.overGroup', 'closed.overYes', 'morning.hero', 'yourDays'] }, async (s) => { // Start today over takes back only today's own Yes; earlier days stay counted and listed
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
  }),
  'migrate-v2': journey({ id: 'migrate-v2', feature: 'history', proves: [], strings: ['morning.hero', 'yourDays'] }, async (s) => { // the one seeded journey: an old v2 store becomes v3 on first load (see CONTEXT and e2e/README.md)
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
  }),
  'two-tabs': journey({ id: 'two-tabs', feature: 'history', proves: ['hi-two-tabs'], strings: ['closed.done'] }, async (s) => { // tab B opened first and left stale; tab A finishes the day; B's save must not undo it, and B's focus shows it
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
  }),
  'reminder-honest-granted': journey({ id: 'reminder-honest-granted', feature: 'reminder', proves: ['rm-status', 'rm-set', 'rm-off'], strings: ['reminder.allowed', 'about.time'] }, async (s) => { // context grants notifications; Chromium has no TimestampTrigger, so open-only copy
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
  }),
  'reminder-honest-denied': journey({ id: 'reminder-honest-denied', feature: 'reminder', proves: ['rm-status', 'rm-denied'], strings: ['reminder.denied', 'about.time'] }, async (s) => { // headless-shell Chromium starts with notifications 'denied' (no prompt): the blocked state
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
  }),
};