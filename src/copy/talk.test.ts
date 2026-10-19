// The talk checks of src/copy.ts: run only where FERRISS_TRANSCRIPT points at the transcript (locally, not in CI; scripts/transcript.mjs
// finds it) and show as skipped otherwise.

import { describe, expect, it } from 'vitest';
import { readTranscript } from '../../scripts/transcript.mjs';
import { entries } from './entries.testlib';
import { parseTalk, startRefs } from './talk-matcher.testlib';

const transcript = readTranscript();
export const talk = transcript?.text != null ? parseTalk(transcript.text) : [];
// a path that is set but unreadable, or a file with no [m:ss] lines, is one clear failure, never a skip or 16 failures
const unusable = !transcript ? null
  : transcript.error ?? (talk.length ? null : `no [m:ss] lines found in ${transcript.path}: each line must start with its timestamp, e.g. [4:36] words`);
const WHERE = transcript
  ? `against the transcript at ${transcript.path}`
  : 'SKIPPED: set FERRISS_TRANSCRIPT to the talk transcript file to run them. It is not in the repo, so CI skips them';
// vitest lists skipped tests only as a count, so say why once in the run's output
if (!transcript) console.warn(`src/copy/talk.test.ts: quote and paraphrase-ref checks ${WHERE}.`);
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
