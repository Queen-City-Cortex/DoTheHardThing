import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../copy';
import { Welcome } from '../App';
import { bad, noop, SCREENS } from './screens.testlib';

// A late start with no missed days is a milder welcome: the late line is the heading, the shorter block stays offered,
// and the welcome back, its talk lines and the hour line stay with missed days (product question Q6).
describe('the late-only welcome', () => {
  const late = SCREENS.lateWelcome;
  it.each(['bad.hero', 'bad.everybody', 'bad.vonnegut', 'bad.vonnegut.cite', 'bad.notAlone', 'welcome.hour'] as const)('leaves out %s', (id) => {
    expect(late).not.toContain(t(id));
  });
  it('makes the late line its heading and keeps the toggle and I\'m ready', () => {
    const html = renderToStaticMarkup(h(Welcome, { bad: bad({ late: true, bad: true }), onStart: noop, small: false, setSmall: noop }));
    expect(html).toContain(`<h1 class="hero">${t('bad.late')}</h1>`);
    expect(html).toContain('type="checkbox"');
    expect(late).toContain(t('welcome.ready'));
  });
});

describe('the missed-day welcome is unchanged', () => {
  const lines = ['bad.hero', 'bad.missed', 'bad.everybody', 'bad.vonnegut', 'bad.vonnegut.cite', 'bad.notAlone', 'bad.shorter', 'welcome.ready'] as const;
  it.each(lines)('in the morning it shows %s', (id) => { expect(SCREENS.missedWelcome).toContain(t(id)); });
  it.each(lines)('when late it shows %s', (id) => { expect(SCREENS.missedWelcomeLate).toContain(t(id)); });
  it('follows the cutoff: the morning eyebrow and hour line, or the late eyebrow and none', () => {
    expect(SCREENS.missedWelcome).toContain(t('welcome.eyebrow.morning'));
    expect(SCREENS.missedWelcome).toContain(t('welcome.hour'));
    expect(SCREENS.missedWelcomeLate).toContain(t('welcome.eyebrow.late'));
    expect(SCREENS.missedWelcomeLate).not.toContain(t('welcome.hour'));
    expect(SCREENS.missedWelcomeLate).not.toContain(t('bad.late'));
  });
});
