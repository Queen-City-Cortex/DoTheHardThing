// The one way to find the talk transcript, for scripts/check-method-quotes.mjs and src/copy/talk.test.ts.
// The transcript is not in the repo (the talk is someone else's content), so every check that needs it skips when none
// is set: locally it runs, in CI it does not. A path that is set but cannot be read is an error, never a skip, so a typo
// cannot turn the checks into a silent no-op. A transcript line starts with its timestamp in brackets: `[4:36] words`.
// The path is the explicit argument, else $FERRISS_TRANSCRIPT, else $TRANSCRIPT (the older name, still read).
import { readFileSync } from 'node:fs';

export const TRANSCRIPT_HINT = 'pass a path or set FERRISS_TRANSCRIPT';

/** The transcript path that is set, whether or not the file exists, or null when none is. An empty value counts as unset. */
export function transcriptPath(arg) {
  return arg || process.env.FERRISS_TRANSCRIPT || process.env.TRANSCRIPT || null;
}

/**
 * null when no path is set (skip); `{ path, text }` when it was read; `{ path, error }` when a path is set but cannot be
 * read (missing, a directory, unreadable): the caller fails with `error`, which names the path.
 */
export function readTranscript(arg) {
  const path = transcriptPath(arg);
  if (!path) return null;
  try {
    return { path, text: readFileSync(path, 'utf8') };
  } catch (e) {
    const why = e.code === 'ENOENT' ? 'no such file' : e.code === 'EISDIR' ? 'it is a directory' : e.message;
    return { path, error: `cannot read the transcript at ${path} (${why}): fix the path, or unset it to skip the talk checks` };
  }
}
