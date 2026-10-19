// The ci.yml deploy gate and the Dependabot policy (scripts/check-workflows.mjs lists the rules).

import { asList, firstLine, isWranglerDeploy } from './common.mjs';

export function checkCi(f, jobs, jobAt) {
  const { doc, line, fail } = f;
  const runs = (j) => asList(jobs[j]?.steps).map((st) => (typeof st.run === 'string' ? st.run : ''));
  const q = (x) => `"${x}"`;

  // a: the deploy gate
  const { deploy, journeys, check } = jobs;
  if (!check) fail('a', line('jobs:'), 'ci.yml has no `check` job: it runs `npm run check`');
  if (!journeys) fail('a', line('jobs:'), 'ci.yml has no `journeys` job: deploy must wait for the journeys');
  else if (!asList(journeys.needs).includes('check')) fail('a', jobAt('journeys'), 'job journeys does not need check: write `needs: check`, so the journeys run on a build that passed the loop');
  if (!deploy) { fail('a', line('jobs:'), 'ci.yml has no `deploy` job: the deploy gate below checks it'); return; }
  const D = jobAt('deploy');
  const needs = asList(deploy.needs);
  const missing = ['check', 'journeys'].filter((x) => !needs.includes(x));
  const shown = typeof deploy.needs === 'string' ? `${q(deploy.needs)} (one job name)` : `[${needs.map(q).join(', ')}]`;
  if (missing.length) fail('a', line('needs', D), `job deploy needs ${shown}, which does not include ${missing.map(q).join(' or ')}: write \`needs: [check, journeys]\`, or a master build whose journeys fail would go live`);

  // b: only a push to master in this repository
  const cond = String(deploy.if ?? '');
  const condAt = deploy.if ? line('if:', D) : D;
  const want = [[/github\.event_name\s*==\s*'push'/, "github.event_name == 'push'"], [/github\.ref\s*==\s*'refs\/heads\/master'/, "github.ref == 'refs/heads/master'"], [/github\.repository\s*==\s*'[^']+'/, "github.repository == '<owner>/<repo>'"]];
  for (const [re, txt] of want) if (!re.test(cond)) fail('b', condAt, `job deploy: its if does not test ${txt}: deploy only for a push to master in this repository, joined with &&`);
  const loose = cond.match(/\|\||\balways\(\)|\bcancelled\(\)|\bfailure\(\)|\bneeds\.[\w-]+\.result\b/);
  if (loose) fail('b', condAt, `job deploy: its if uses ${loose[0]}, which lets deploy run when a needed job failed or for another event: join only the push, master and repository tests with &&`);

  // c: deploy has a Wrangler deploy step
  if (!runs('deploy').some((r) => isWranglerDeploy(r))) fail('c', D, 'job deploy has no `wrangler deploy` step: the secrets belong in its env');

  // e: fast subset on pull requests only
  const jStep = asList(journeys?.steps).find((st) => /e2e\/run\.mjs|npm run journeys/.test(typeof st.run === 'string' ? st.run : ''));
  if (journeys && !jStep) fail('e', jobAt('journeys'), 'job journeys has no step that runs e2e/run.mjs: run `node e2e/run.mjs --serve ...`');
  if (jStep) {
    const at = line(firstLine(jStep.run).trim(), jobAt('journeys'));
    const prFast = /\$\{\{[^}]*github\.event_name\s*==\s*'pull_request'\s*&&\s*'--fast'\s*\|\|\s*''\s*\}\}/;
    if (!prFast.test(jStep.run)) fail('e', at, "the journeys step must pass --fast only on pull requests: append ${{ github.event_name == 'pull_request' && '--fast' || '' }}");
    else if (/--fast|journeys:fast/.test(jStep.run.replace(prFast, ''))) fail('e', at, "the journeys step passes --fast outside the pull_request condition, so a push to master would skip journeys: keep only ${{ github.event_name == 'pull_request' && '--fast' || '' }}");
  }

  // f: the loop, the preflight and the read-only verification
  if (check && !runs('check').some((r) => /\bnpm run check(?![:\w-])/.test(r))) fail('f', jobAt('check'), 'job check does not run `npm run check`: add `- run: npm run check`');
  if (check && !runs('check').some((r) => /deploy\s+--dry-run/.test(r))) fail('f', jobAt('check'), 'job check has no Wrangler dry run: add a step that runs npx --yes "wrangler@${WRANGLER_VERSION}" deploy --dry-run --outdir "$RUNNER_TEMP/wrangler-out"');
  const verifies = runs('deploy').filter((r) => /\bnpm run verify:live\b/.test(r));
  if (!verifies.length) fail('f', D, 'job deploy does not verify with `npm run verify:live`: add `- run: npm run verify:live -- --retries 10 --post-deploy` after the deploy step (not an inline curl)');
  else if (!verifies.some((r) => /\bnpm run verify:live\s+--\s(?:[^;&|\n]*\s)?--post-deploy(?![\w-])/.test(r))) fail('f', line('verify:live', D), 'job deploy runs `npm run verify:live` without `--post-deploy`: add it (`npm run verify:live -- --retries 10 --post-deploy`); without it the live header and manifest checks would only be PENDING and never enforced');
  if (runs('deploy').some((r) => /\bcurl\b/.test(r))) fail('f', line('curl', D), 'job deploy runs curl: verify the live site only with `npm run verify:live`, which is read-only and checks the bytes');

  // g: one version, set at workflow level
  if (!/^\d+\.\d+\.\d+$/.test(String(doc.env?.WRANGLER_VERSION ?? ''))) fail('g', line('env:'), 'set `WRANGLER_VERSION: x.y.z` (an exact version) in the workflow-level env: the preflight and the deploy both read it');

  // h: deploy concurrency and environment
  if (!deploy.concurrency?.group || deploy.concurrency['cancel-in-progress'] !== false) fail('h', deploy.concurrency ? line('concurrency:', D) : D, 'job deploy needs `concurrency: { group: deploy-production, cancel-in-progress: false }`: one deploy at a time, never cancelled halfway');
  if (!(typeof deploy.environment === 'string' ? deploy.environment : deploy.environment?.name)) fail('h', D, 'job deploy declares no environment: add `environment: { name: production, url: https://dothehardthing.app }`');
}

export function checkDependabot(dep) {
  const updates = asList(dep.doc.updates);
  for (const eco of ['npm', 'github-actions']) {
    const u = updates.find((x) => x?.['package-ecosystem'] === eco);
    if (!u) { dep.fail('i', dep.line('updates:'), `no \`package-ecosystem: ${eco}\` entry: add one with a weekly schedule`); continue; }
    const at = dep.line(`package-ecosystem: ${eco}`);
    const grouped = Object.values(u.groups ?? {}).some((g) => ['minor', 'patch'].every((t) => asList(g?.['update-types']).includes(t)));
    if (!grouped) dep.fail('i', at, `${eco}: no group covers minor and patch: add \`groups: { ${eco}-minor-and-patch: { update-types: ["minor", "patch"] } }\``);
    if (eco === 'npm' && !asList(u.ignore).some((x) => asList(x?.['update-types']).includes('version-update:semver-major')))
      dep.fail('i', at, 'npm: no ignore for majors: add `ignore: [{ dependency-name: "*", update-types: ["version-update:semver-major"] }]` (a major is a planned upgrade)');
  }
  if (!dep.lines.some((l) => /#.*security/i.test(l))) dep.fail('i', 1, 'no comment says "security": keep the comment that an ignore also drops security updates, and where to look for them');
}