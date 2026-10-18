// check:og on a tiny fixture tree (OG_ROOT): a card template, two font files, a copy module, the block lengths and a png.
// No browser and no build: only the default mode and --write run here (--pixels renders with Chromium, so it is local only).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./check-og.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = readFileSync(SCRIPT, 'utf8');
const CARD_COPY = [...SRC.match(/export const CARD_COPY = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
// the keys of NOT_ON_CARD, so the fixture's copy module has every pick.* and tag.* id the script knows about
const NOT_ON_CARD = [...SRC.match(/export const NOT_ON_CARD = \{([^}]+)\}/)?.[1].matchAll(/^\s*'([^']+)':/gm) ?? []].map((m) => m[1]);
const RECORD = 'scripts/og/og-image.inputs.json';
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const copyModule = (text, domain = 'Example.app', ids = [...CARD_COPY, ...NOT_ON_CARD]) => `export const BRAND = 'Brand';\nexport const DOMAIN_DISPLAY = '${domain}';\nexport const COPY = {\n${ids.map((id) => `  '${id}': { kind: 'own', text: ${JSON.stringify(text[id] ?? `text of ${id}`)} },`).join('\n')}\n};\n`;
const CARD = "import { DOMAIN_DISPLAY } from '../../src/copy.ts';\nconst NM = path.resolve('node_modules/@fontsource-variable');\nfont('serif', 'serif.woff2'); font('sans', 'sans.woff2');\n";

/** A fresh fixture tree with its record written by --write, as after a real rebuild. */
function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'check-og-'));
  dirs.push(dir);
  const files = {
    'package.json': '{ "type": "module" }\n',
    'src/copy.ts': copyModule({}),
    'src/method.ts': 'export const BLOCK_CHOICES = { full: [120, 150, 180] } as const;\n',
    'scripts/og/card.mjs': CARD,
    'node_modules/@fontsource-variable/serif/files/serif.woff2': 'serif-1',
    'node_modules/@fontsource-variable/sans/files/sans.woff2': 'sans-1',
    'public/og-image.png': 'png-1',
  };
  const fx = {
    dir,
    write: (f, s) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), s); },
    read: (f) => readFileSync(join(dir, f), 'utf8'),
    run: (...flags) => { const r = spawnSync(process.execPath, [SCRIPT, ...flags], { encoding: 'utf8', env: { ...process.env, OG_ROOT: dir } }); return { status: r.status, out: r.stdout + r.stderr }; },
  };
  for (const [f, s] of Object.entries(files)) fx.write(f, s);
  expect(fx.run('--init').status).toBe(0);
  return fx;
}

