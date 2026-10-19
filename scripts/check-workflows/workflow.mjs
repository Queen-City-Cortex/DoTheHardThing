// Rules a to h and l: one workflow file (scripts/check-workflows.mjs lists them).

import { DEPLOY_RUN, asList, isMap, strings, keys, firstLine, isWranglerDeploy, callsWrangler, readsSecrets, checkPermissions } from './common.mjs';
import { checkCi } from './ci-and-dependabot.mjs';

export function checkWorkflow(f, n) {
  const { doc, line, fail, rule } = f;
  const jobs = isMap(doc.jobs) ? doc.jobs : {};
  const jobAt = (j) => line(new RegExp(`^  ${j}:`), line(/^jobs:/)); // job ids are [A-Za-z0-9_-]: nothing to escape
  const isCi = n === 'ci.yml';
  /** "job x" or "job x, step <name or number>", for a path into the parsed workflow. */
  const where = (p) => {
    if (p[0] !== 'jobs') return p.join('.');
    const step = p[2] === 'steps' ? jobs[p[1]]?.steps?.[p[3]] : undefined;
    return p[2] === 'steps' ? `job ${p[1]}, step ${step?.name ?? p[3] + 1}` : `job ${p[1]}`;
  };

  // c: permissions
  rule('c', line('permissions:'), () => {
    if (doc.permissions?.contents !== 'read') fail('c', line('permissions:'), 'the workflow must set `permissions: contents: read` at the top level');
    checkPermissions(f, doc.permissions, line('permissions:'), 'workflow');
    for (const [j, job] of Object.entries(jobs)) checkPermissions(f, job.permissions, line('permissions:', jobAt(j)), `job ${j}`);
  });

  // c: secrets only in the env of the deploy job's one-line Wrangler deploy step
  rule('c', 1, () => {
    for (const [p, s] of strings(doc)) {
      if (!readsSecrets(p, s)) continue;
      const [top, j, k, i, k2] = p;
      const step = top === 'jobs' && k === 'steps' ? jobs[j].steps[i] : undefined;
      const at = line(/\$\{\{.*\bsecrets\b|^\s*if:.*\bsecrets\b/, top === 'jobs' ? jobAt(j) : 1);
      const name = s.match(/\bsecrets\.[\w-]+/)?.[0] ?? 'secrets';
      const run = typeof step?.run === 'string' ? step.run : '';
      if (isCi && j === 'deploy' && k2 === 'env' && p.length === 6) {
        if (run.trim() !== DEPLOY_RUN) fail('c', at, `${where(p)} holds ${name} in its env but runs \`${firstLine(run).trim()}\`: the step with the token runs exactly \`${DEPLOY_RUN}\` and nothing else`);
        continue;
      }
      const detail = top === 'jobs' ? `${where(p)}, ${p.slice(step ? 4 : 2).join('.')}` : p.join('.');
      fail('c', at, `${detail} uses ${name}: secrets belong only in the env of the deploy job's \`wrangler deploy\` step, so no other step or job can read them`);
    }
  });

  // d: every uses pinned to a sha
  rule('d', line(/^jobs:/), () => {
    for (const [j, job] of Object.entries(jobs)) {
      if (job.uses && !/@[0-9a-f]{40}$/.test(job.uses)) fail('d', line(job.uses, jobAt(j)), `job ${j} uses ${job.uses}: pin it to a 40-hex commit sha with the version as a comment`);
      for (const st of asList(job.steps)) {
        if (st.uses && !/@[0-9a-f]{40}$/.test(st.uses)) fail('d', line(st.uses, jobAt(j)), `job ${j} uses ${st.uses}: pin it to a 40-hex commit sha (\`uses: owner/action@<sha> # vX.Y.Z\`); Dependabot keeps the sha current`);
      }
    }
  });

  // f: nothing sends data
  rule('f', 1, () => {
    for (const [p, s] of strings(doc)) {
      const j = p[0] === 'jobs' ? p[1] : undefined;
      const at = line(firstLine(s).trim(), j ? jobAt(j) : 1);
      if (p.at(-1) === 'run' && /-X\s*POST|--request[\s=]+POST|\b(?:curl|wget)\b[^\n]*\s(?:--data\b|--post-data\b|-d\b)/.test(s))
        fail('f', at, `job ${j}: \`${firstLine(s).trim()}\` sends data: live verification is read-only; use \`npm run verify:live\` (GET only)`);
      else if (s.includes('api/event') && /\bPOST\b/i.test(s)) fail('f', at, `job ${j}: \`${firstLine(s).trim()}\` names POST and /api/event, and a POST there would add to the real counts: remove it`);
    }
  });

  // g: no hard-coded wrangler version anywhere
  rule('g', 1, () => {
    for (const [p, s] of strings(doc)) {
      if (p.at(-1) !== 'run') continue;
      const at = line(firstLine(s).trim(), jobAt(p[1]));
      if (/wrangler@\d/.test(s)) fail('g', at, `job ${p[1]}: \`${firstLine(s).trim()}\` hard-codes a Wrangler version: write "wrangler@\${WRANGLER_VERSION}" and change the version in the workflow env`);
      else if (callsWrangler(s) && !/wrangler@(\$\{WRANGLER_VERSION\}|\$WRANGLER_VERSION\b|\$\{\{\s*env\.WRANGLER_VERSION\s*\}\})/.test(s)) fail('g', at, `job ${p[1]}: \`${firstLine(s).trim()}\` runs Wrangler without the pinned version: write npx --yes "wrangler@\${WRANGLER_VERSION}" ...`);
    }
    for (const [j, job] of Object.entries(jobs)) {
      if (job.env?.WRANGLER_VERSION !== undefined || asList(job.steps).some((st) => st.env?.WRANGLER_VERSION !== undefined))
        fail('g', line('WRANGLER_VERSION:', jobAt(j)), `job ${j} sets WRANGLER_VERSION itself: set it once, in the workflow env, so the preflight and the deploy cannot differ`);
    }
  });

  // h: every job has a timeout
  rule('h', line(/^jobs:/), () => {
    for (const [j, job] of Object.entries(jobs)) {
      const t = job['timeout-minutes'];
      if (typeof t !== 'number' && !(typeof t === 'string' && /^\$\{\{[\s\S]*\}\}$/.test(t.trim())) && !job.uses) fail('h', jobAt(j), `job ${j} has no timeout-minutes: add one (a hung job otherwise runs for 6 hours)`);
    }
  });

  // j: nothing swallows a failure
  rule('j', 1, () => {
    for (const p of keys(doc)) {
      if (p.at(-1) !== 'continue-on-error') continue;
      fail('j', line('continue-on-error', p[0] === 'jobs' ? jobAt(p[1]) : 1), `${where(p)} sets continue-on-error: a failed step or job would then count as passed, and deploy's needs would let it through: remove it`);
    }
  });

  // k: the triggers
  rule('k', line(/^["']?on["']?:/), () => {
    const on = doc.on;
    const events = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : isMap(on) ? Object.keys(on) : [];
    if (events.includes('pull_request_target')) fail('k', line('pull_request_target'), 'the workflow runs on pull_request_target, which runs fork pull requests with this repository\'s secrets and a write token: use pull_request');
    if (!isCi) return;
    if (!isMap(on) || events.length !== 2 || !events.includes('push') || !events.includes('pull_request'))
      fail('k', line(/^["']?on["']?:/), `ci.yml runs on [${events.join(', ')}]: run it on exactly push and pull_request (no workflow_dispatch, pull_request_target or schedule): write \`on: { push: { branches: [master] }, pull_request: }\``);
    const push = isMap(on) ? on.push : undefined;
    if (!isMap(push) || Object.keys(push).join() !== 'branches' || JSON.stringify(asList(push.branches)) !== '["master"]')
      fail('k', line('push:'), `on.push is ${JSON.stringify(push ?? null)}: write exactly \`branches: [master]\`, so only master pushes reach the deploy`);
  });

  // l: a real deploy runs only in ci.yml job deploy
  rule('l', 1, () => {
    for (const [p, s] of strings(doc)) {
      if (isCi && p[0] === 'jobs' && p[1] === 'deploy') continue;
      const deploys = p.at(-1) === 'run' && isWranglerDeploy(s) || p.at(-1) === 'uses' && /wrangler-action/.test(s);
      if (deploys) fail('l', line(firstLine(s).trim(), p[0] === 'jobs' ? jobAt(p[1]) : 1), `${where(p)}: \`${firstLine(s).trim()}\` deploys: only ci.yml job deploy deploys, after check and journeys pass (a preflight adds --dry-run)`);
    }
  });

  if (isCi) rule('a', line(/^jobs:/), () => checkCi(f, jobs, jobAt));
}