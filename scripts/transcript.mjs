// The one way to find the talk transcript, for scripts/check-method-quotes.mjs and src/copy.test.ts.
// The transcript is not in the repo (the talk is someone else's content), so every check that needs it skips when it is
// absent: locally it runs, in CI it does not. A transcript line starts with its timestamp in brackets: `[4:36] words`.
// The path is the explicit argument, else $FERRISS_TRANSCRIPT, else $TRANSCRIPT (the older name, still read).
import { existsSync, readFileSync } from 'node:fs';

export const TRANSCRIPT_HINT = 'pass a path or set FERRISS_TRANSCRIPT';

/** The transcript's path, or null when none is given or the file does not exist. An empty value counts as unset. */
export function transcriptPath(arg) {
  const path = arg || process.env.FERRISS_TRANSCRIPT || process.env.TRANSCRIPT;
  return path && existsSync(path) ? path : null;
}

/** The transcript's path and text, or null (see transcriptPath). */
export function readTranscript(arg) {
  const path = transcriptPath(arg);
  return path ? { path, text: readFileSync(path, 'utf8') } : null;
}
