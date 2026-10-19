// check:maps on copies of the real e2e/drive.mjs and e2e/features, each with one mutation: every drift it exists for fails
// with the file:line and the fix, and the real tree passes.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-maps.mjs');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const TWO_TABS = "'two-tabs': journey({ id: 'two-tabs', feature: 'history', proves: ['hi-two-tabs'], strings: [";
/** Copy drive.mjs (with the e2e/drive and e2e/journeys files it imports) and the maps to a fresh dir, apply `edit` ({ drive, maps }), run the check on the copy. */
function run(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-maps-'));
  dirs.push(dir);
  cpSync(join(ROOT, 'e2e/features'), join(dir, 'features'), { recursive: true });
  cpSync(join(ROOT, 'e2e/drive.mjs'), join(dir, 'drive.mjs'));
  for (const d of ['drive', 'journeys']) cpSync(join(ROOT, 'e2e', d), join(dir, d), { recursive: true });
  const driveFiles = () => ['drive.mjs', ...['drive', 'journeys'].flatMap((d) => readdirSync(join(dir, d)).map((f) => `${d}/${f}`))];
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  const write = (f, s) => writeFileSync(join(dir, f), s);
  /** Replace exactly one occurrence, so a fixture that no longer matches the real files fails loudly. */
  const swap = (f, from, to) => { const s = read(f); expect(s.split(from).length, `${f}: ${from}`).toBe(2); write(f, s.replace(from, to)); };
  edit({ swap, read, write, drive: (a, b) => { const owners = driveFiles().filter((f) => read(f).includes(a)); expect(owners.length, `one drive file holds: ${a}`).toBe(1); swap(owners[0], a, b); }, driveFiles, map: (m, a, b) => swap(`features/${m}.md`, a, b) });
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, MAPS_DRIVE: join(dir, 'drive.mjs'), MAPS_FEATURES: join(dir, 'features') } });
  return { status: r.status, out: r.stdout + r.stderr };
}

