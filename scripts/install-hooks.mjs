// prepare: point git at the tracked hooks in .githooks, so every contributor gets the pre-commit file size check after
// `npm ci` or `npm install`. It never fails the install: it does nothing in CI, outside a git checkout (an npm tarball, a
// `git archive` export), without git, or when core.hooksPath is already set to something else in any git config scope,
// global included (it will not take that over, and says so).
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOOKS_DIR = '.githooks';
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Returns what it did, as a short string; sets core.hooksPath only when that is safe. */
export function installHooks(env = process.env, run = git) {
  if (env.CI) return 'skipped: CI';
  try {
    // --show-prefix is empty only at the top of a work tree, so a package unpacked inside some other repo is left alone
    if (run(['rev-parse', '--show-prefix']) !== '') return 'skipped: not the top of a git checkout';
    if (!existsSync(HOOKS_DIR)) return `skipped: no ${HOOKS_DIR} directory`;
    let current = '';
    try { current = run(['config', '--get', 'core.hooksPath']); } catch { /* unset */ }
    if (current === HOOKS_DIR) return 'already set';
    if (current) return `skipped: core.hooksPath is already ${current}`;
    run(['config', '--local', 'core.hooksPath', HOOKS_DIR]);
    return `set core.hooksPath to ${HOOKS_DIR}`;
  } catch {
    return 'skipped: not a git checkout, or git is not available';
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) console.log(`install-hooks: ${installHooks()}`);
