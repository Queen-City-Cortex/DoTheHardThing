// Reads the talk transcript into lines and finds a quote in them, word for word; shared by quote-matcher.test.ts and talk.test.ts.


// ---- the talk ----
export interface TalkLine { ref: string; text: string }
export const parseTalk = (raw: string): TalkLine[] => raw.split(/\r?\n/).flatMap((line) => {
  const m = /^\[(\d+:\d\d)\]\s?(.*)$/.exec(line.trim());
  return m ? [{ ref: m[1], text: m[2] }] : [];
});
// Case, commas, apostrophes and spacing do not count ("You're" matches "youre"). Sentence ends do: each run of . ? or !
// stays as its own word, so a quote that ends with a period must end where the talk's sentence ends (a quote cut short
// mid-sentence fails), and a question stays a question. A fragment written without end punctuation (a step title) is
// checked for its words only.
export const normalize = (s: string) => s.toLowerCase().replace(/[‘’']/g, '')
  .replace(/([.?!])[.?!]*/g, ' $1 ').replace(/[^a-z0-9.?!]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The lines each occurrence of a quote spans, in talk order; empty when its words are not in the talk in that order. Whole words only. */
export function findQuote(lines: TalkLine[], quote: string): TalkLine[][] {
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
export const startRefs = (lines: TalkLine[], quote: string) => findQuote(lines, quote).map((hit) => hit[0].ref);
