// src/copy.ts: the kind and ref of every line, the REQUIRED lines on their screens, and (where a transcript is set) the
// quotes against the talk.
// The transcript is not in the repo, so the talk checks run only where FERRISS_TRANSCRIPT points at one (locally, not in
// CI; scripts/transcript.mjs finds it) and show as skipped otherwise. Everything else here runs everywhere.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COPY, REQUIRED, t, type CopyEntry, type CopyId } from './copy';
import { Close, Closed, Pick, Welcome } from './App';
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
/** The lines a quote spans, or null when its words are not in the talk in that order. Whole words only. */
function findQuote(lines: TalkLine[], quote: string): TalkLine[] | null {
  const q = normalize(quote);
  let joined = '';
  const starts: number[] = [];
  for (const l of lines) { starts.push(joined.length); joined += normalize(l.text) + ' '; }
  const at = (' ' + joined).indexOf(' ' + q + ' ');
  if (at < 0) return null;
  const lineAt = (pos: number) => starts.filter((s) => s <= pos).length - 1;
  return lines.slice(lineAt(at), lineAt(at + q.length - 1) + 1);
}

describe('the quote matcher', () => {
  const talk = parseTalk('[0:01] one two\n[0:02] three, four. Five six?\n[0:03] seven');
  it('ignores case, commas, apostrophes and spacing, not sentence ends', () => {
    expect(normalize('You’re  better,\nthan-you.')).toBe('youre better than you .');
    expect(findQuote(talk, 'Two three, four.')?.map((l) => l.ref)).toEqual(['0:01', '0:02']);
    expect(findQuote(talk, 'TWO   three four.')?.map((l) => l.ref)).toEqual(['0:01', '0:02']);
  });
  it('matches whole words only', () => {
    expect(findQuote(talk, 'two thre')).toBeNull();
    expect(findQuote(talk, 'wo three')).toBeNull();
  });
  it('fails a quote cut short of the sentence end, and keeps . ? ! apart', () => {
    expect(findQuote(talk, 'Two three.')).toBeNull();
    expect(findQuote(talk, 'Five six.')).toBeNull();
    expect(findQuote(talk, 'Five six?')).not.toBeNull();
  });
  it('checks a fragment without end punctuation for its words', () => {
    expect(findQuote(talk, 'Two three')).not.toBeNull();
    expect(findQuote(talk, 'one two three')?.map((l) => l.ref)).toEqual(['0:01', '0:02']);
    expect(findQuote(talk, 'six seven')).toBeNull(); // a fragment does not run over a sentence end
  });
});

const transcript = readTranscript();
const talk = transcript ? parseTalk(transcript.text) : [];
const WHERE = transcript
  ? `against the transcript at ${transcript.path}`
  : 'SKIPPED: set FERRISS_TRANSCRIPT to the talk transcript file to run them. It is not in the repo, so CI skips them';
// vitest lists skipped tests only as a count, so say why once in the run's output
if (!transcript) console.warn(`src/copy.test.ts: quote and paraphrase-ref checks ${WHERE}.`);
describe.skipIf(!transcript)(`copy ${WHERE}`, () => {
  it.each(entries.filter(([, e]) => e.kind === 'quote'))('quote %s is in the talk word for word, starting at its ref', (_id, e) => {
    const hit = findQuote(talk, e.text);
    expect(hit, `"${e.text}" is not in the transcript word for word (case, commas, apostrophes and spacing aside, ending where the talk's sentence ends). Quote it word for word, or make it kind: 'paraphrase'.`).not.toBeNull();
    expect(e.ref, `the quote starts on the [${hit![0].ref}] line: set ref: '${hit![0].ref}'`).toBe(hit![0].ref);
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

// ---- required lines ----
// the screen as plain text: tags out, React's escapes of & < > " ' undone
const text = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const noop = () => {};
const bad = (p: Partial<L.BadDay>): L.BadDay => ({ missedDays: 0, late: false, bad: false, firstVisit: false, ...p });
const welcome = (b: Partial<L.BadDay>) => text(h(Welcome, { bad: bad(b), onStart: noop, small: false, setSmall: noop }));
const item = (name: string, yes: boolean): L.Item => ({ id: name, text: name, tags: ['risky'], satisfied: yes, leverage: yes, pushedCount: 0 });
const day = (items: L.Item[]): L.Day => ({ ...L.newDay('2026-10-14', 0), items });
const pick = (items: L.Item[]) => text(h(Pick, { day: day(items), small: false, upd: noop, onBack: noop, onStart: noop }));
const close = (didIt: boolean | null, total: number) => text(h(Close, { didIt, total, onAnswer: noop, onDays: noop, onDone: noop }));
const closed = (didIt: boolean) => text(h(Closed, { didIt, onDays: noop, onStartOver: noop }));
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
