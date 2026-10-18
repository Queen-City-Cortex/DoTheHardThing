// src/copy.ts: the kind and ref of every line, the REQUIRED lines on their screens, and (where a transcript is set) the
// quotes against the talk.
// The transcript is not in the repo, so the talk checks run only where FERRISS_TRANSCRIPT points at one (locally, not in
// CI; scripts/transcript.mjs finds it) and show as skipped otherwise. Everything else here runs everywhere.
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COPY, REQUIRED, fmt, t, type CopyEntry, type CopyId } from './copy';
import { About, Ask, BlockView, Close, Closed, Days, Name, Pick, Welcome } from './App';
import * as L from './logic';
import { readTranscript } from '../scripts/transcript.mjs';

const entries = Object.entries(COPY) as [CopyId, CopyEntry][];
const cited = entries.filter(([, e]) => e.kind !== 'own');

// ---- the talk ----
interface TalkLine { ref: string; text: string }
const parseTalk = (raw: string): TalkLine[] => raw.split(/\r?\n/).flatMap((line) => {
  const m = /^\[(\d+:\d\d)\]\s?(.*)$/.exec(line.trim());
  return m ? [{ ref: m[1], text: m[2] }] : [];
});
// Case, commas, apostrophes and spacing do not count ("You're" matches "youre"). Sentence ends do: each run of . ? or !
// stays as its own word, so a quote that ends with a period must end where the talk's sentence ends (a quote cut short
// mid-sentence fails), and a question stays a question. A fragment written without end punctuation (a step title) is
// checked for its words only.
const normalize = (s: string) => s.toLowerCase().replace(/[‘’']/g, '')
  .replace(/([.?!])[.?!]*/g, ' $1 ').replace(/[^a-z0-9.?!]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The lines each occurrence of a quote spans, in talk order; empty when its words are not in the talk in that order. Whole words only. */
function findQuote(lines: TalkLine[], quote: string): TalkLine[][] {
  const q = normalize(quote);
  let joined = ' ';
  const starts: number[] = [];
  for (const l of lines) { starts.push(joined.length); joined += normalize(l.text) + ' '; }
  const lineAt = (pos: number) => starts.filter((s) => s <= pos).length - 1;
  const hits: TalkLine[][] = [];
  for (let at = joined.indexOf(' ' + q + ' '); at >= 0; at = joined.indexOf(' ' + q + ' ', at + 1)) {
    hits.push(lines.slice(lineAt(at + 1), lineAt(at + q.length) + 1));
  }
  return hits;
}
/** The ref of each line a quote starts on, one per occurrence. */
const startRefs = (lines: TalkLine[], quote: string) => findQuote(lines, quote).map((hit) => hit[0].ref);

describe('the quote matcher', () => {
  const talk = parseTalk('[0:01] one two\n[0:02] three, four. Five six?\n[0:03] seven');
  const spans = (quote: string) => findQuote(talk, quote).map((hit) => hit.map((l) => l.ref));
  it('ignores case, commas, apostrophes and spacing, not sentence ends', () => {
    expect(normalize('You’re  better,\nthan-you.')).toBe('youre better than you .');
    expect(spans('Two three, four.')).toEqual([['0:01', '0:02']]);
    expect(spans('TWO   three four.')).toEqual([['0:01', '0:02']]);
  });
  it('matches whole words only', () => {
    expect(spans('two thre')).toEqual([]);
    expect(spans('wo three')).toEqual([]);
    expect(spans('one two three, four. Five six? seven')).toEqual([['0:01', '0:02', '0:03']]); // the first and last words count
  });
  it('fails a quote cut short of the sentence end, and keeps . ? ! apart', () => {
    expect(spans('Two three.')).toEqual([]);
    expect(spans('Five six.')).toEqual([]);
    expect(spans('Five six?')).toEqual([['0:02']]);
  });
  it('checks a fragment without end punctuation for its words', () => {
    expect(spans('Two three')).toEqual([['0:01', '0:02']]);
    expect(spans('one two three')).toEqual([['0:01', '0:02']]);
    expect(spans('six seven')).toEqual([]); // a fragment does not run over a sentence end
  });
  it('finds every occurrence of a quote the talk says more than once, each with its start line', () => {
    const twice = parseTalk('[0:01] Pick the one thing.\n[0:02] Then rest.\n[0:03] I repeat: pick the\n[0:04] one thing.');
    expect(startRefs(twice, 'Pick the one thing.')).toEqual(['0:01', '0:03']);
    expect(findQuote(twice, 'Pick the one thing.')[1].map((l) => l.ref)).toEqual(['0:03', '0:04']);
    expect(startRefs(twice, 'the one thing.')).toEqual(['0:01', '0:03']);
    expect(startRefs(twice, 'Then rest.')).toEqual(['0:02']);
  });
  it('reads only [m:ss] lines', () => {
    expect(parseTalk('[1:02:03] an hour in\nno stamp\n[4:5] short')).toEqual([]);
    expect(parseTalk(' [12:34] words \r\n[0:00]')).toEqual([{ ref: '12:34', text: 'words' }, { ref: '0:00', text: '' }]);
  });
});

const transcript = readTranscript();
const talk = transcript?.text != null ? parseTalk(transcript.text) : [];
// a path that is set but unreadable, or a file with no [m:ss] lines, is one clear failure, never a skip or 16 failures
const unusable = !transcript ? null
  : transcript.error ?? (talk.length ? null : `no [m:ss] lines found in ${transcript.path}: each line must start with its timestamp, e.g. [4:36] words`);
const WHERE = transcript
  ? `against the transcript at ${transcript.path}`
  : 'SKIPPED: set FERRISS_TRANSCRIPT to the talk transcript file to run them. It is not in the repo, so CI skips them';
// vitest lists skipped tests only as a count, so say why once in the run's output
if (!transcript) console.warn(`src/copy.test.ts: quote and paraphrase-ref checks ${WHERE}.`);
describe.skipIf(!transcript)(`copy ${WHERE}`, () => {
  if (unusable) {
    it('the transcript can be read and has [m:ss] lines', () => { throw new Error(unusable); });
    return;
  }
  it.each(entries.filter(([, e]) => e.kind === 'quote'))('quote %s is in the talk word for word, starting at its ref', (_id, e) => {
    const refs = startRefs(talk, e.text);
    expect(refs.length, `"${e.text}" is not in the transcript word for word (case, commas, apostrophes and spacing aside, ending where the talk's sentence ends). Quote it word for word, or make it kind: 'paraphrase'.`).toBeGreaterThan(0);
    const said = refs.length > 1 ? `the talk says it ${refs.length} times, starting on [${refs.join('], [')}]: set ref to one of them` : `the quote starts on the [${refs[0]}] line: set ref: '${refs[0]}'`;
    expect(refs, said).toContain(e.ref);
  });
  it.each(entries.filter(([, e]) => e.kind === 'paraphrase'))('paraphrase %s points at a line of the talk', (_id, e) => {
    expect(talk.map((l) => l.ref), `ref '${e.ref}' is not a transcript timestamp: set it to the [m:ss] of the line this paraphrases`).toContain(e.ref);
  });
});

// ---- kinds and refs, no transcript needed ----
describe('every copy entry has a kind and the right ref', () => {
  it.each(cited)('%s (quote or paraphrase) has a talk timestamp m:ss', (_id, e) => {
    expect(e.ref, "a quote or paraphrase needs ref: the [m:ss] transcript timestamp of the line it comes from").toMatch(/^\d+:\d{2}$/);
  });
  it.each(entries.filter(([, e]) => e.kind === 'own'))('%s (own) carries no ref', (_id, e) => {
    expect('ref' in e, "the app's own words never carry a talk timestamp: drop ref, or make it kind: 'paraphrase'").toBe(false);
  });
  it.each(entries)('%s has trimmed, non-empty text and a known kind', (_id, e) => {
    expect(['quote', 'paraphrase', 'own']).toContain(e.kind);
    expect(e.text.trim()).not.toBe('');
    expect(e.text).toBe(e.text.trim());
  });
  it('no two ids hold the same text: one line, one entry, used wherever it shows (tsc already rejects a repeated id)', () => {
    const seen = new Map<string, string>();
    for (const [id, e] of entries) {
      expect(seen.get(e.text), `${id} repeats ${seen.get(e.text)}: use t('${seen.get(e.text)}') in both places`).toBeUndefined();
      seen.set(e.text, id);
    }
  });
});

// a quote or paraphrase needs a ref in m:ss form; the app's own words can never carry one
// @ts-expect-error quote without ref
export const quoteNoRef: CopyEntry = { kind: 'quote', text: 'x' };
// @ts-expect-error paraphrase without ref
export const paraphraseNoRef: CopyEntry = { kind: 'paraphrase', text: 'x' };
// @ts-expect-error own with a ref
export const ownRef: CopyEntry = { kind: 'own', text: 'x', ref: '4:32' };
// @ts-expect-error a ref that is not a timestamp
export const badRef: CopyEntry = { kind: 'quote', text: 'x', ref: 'soon' };
// @ts-expect-error seconds need two digits
export const shortRef: CopyEntry = { kind: 'quote', text: 'x', ref: '4:5' };
// @ts-expect-error seconds need two digits, no more
export const longRef: CopyEntry = { kind: 'quote', text: 'x', ref: '4:055' };

// ---- required lines ----
// the screen as plain text: tags out, React's escapes of & < > " ' undone
const text = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const noop = () => {};
const bad = (p: Partial<L.BadDay>): L.BadDay => ({ missedDays: 0, late: false, bad: false, firstVisit: false, ...p });
const welcome = (b: Partial<L.BadDay>) => text(h(Welcome, { bad: bad(b), onStart: noop, small: false, setSmall: noop }));
const item = (name: string, yes: boolean | null, tags: L.Tag[] = ['risky'], pushedCount = 0): L.Item => ({ id: name, text: name, tags, satisfied: yes, leverage: yes, pushedCount });
const day = (items: L.Item[], p: Partial<L.Day> = {}): L.Day => ({ ...L.newDay('2026-10-14', 0), items, ...p });
const pick = (items: L.Item[]) => text(h(Pick, { day: day(items), small: false, upd: noop, onBack: noop, onStart: noop }));
const close = (didIt: boolean | null, total: number) => text(h(Close, { didIt, total, onAnswer: noop, onDays: noop, onDone: noop }));
const closed = (didIt: boolean) => text(h(Closed, { didIt, onDays: noop, onStartOver: noop }));
// Name renders its first step (the later steps need a click); `history` brings leftovers from yesterday
const yesterday = day([item('Old letter', null, ['risky'], 1), item('Gym', null, ['pushed', 'anxious'])], { date: '2026-10-13', didIt: false });
const name = (items: L.Item[], history: L.Day[] = []) => text(h(Name, { day: day(items), history, today: '2026-10-14', upd: noop, onBack: noop, onNext: noop }));
const ask = (items: L.Item[]) => text(h(Ask, { items, setItem: noop, onBack: noop, onDone: noop }));
const T0 = 1_000_000;
const blk = (p: Partial<L.Block> = {}): L.Block => ({ ...L.startBlock(120, T0), ...p });
const block = (b: L.Block, it?: L.Item, now = T0 + 5 * 60_000) => text(h(BlockView, { block: b, item: it, now, set: noop }));
const done = (date: string, doneText: string | null = 'Ask for the raise') => day([], { date, didIt: true, doneText, closed: true });
// Your days reads today() for the month, so the clock is set while it renders
const days = (ds: L.Day[], archive: L.Archive = {}) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 8, 0));
  try { return text(h(Days, { days: ds, archive, onBack: noop })); } finally { vi.useRealTimers(); }
};
// About reads the reminder mode and the permission from window, Notification and navigator: stub them while it renders
type Env = 'unsupported' | 'open-only' | 'trigger';
const about = (env: Env, permission: L.Permission, reminder: string | null = null, total = 0) => {
  const notification = { permission };
  vi.stubGlobal('window', env === 'unsupported' ? {} : { Notification: notification, ...(env === 'trigger' ? { TimestampTrigger: class {} } : {}) });
  vi.stubGlobal('Notification', notification);
  if (env === 'trigger') vi.stubGlobal('navigator', { serviceWorker: {} });
  try { return text(h(About, { reminder, total, onDays: noop, setReminder: noop })); } finally { vi.unstubAllGlobals(); }
};
const twoItems = [item('Call mom', null, ['pushed', 'risky'], 2), item('Tax letter', true, ['anxious'])];
const SCREENS: Record<keyof typeof REQUIRED, string> = {
  firstWelcome: welcome({ firstVisit: true }),
  firstWelcomeLate: welcome({ firstVisit: true, late: true }),
  morningWelcome: welcome({}),
  lateWelcome: welcome({ late: true, bad: true }),
  missedWelcome: welcome({ missedDays: 2, bad: true }),
  nothingPicked: pick([item('Tax letter', false)]),
  pick: pick([item('Ask for the raise', true)]),
  close: close(null, 0),
  closeFirstYes: close(true, 1),
  closed: closed(true),
  closedNotToday: closed(false),
  nameFirst: name([]),
  nameLeftovers: name([], [yesterday]),
  ask: ask(twoItems),
  block: block(blk(), twoItems[0]),
  blockDrifted: block(blk({ drifts: [T0 + 1000] }), twoItems[0]),
  blockPaused: block(blk({ pausedAt: T0 + 60_000, breaks: 1 }), twoItems[0], T0 + 4 * 60_000),
  blockPauseUsed: block(blk({ breaks: 1, pausedMs: 30_000 }), twoItems[0]),
  daysEmpty: days([]),
  days: days([done('2026-10-02')]),
  aboutUnsupported: about('unsupported', 'denied'),
  aboutDenied: about('open-only', 'denied'),
  aboutAsk: about('trigger', 'default'),
  aboutAllowed: about('open-only', 'granted'),
};

describe('required lines are on their screens', () => {
  it.each(Object.entries(REQUIRED).flatMap(([s, ids]) => ids.map((id) => [s, id] as const)))('%s shows %s', (s, id) => {
    expect(SCREENS[s as keyof typeof REQUIRED], `${s} must render t('${id}'): "${t(id)}"`).toContain(t(id));
  });
  it.each(Object.entries(REQUIRED))('%s lists sentences only', (_s, ids) => {
    for (const id of ids) {
      const sentence = /[.?!]$/.test(t(id)) || t(id).split(/\s+/).filter((w) => /\w/.test(w)).length >= 4;
      expect(sentence, `${id} ("${t(id)}") is too short to prove anything; REQUIRED holds sentences only`).toBe(true);
    }
  });
});

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
