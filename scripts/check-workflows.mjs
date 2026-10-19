// check:workflows: the CI workflow and the Dependabot policy keep the properties the deploy depends on. The YAML is parsed,
// never run, and nothing is fetched. Every problem prints file:line, the rule letter and the fix; a shape the check cannot
// read (a null step, a string where a mapping belongs) prints the same way, never a stack trace.
//   a  ci.yml has a `deploy` job that needs both `check` and `journeys` (it once waited for `check` only, so a master
//      build with failing journeys could have gone live), and `journeys` needs `check`
//   b  deploy runs only for a push to master in this repository: its `if` names github.event_name == 'push',
//      refs/heads/master and github.repository, joined with && only: no `||`, always(), cancelled(), failure() or
//      needs.<job>.result, each of which lets deploy run after a needed job failed or for another event
//   c  `secrets` (the word, inside a ${{ }} expression or an `if`: secrets.NAME, secrets[...], toJSON(secrets)) appears
//      only in the env of the deploy job's step whose run is exactly npx --yes "wrangler@${WRANGLER_VERSION}" deploy
//      (never in a run string, never at workflow or job level); every `permissions` block grants read or none only, and
//      the workflow sets contents: read
//   d  every `uses:` is pinned to a 40-hex commit sha (a trailing version comment is fine)
//   e  the journeys step runs `--fast` only when github.event_name == 'pull_request', so a push runs every journey
//   f  the check job runs `npm run check` and a `deploy --dry-run`; the deploy job verifies with `npm run verify:live`
//      passing `--post-deploy` (without it the checks of this build's headers and manifest only print PENDING);
//      no run string sends data (`-X POST`, `--request POST`, or curl or wget with `--data`, `-d`, `--post-data`) and no
//      value names POST and api/event together
//   g  Wrangler's version is the workflow-level env WRANGLER_VERSION (an exact x.y.z); every wrangler invocation (`npx ...
//      wrangler`, or `wrangler` followed by a subcommand) uses it and none hard-codes `wrangler@<n>`
//   h  every job has timeout-minutes (a number or a ${{ }} expression); deploy has a concurrency group with
//      cancel-in-progress: false and an environment
//   i  dependabot.yml: npm and github-actions each have a group covering minor and patch; npm ignores semver-major; a
//      comment says "security" (an ignore also drops security updates, and the file must say so)
//   j  no `continue-on-error` key anywhere in any workflow: it turns a red step or job green, so deploy's needs pass
//   k  ci.yml runs `on:` exactly push (branches exactly [master]) and pull_request; no workflow file runs on
//      pull_request_target (fork pull requests with this repository's secrets)
//   l  a real `wrangler deploy` or `wrangler publish` (not --dry-run) runs only in ci.yml job deploy, in any workflow file
// Not caught (see the gaps test in check-workflows.test.mjs): an `if` that is logically wrong but still names the right
// words, a step that never runs, a shell bug inside a run string, an action whose pinned sha is not the version its
// comment claims. actionlint (a release binary, run by hand when you change .github/workflows) catches the syntax and
// shell classes; nothing here replaces it.
// js-yaml is a declared devDependency (check:imports keeps it so), not something borrowed from eslint's dependency tree.
// Usage: node scripts/check-workflows.mjs   (npm run check:workflows). WORKFLOWS_DIR and DEPENDABOT_FILE (relative to the
// repo root, or absolute) point it at other files, for the tests.

import fs from 'node:fs';
import path from 'node:path';
import { DIR, DEPENDABOT, RULES, rel, problems, open } from './check-workflows/common.mjs';
import { checkWorkflow } from './check-workflows/workflow.mjs';
import { checkDependabot } from './check-workflows/ci-and-dependabot.mjs';


let files = [];
try {
  files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n)).sort() : [];
  if (!files.length) problems.push(`${rel(DIR)}: no workflow files: point WORKFLOWS_DIR at .github/workflows`);
  if (files.length && !files.includes('ci.yml')) problems.push(`${rel(DIR)}: no ci.yml: the deploy gate lives in ci.yml`);
  for (const n of files) {
    const f = open(path.join(DIR, n));
    if (f) checkWorkflow(f, n);
  }
  const dep = fs.existsSync(DEPENDABOT) ? open(DEPENDABOT) : (problems.push(`${rel(DEPENDABOT)}: missing: the Dependabot policy lives there`), null);
  if (dep) dep.rule('i', 1, () => checkDependabot(dep));
} catch (e) {
  problems.push(`the check stopped (${e.message}): run it from the repo root on readable files`);
}

if (problems.length) {
  const unique = new Set(problems);
  for (const p of unique) console.error(`check:workflows FAIL: ${p}`);
  console.error(`check:workflows: ${unique.size} problem(s); each line names the rule (a to l in scripts/check-workflows.mjs) and the fix`);
  process.exit(1);
}
console.log(`workflows OK: ${files.length} workflow file${files.length === 1 ? '' : 's'}, ${RULES.length} rules`);