describe('check:og', () => {
  it('passes the real tree, and --help says --pixels needs the same Chromium build', () => {
    const env = { ...process.env }; delete env.OG_ROOT;
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT, env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('check-og: OK, public/og-image.png matches its recorded inputs');
    const h = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(h.stdout).toContain('LOCAL ONLY, never in CI');
    expect(h.stdout).toContain('same Chromium build');
  });
  it('passes a tree whose record matches, and writes a deterministic record', () => {
    const fx = tree();
    const r = fx.run();
    expect(r.status, r.out).toBe(0);
    const rec = JSON.parse(fx.read(RECORD));
    expect(Object.keys(rec)).toEqual(['note', 'png', 'inputs']);
    expect(Object.keys(rec.inputs.files)).toEqual(['scripts/og/card.mjs', 'node_modules/@fontsource-variable/serif/files/serif.woff2', 'node_modules/@fontsource-variable/sans/files/sans.woff2']);
    expect(rec.inputs.constants).toEqual({ BRAND: 'Brand', DOMAIN_DISPLAY: 'Example.app' });
    expect(rec.inputs.blockChoices).toEqual([120, 150, 180]);
    expect(fx.read(RECORD)).not.toMatch(/20\d\d-\d\d-\d\d/); // no dates
    expect(fx.run('--write').out).toMatch(/is already current \(png [0-9a-f]{12}\); nothing written/);
  });
  it('fails a Pick line that changed while the png did not, naming the id, and --write refuses', () => {
    const fx = tree();
    const before = fx.read(RECORD);
    fx.write('src/copy.ts', copyModule({ 'pick.slide': 'Let the rest slide; it will keep.' }));
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain('the card\'s inputs changed but public/og-image.png did not, so it shows old text');
    expect(r.out).toContain('copy pick.slide: "text of pick.slide" is now "Let the rest slide; it will keep."');
    expect(r.out).toContain('node scripts/og/card.mjs), look at it, then run node scripts/check-og.mjs --write');
    const w = fx.run('--write');
    expect(w.status).toBe(1);
    expect(fx.read(RECORD)).toBe(before);
  });
  it('fails a changed card template, a changed font, a changed constant and changed block lengths', () => {
    const cases = [
      [(fx) => fx.write('scripts/og/card.mjs', CARD + '// a new line\n'), 'scripts/og/card.mjs changed'],
      [(fx) => fx.write('node_modules/@fontsource-variable/sans/files/sans.woff2', 'sans-2'), 'node_modules/@fontsource-variable/sans/files/sans.woff2 changed: a font file changed (did a dependency update change @fontsource?): the card has to be rebuilt locally'],
      [(fx) => fx.write('src/copy.ts', copyModule({}, 'Other.app')), 'constant DOMAIN_DISPLAY: "Example.app" is now "Other.app"'],
      [(fx) => fx.write('src/method.ts', 'export const BLOCK_CHOICES = { full: [120, 180] };\n'), 'block lengths (BLOCK_CHOICES.full in src/method.ts): [120,150,180] are now [120,180]'],
    ];
    for (const [edit, msg] of cases) {
      const fx = tree(); edit(fx);
      const r = fx.run();
      expect(r.status, msg).toBe(1);
      expect(r.out).toContain(msg);
    }
  });
  it('fails a png that changed without --write, and passes once it is recorded', () => {
    const fx = tree();
    fx.write('public/og-image.png', 'png-2');
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain('public/og-image.png is not the one recorded in scripts/og/og-image.inputs.json. Rebuild done? run node scripts/check-og.mjs --write');
    expect(fx.run('--write').status).toBe(0);
    expect(fx.run().status).toBe(0);
  });
  it('passes after the copy changed, the png was rebuilt and --write recorded both', () => {
    const fx = tree();
    fx.write('src/copy.ts', copyModule({ 'pick.hero': 'Which one thing gets your morning?' }));
    fx.write('public/og-image.png', 'png-rebuilt');
    expect(fx.run().status).toBe(1);
    const w = fx.run('--write');
    expect(w.status, w.out).toBe(0);
    expect(w.out).toContain('copy pick.hero');
    expect(fx.run().status).toBe(0);
  });
  it('fails a missing record with the fix, and --write will not create one: the first record needs --init', () => {
    const fx = tree();
    rmSync(join(fx.dir, RECORD));
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain('scripts/og/og-image.inputs.json is missing, so nothing says what public/og-image.png was built from: rebuild the card');
    expect(r.out).toContain('--init');
    const w = fx.run('--write');
    expect(w.status).toBe(1);
    expect(w.out).toContain('--write only updates an existing record');
    expect(w.out).toContain('node scripts/check-og.mjs --init');
    expect(existsSync(join(fx.dir, RECORD))).toBe(false);
    const i = fx.run('--init');
    expect(i.status, i.out).toBe(0);
    expect(fx.run().status).toBe(0);
    expect(fx.run('--init').out).toContain('already exists; use --write');
    const h = fx.run('--help');
    expect(h.out).toContain('--init');
  });
  it('fails a copy id or constant that is in the record but no longer an input', () => {
    for (const [edit, msg] of [
      [(rec) => { rec.inputs.copy['pick.gone'] = 'An old line.'; }, 'copy pick.gone: "An old line." is in the record but no longer an input'],
      [(rec) => { rec.inputs.constants.OLD = 'Old'; }, 'constant OLD: "Old" is in the record but no longer an input'],
    ]) {
      const fx = tree();
      const rec = JSON.parse(fx.read(RECORD)); edit(rec);
      fx.write(RECORD, JSON.stringify(rec, null, 2) + '\n');
      const r = fx.run();
      expect(r.status, msg).toBe(1);
      expect(r.out).toContain(msg);
    }
  });
  it('fails a pick.* or tag.* id that is neither on the card nor in NOT_ON_CARD, naming both fixes', () => {
    const fx = tree();
    fx.write('src/copy.ts', copyModule({}).replace('export const COPY = {\n', "export const COPY = {\n  'pick.newHint': { kind: 'own', text: 'A brand new hint.' },\n"));
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain("'pick.newHint' is a Pick line in src/copy.ts that check:og does not know about: if the card shows it, add it to CARD_COPY in scripts/check-og.mjs (then rebuild the card and run --write); if not, add it to NOT_ON_CARD there with the reason");
  });
  it('fails a NOT_ON_CARD id that is gone from src/copy.ts', () => {
    expect(NOT_ON_CARD.length).toBeGreaterThan(0);
    const fx = tree();
    fx.write('src/copy.ts', copyModule({}, 'Example.app', [...CARD_COPY, ...NOT_ON_CARD.slice(1)]));
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain(`NOT_ON_CARD has '${NOT_ON_CARD[0]}', which is not an id in src/copy.ts: drop it from scripts/check-og.mjs`);
  });
  it('says run npm ci when a font file or node_modules is missing, not a stack trace', () => {
    const fx = tree();
    rmSync(join(fx.dir, 'node_modules'), { recursive: true });
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain('node_modules/@fontsource-variable/serif/files/serif.woff2 is missing: run npm ci');
    expect(r.out).not.toMatch(/at .*\.mjs:\d+:\d+/);
  });
  it('fails a card that imports copy the inputs do not cover, or whose fonts cannot be found', () => {
    const fx = tree();
    fx.write('scripts/og/card.mjs', CARD.replace('{ DOMAIN_DISPLAY }', '{ DOMAIN_DISPLAY, SITE_URL }'));
    expect(fx.run().out).toContain('imports SITE_URL from src/copy.ts, which is not an input: add it to CARD_CONSTANTS in scripts/check-og.mjs');
    fx.write('scripts/og/card.mjs', "const NM = path.resolve('fonts');\n");
    const r = fx.run();
    expect(r.status).toBe(1);
    expect(r.out).toContain('cannot find the fonts in scripts/og/card.mjs');
  });
});
