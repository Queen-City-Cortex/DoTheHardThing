import { describe, expect, it } from 'vitest';
import { parseTalk, normalize, findQuote, startRefs } from './talk-matcher.testlib';

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