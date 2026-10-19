// Which sub-step a screen opens on. Name's step and Ask's item are component state (src/App/Name.tsx, src/App/Ask.tsx);
// the screen state says only which one a screen opens on, so Back from Ask's first item returns to Name's last step,
// the one the user came from.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import * as L from './logic';
import * as S from './state';
import { t } from './copy';
import { Name } from './App';
import { text, noop, day, item } from './copy/screens.testlib';

const T0 = new Date('2026-10-14T07:30:00').getTime();
const go = (s: S.State, as: S.Action[]) => as.reduce((x, a) => S.reduce(x, a, T0), s);
const two = () => L.addOrTag(L.addOrTag([], 'Taxes', 'risky', 'a').items, 'Call mom', 'anxious', 'b').items;
const no = (id: string): S.Action[] => [{ type: 'answer', id, field: 'satisfied', value: false }, { type: 'answer', id, field: 'leverage', value: false }];
const toAsk = () => go(S.init([], T0), [{ type: 'start' }, { type: 'editItems', items: two() }, { type: 'namingDone' }]);

describe('the sub-step a screen opens on', () => {
  it('I\'m ready opens Name on its first step', () => {
    expect(go(S.init([], T0), [{ type: 'start' }])).toMatchObject({ screen: 'name', opensAt: 'first' });
  });
  it('Back from Ask\'s first item opens Name on its last step, the one the user came from, items and answers kept', () => {
    const ask = go(toAsk(), no('a'));
    const back = S.reduce(ask, { type: 'stepBack' }, T0);
    expect(back).toMatchObject({ screen: 'name', opensAt: 'last' });
    expect(S.dayOf(back)).toBe(S.dayOf(ask));
    // and on to Ask again, then Back from Name's first step to Welcome, as before
    expect(S.reduce(back, { type: 'namingDone' }, T0).screen).toBe('ask');
    expect(S.reduce(back, { type: 'stepBack' }, T0).screen).toBe('welcome');
  });
  it('an item edit keeps the step Name opened on (it does not remount)', () => {
    const back = S.reduce(toAsk(), { type: 'stepBack' }, T0);
    expect(S.reduce(back, { type: 'editItems', items: two().slice(0, 1) }, T0)).toMatchObject({ screen: 'name', opensAt: 'last' });
  });
  it('About or Your days over Name goes back to its first step, as before (Name remounts when the overlay closes)', () => {
    const back = S.reduce(toAsk(), { type: 'stepBack' }, T0);
    const about = S.reduce(back, { type: 'open', to: 'about' }, T0);
    expect(about).toMatchObject({ screen: 'about', under: { screen: 'name', opensAt: 'first' } });
    expect(S.reduce(about, { type: 'back' }, T0)).toMatchObject({ screen: 'name', opensAt: 'first' });
    expect(S.dayOf(about)).toBe(S.dayOf(back));
    const first = go(S.init([], T0), [{ type: 'start' }]);
    expect(S.reduce(S.reduce(first, { type: 'open', to: 'days' }, T0), { type: 'back' }, T0)).toEqual(first);
  });
  it('Look again on Nothing got a yes opens Ask (on its first item: Ask carries no step to open on)', () => {
    const none = go(toAsk(), [...no('a'), ...no('b'), { type: 'askDone' }]);
    expect(none.screen === 'pick' && none.list).toEqual([]);
    const again = S.reduce(none, { type: 'stepBack' }, T0);
    expect(again).toEqual({ screen: 'ask', day: S.dayOf(none), small: false });
  });
});

describe('Name renders the step it opens on', () => {
  const items = [item('Taxes', null, ['risky']), item('Call mom', null, ['anxious'])];
  const name = (opensAt: 'first' | 'last') => text(h(Name, { day: day(items), history: [], today: '2026-10-14', opensAt, upd: noop, onBack: noop, onNext: noop }));
  it('first: step 1 of 3, What have you been putting off?', () => {
    expect(name('first')).toContain(t('name.pushed'));
    expect(name('first')).not.toContain(t('name.anxious'));
  });
  it('last: step 3 of 3, the anxious step, with Two questions', () => {
    expect(name('last')).toContain(t('name.anxious'));
    expect(name('last')).toContain(t('twoQuestions'));
    expect(name('last')).not.toContain(t('name.pushed'));
  });
});