describe('check:maps', () => {
  it('passes the real tree and names the sub-features no journey can prove', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^maps OK: \d+ journeys, 9 maps$/m);
    expect(r.stdout).toContain('not proved by any journey, as the map says ("not verified by vdt"): an-worker');
  });
  it('passes an unchanged copy', () => {
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/maps OK: 56 journeys, 9 maps/);
  });
  it('fails a renamed key whose meta.id was left behind', () => {
    const r = run(({ drive }) => drive("'two-tabs': journey({ id: 'two-tabs'", "'two-tabs-stale': journey({ id: 'two-tabs'"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: 'two-tabs-stale': meta\.id is 'two-tabs'; it must equal the journey name: write id: 'two-tabs-stale'/);
  });
  it('fails a rename that leaves the old name in the map and the new one in none', () => {
    const r = run(({ drive }) => drive("'two-tabs': journey({ id: 'two-tabs'", "'two-tabs-stale': journey({ id: 'two-tabs-stale'"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/history\.md:\d+: names journey 'two-tabs', which is not in J in .*drive\.mjs \(renamed or deleted\?\); write its current name or drop the line/);
    expect(r.out).toMatch(/'two-tabs-stale' is in no map: add a "- \*\*<What it shows>\.\*\* Run `vdt journey two-tabs-stale`\. \.\.\." line to the Driving section of .*history\.md/);
  });
  it('fails a rename that leaves the old name in a Proof line (backticked prose)', () => {
    const r = run(({ swap, read, write, driveFiles }) => {
      for (const f of driveFiles()) write(f, read(f).replaceAll('same-answer-two-steps', 'same-answer-steps'));
      swap('features/first-visit.md', 'Run `vdt journey same-answer-two-steps`', 'Run `vdt journey same-answer-steps`');
    });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/first-visit\.md:\d+: `same-answer-two-steps` looks like a journey name but is neither a journey .* nor a sub-feature id \(renamed\?\); write the current name, or add it to PROSE_ALLOW/);
    expect(r.out).toContain('1 problem(s)');
  });
  it('fails a journey with no Run line', () => {
    const r = run(({ map }) => map('history', 'Run `vdt journey history-empty`. ', ''));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'history-empty' is in no map: add a .*Run `vdt journey history-empty`.* to the Driving section of .*history\.md/);
  });
  it('fails a journey listed in a second map', () => {
    const r = run(({ swap }) => swap('features/close-day.md', '## Gotchas', '- **Dup.** Run `vdt journey two-tabs`.\n\n## Gotchas'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs' is listed in 2 maps \(.*close-day\.md:\d+, .*history\.md:\d+\); keep "Run `vdt journey two-tabs`" in history\.md only and write "See `two-tabs` in \[history\.md\]\(\.\/history\.md\)" in the others/);
  });
  it('fails a journey listed twice in its own map', () => {
    const r = run(({ map }) => map('history', '## Gotchas', '- **Again.** Run `vdt journey two-tabs`.\n\n## Gotchas'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs' is listed 2 times \(.*history\.md:\d+, .*history\.md:\d+\); keep one "Run `vdt journey two-tabs`" line, in history\.md/);
  });
  it('counts a listing in another spelling, so a duplicate in that spelling fails', () => {
    for (const spelling of ['Run `e2e/vdt journey two-tabs`', 'Run `VDT_PORT=4401 vdt journey two-tabs`', 'Run `VDT_PORT=4401 e2e/vdt journey two-tabs --keep`']) {
      const r = run(({ swap }) => swap('features/close-day.md', '## Gotchas', `- **Dup.** ${spelling}.\n\n## Gotchas`));
      expect(r.status, spelling).toBe(1);
      expect(r.out, spelling).toMatch(/'two-tabs' is listed in 2 maps \(.*close-day\.md:\d+, .*history\.md:\d+\)/);
    }
  });
  it('fails a map that names a journey that does not exist', () => {
    const r = run(({ map }) => map('reminder', '## Gotchas', '- **Ghost.** Run `vdt journey ghost`.\n\n## Gotchas'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/reminder\.md:\d+: names journey 'ghost', which is not in J/);
  });
  it('fails a see-reference to the wrong map', () => {
    const r = run(({ map }) => map('close-day', 'See `count-grows` in [history.md](./history.md)', 'See `count-grows` in [close-day.md](./close-day.md)'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/close-day\.md:\d+: says see 'count-grows' in close-day\.md, but it lives in history\.md; write see `count-grows` in \[history\.md\]\(\.\/history\.md\)/);
  });
  it('matches a see-reference by its link target, not its link text', () => {
    const r = run(({ map }) => map('close-day', 'See `count-grows` in [history.md](./history.md)', 'See `count-grows` in [close-day](./close-day.md)'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/close-day\.md:\d+: says see 'count-grows' in close-day\.md, but it lives in history\.md/);
  });
  it('fails a sub-feature id listed in two maps, naming both lines', () => {
    const r = run(({ map }) => map('close-day', '\n## How to get to it', '- `hi-two-tabs` the same id again.\n\n## How to get to it'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/sub-feature `hi-two-tabs` is listed in two maps \(.*close-day\.md:\d+ and .*history\.md:\d+\); an id has one home: keep it in one map and write "see `hi-two-tabs` in \[map\.md\]\(\.\/map\.md\)" in the other/);
  });
  it('fails a proves id that is no sub-feature, and the sub-feature it left unproved', () => {
    const r = run(({ drive }) => drive("proves: ['hi-two-tabs']", "proves: ['hi-two-tab']"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs': proves 'hi-two-tab', which no map lists under Sub-features; fix the id or add the sub-feature to its map/);
    expect(r.out).toMatch(/history\.md:\d+: no journey proves `hi-two-tabs`; add it to the meta\.proves of the journey that shows it, or, if no journey can, say "not verified by vdt"/);
  });
  it('fails a new sub-feature that no journey proves', () => {
    const r = run(({ map }) => map('history', '\n## How to get to it', '- `hi-orphan` a sub-feature nobody drives.\n\n## How to get to it'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/history\.md:\d+: no journey proves `hi-orphan`/);
  });
  it('fails a "not verified by vdt" note on a sub-feature a journey proves', () => {
    const r = run(({ map }) => map('history', '- `hi-two-tabs` a tab', '- `hi-two-tabs` (not verified by vdt) a tab'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/history\.md:\d+: `hi-two-tabs` says "not verified by vdt", but two-tabs proves it; drop the note/);
  });
  it('fails a strings id that is not in src/copy.ts', () => {
    const r = run(({ drive }) => drive(TWO_TABS, `${TWO_TABS}'nope.id', `));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs': strings has 'nope\.id', which is not an id in src\/copy\.ts; fix the id or drop it/);
  });
  it('fails a strings id that is only on the prototype of COPY', () => {
    const r = run(({ drive }) => drive(TWO_TABS, `${TWO_TABS}'constructor', `));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs': strings has 'constructor', which is not an id in src\/copy\.ts; fix the id or drop it/);
  });
  it('fails a strings id the journey never asserts', () => {
    const r = run(({ drive }) => drive(TWO_TABS, `${TWO_TABS}'error.reload', `));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs': strings has 'error\.reload' but the journey never asserts it \(no t\('error\.reload'\) and no literal "Reloading usually fixes it\." in it or its helpers\); assert it or drop it/);
  });
  it('fails a journey without meta', () => {
    const r = run(({ drive }) => drive('const J = {\n', "const J = {\n  'pick-shows-ten': async (s) => { await throughToPick(s); },\n"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: journey 'pick-shows-ten' has no meta: write 'pick-shows-ten': journey\(\{ id: 'pick-shows-ten', feature: '<map>', proves: \[\], strings: \[\] \}, async \(s\) => \{ \.\.\. \}\)/);
  });
  it('fails a meta that is not a plain literal', () => {
    const r = run(({ drive }) => drive("journey({ id: 'two-tabs', feature: 'history'", "journey({ id: 'two-tabs', feature: HISTORY"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: the meta of 'two-tabs' is not a plain literal/);
  });
  it('fails an unknown meta key, and a feature that is not a map', () => {
    const r = run(({ drive }) => drive("journey({ id: 'two-tabs', feature: 'history'", "journey({ id: 'two-tabs', owner: 'me', feature: 'histories'"));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/'two-tabs': unknown meta key 'owner'; the keys are id, feature, proves, strings, note/);
    expect(r.out).toMatch(/'two-tabs': meta\.feature 'histories' is not a map in .*features; use one of analytics, block-timer/);
    expect(r.out).toMatch(/history\.md:\d+: lists 'two-tabs', but its meta\.feature \(.*\.mjs:\d+\) is 'histories'/);
  });
  it('reports a journey added with J.x = ..., which would hide its meta', () => {
    const r = run(({ drive }) => drive('\nconst args = ', "\nJ['late-one'] = async () => {};\nconst args = "));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: a journey is added with J\.x = \.\.\.; move it into const J = \{ \.\.\. \}/);
  });
  it('reports an Object.assign(J, x) argument it cannot read, which would hide its journeys', () => {
    const more = "function makeMore() { return { 'ghost': journey({ id: 'ghost', feature: 'history', proves: [], strings: [] }, async () => {}) }; }\nObject.assign(J, makeMore());\n";
    const r = run(({ drive }) => drive('\nconst args = ', `\n${more}const args = `));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: Object\.assign\(J, makeMore\(\)\) merges journeys this check cannot read; write the journeys as an object literal assigned to a top-level const, then Object\.assign\(J, thatConst\)/);
  });
  it('reports an alias of J, through which journeys could be added unseen', () => {
    const r = run(({ drive }) => drive('\nconst args = ', "\nconst J2 = J;\nJ2['ghost'] = async () => {};\nconst args = "));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.mjs:\d+: J2 is another name for J/);
  });
});
