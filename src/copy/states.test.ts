import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fmt, t } from '../copy';
import { Ask, Name } from '../App';
import { text, noop, item, day, yesterday, name, ask, T0, blk, block, done, days, about, twoItems, SCREENS } from './screens.testlib';

// ---- the other states: the lines built with fmt or chosen by state, as each one shows ----
describe('Name, Ask, the block, Your days and About render their copy in every state', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((n) => item(n, null, ['pushed']));
  // a line split over elements (a count with its number set apart, a row of two spans) reads with single spaces
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  it('Name: the step, its placeholder, the list with its remove labels, and the next button', () => {
    const empty = name([]);
    expect(empty).toContain(t('name.eyebrow'));
    expect(renderToStaticMarkup(h(Name, { day: day([]), history: [], today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }))).toContain(`aria-label="${fmt.steps(1, 3)}"`);
    expect(empty).toContain(t('name.placeholder'));
    expect(empty).toContain(t('name.skip'));
    expect(empty).not.toContain(t('next'));
    const listed = renderToStaticMarkup(h(Name, { day: day(twoItems), history: [], today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }));
    expect(listed).toContain(`aria-label="${fmt.remove('Call mom')}"`);
    expect(listed).toContain(`aria-label="${t('name.pushed')}"`);
    expect(text(h(Name, { day: day(twoItems), history: [], today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }))).toContain(`${t('tag.risky')} · ${fmt.pushedTimes(2)}`);
    expect(name(twoItems)).toContain(t('next'));
    expect(renderToStaticMarkup(h(Name, { day: day(five), history: [], today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }))).toContain(`placeholder="${t('name.placeholderFull')}"`);
  });
  it('Name with leftovers: each one offered with its tags, and the other placeholder', () => {
    const offered = name([], [yesterday]);
    expect(offered).toContain(`${t('tag.risky')} · ${fmt.pushedTimes(2)}`);
    expect(offered).toContain(`${t('tag.anxious')} · ${fmt.pushedTimes(1)}`);
    expect(renderToStaticMarkup(h(Name, { day: day([]), history: [yesterday], today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }))).toContain(`placeholder="${t('name.placeholderNew')}"`);
    expect(name([])).not.toContain(t('name.leftovers'));
  });
  it('Ask: the item, both questions, Yes and No, and Pick one on the last item', () => {
    const one = ask([item('Tax letter', true, ['anxious'])]);
    for (const id of ['twoQuestions', 'ask.satisfied', 'ask.leverage', 'close.yes', 'no', 'back', 'pick.eyebrow'] as const) expect(one).toContain(t(id));
    expect(renderToStaticMarkup(h(Ask, { items: [item('Tax letter', true)], setItem: noop, onBack: noop, onDone: noop }))).toContain(`aria-label="${fmt.steps(1, 1)}"`);
    expect(ask(twoItems)).toContain(t('next'));
    expect(ask([])).toBe('');
  });
  it('the block: running, paused, drifted, pause used, and with no item', () => {
    expect(block(blk(), twoItems[0])).toContain(t('block.left'));
    expect(block(blk(), twoItems[0])).toContain(`${t('block.focus')} ${t('block.pauseHint')}`);
    expect(block(blk(), twoItems[0])).toContain(t('block.comeBack'));
    expect(block(blk(), twoItems[0])).toContain(t('block.stepAway'));
    const paused = block(blk({ pausedAt: T0 + 60_000, breaks: 1 }), twoItems[0], T0 + 4 * 60_000);
    expect(paused).toContain(fmt.pausedLine(3, 10));
    expect(paused).toContain(t('block.holding'));
    expect(paused).toContain(t('block.back'));
    const used = block(blk({ breaks: 1, pausedMs: 30_000, drifts: [1] }), twoItems[0]);
    expect(used).toContain(t('block.drifted'));
    expect(used).not.toContain(t('block.pauseHint'));
    expect(used).toContain(t('block.pauseUsed'));
    expect(block(blk())).toContain(t('block.fallback'));
    expect(block(blk())).toContain(t('yourOneThing'));
    expect(block(blk())).toContain(t('block.end'));
  });
  it('Your days: the count, the month line, earlier months, another year, a day with no text', () => {
    const month = days([done('2026-10-02'), done('2026-10-09', null), day([], { date: '2026-10-10', didIt: false })]);
    expect(flat(month)).toContain(fmt.daysCount(fmt.daysWord(2)));
    expect(month).toContain(fmt.monthLine('October', fmt.daysWord(2)));
    expect(month).toContain(t('yourOneThing'));
    expect(month).not.toContain(t('days.earlier'));
    const earlier = days([done('2026-09-02'), done('2025-12-02')], { '2025-03': 4 });
    expect(earlier).toContain(t('days.earlier'));
    expect(flat(earlier)).toContain(fmt.daysCount(fmt.daysWord(6)));
    expect(earlier).toContain('September');
    expect(earlier).toContain('December 2025');
    expect(earlier).toContain('March 2025');
    expect(earlier).toContain(fmt.daysWord(4));
    expect(days([])).toContain(t('back'));
  });
  it('About: the days row, the reminder in each mode and permission', () => {
    expect(flat(about('open-only', 'granted', null, 0))).toContain(`${t('yourDays')} ${fmt.daysLink(0)}`);
    expect(fmt.daysLink(0)).toBe('›');
    expect(about('open-only', 'granted', null, 12)).toContain(fmt.daysLink(12));
    expect(about('trigger', 'granted', '06:15')).toContain(fmt.reminderSet('06:15', true));
    expect(about('trigger', 'granted', '06:15')).toContain(t('about.off'));
    expect(about('open-only', 'granted', '07:30')).toContain(fmt.reminderSet('07:30', false));
    expect(about('trigger', 'denied', '07:30')).toContain(t('reminder.denied'));
    expect(about('unsupported', 'denied', '07:30')).not.toContain(t('about.off'));
    for (const id of ['about', 'about.reminder'] as const) expect(about('open-only', 'default')).toContain(t(id));
  });
  it('no state shows an em or en dash', () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`); // built from code points: check-text bans the characters and their escapes in src/
    for (const [s, html] of Object.entries(SCREENS)) expect(html, s).not.toMatch(dashes);
  });
});