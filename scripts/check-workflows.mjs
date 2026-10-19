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

let yaml;
try { yaml = (await import('js-yaml')).default; } catch {
  console.error('check:workflows: cannot import js-yaml. js-yaml is a devDependency, so run npm ci (or npm install -D js-yaml if package.json lost it)');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.resolve(ROOT, process.env.WORKFLOWS_DIR ?? '.github/workflows');
const DEPENDABOT = path.resolve(ROOT, process.env.DEPENDABOT_FILE ?? '.github/dependabot.yml');
const RULES = 'abcdefghijkl';
const DEPLOY_RUN = 'npx --yes "wrangler@${WRANGLER_VERSION}" deploy';
const rel = (f) => (f.startsWith(ROOT + path.sep) ? path.relative(ROOT, f) : f);
const problems = [];
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isMap = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Read and parse one YAML file; `line(needle, from)` is the first 1-based line at or after `from` that contains needle
 * (a string, or a regex that matches the line). */
function open(file) {
  const name = rel(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    problems.push(`${name}:1 cannot read it (${e.code ?? e.message}): make it a readable file`);
    return null;
  }
  const lines = text.split('\n');
  const line = (needle, from = 1) => {
    for (let i = Math.max(from, 1) - 1; i < lines.length; i++) if (typeof needle === 'string' ? lines[i].includes(needle) : needle.test(lines[i])) return i + 1;
    return from;
  };
  const fail = (rule, at, msg) => problems.push(`${name}:${at} [${rule}] ${msg}`);
  /** Run one rule's checks; a shape it cannot read becomes a problem with the file and the rule, not a stack trace. */
  const rule = (r, at, fn) => {
    try { fn(); } catch (e) { fail(r, at, `the check could not read this file's shape (${e.message}): write it the way the GitHub documentation shows`); }
  };
  let doc;
  try { doc = yaml.load(text) ?? {}; } catch (e) {
    problems.push(`${name}:${(e.mark?.line ?? 0) + 1} not valid YAML (${e.reason ?? e.message}): fix the syntax`);
    return null;
  }
  if (!isMap(doc)) { problems.push(`${name}:1 the top level is not a mapping: write the keys GitHub documents (on, permissions, jobs)`); return null; }
  return { doc, text, lines, name, line, fail, rule };
}

/** Every string in a parsed value, with its path. */
function strings(v, p = [], out = []) {
  if (typeof v === 'string') out.push([p, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, [...p, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, [...p, k], out);
  return out;
}
/** Every key in a parsed value, with its path (the key is the last element). */
function keys(v, p = [], out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => keys(x, [...p, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push([...p, k]); keys(x, [...p, k], out); }
  return out;
}
const firstLine = (s) => s.split('\n').find((l) => l.trim()) ?? s;
/** The shell commands of a run string: split on newlines, &&, ||, ; and pipes. */
const commands = (run) => run.split(/\n|&&|\|\||[;|]/);
const isWranglerDeploy = (run) => commands(run).some((c) => /\bwrangler\b.*\s(?:deploy|publish)\b/.test(c) && !/--dry-run\b/.test(c));
const callsWrangler = (s) => /\bnpx\b[^\n;&|]*\bwrangler\b|\bwrangler(?:@\S+)?\s+-{0,2}[a-z]/.test(s);
/** A value reads secrets when the word is inside a ${{ }} expression, or anywhere in an `if` (an expression without ${{ }}). */
const readsSecrets = (p, s) => (p.at(-1) === 'if' ? [s] : [...s.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[1])).some((e) => /\bsecrets\b/.test(e));

function checkPermissions(f, perms, at, where) {
  if (perms == null) return;
  const bad = typeof perms === 'string' ? [perms] : Object.entries(perms).filter(([k, v]) => !['read', 'none'].includes(v) || k === 'id-token' && v !== 'none').map(([k, v]) => `${k}: ${v}`);
  if (bad.length) f.fail('c', at, `${where} permissions grant ${bad.join(', ')}: grant read only (contents: read); a write or id-token permission is a change to review on its own`);
}

function checkWorkflow(f, n) {
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

function checkCi(f, jobs, jobAt) {
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

function checkDependabot(dep) {
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
