// check:og: guards public/og-image.png, the social card scripts/og/card.mjs builds. Its words are pixels, so it goes stale
// when the copy moves on and nothing else notices. The record of what the committed png was built from is
// scripts/og/og-image.inputs.json (outside public/, so it is never served).
//   node scripts/check-og.mjs           no browser, any machine: fails when the inputs changed but the png did not, or when the
//                                       png is not the one recorded
//   node scripts/check-og.mjs --write   after rebuilding the card (and looking at it): record its inputs and png hash. Refuses
//                                       when the inputs changed and the png did not, so a stale png cannot be recorded as current
//   node scripts/check-og.mjs --pixels  LOCAL ONLY, never in CI: re-renders the card with card.mjs against a preview of the current
//                                       build at OG_URL (default http://127.0.0.1:4173) and counts the pixels that differ from the
//                                       committed png by more than OG_TOL (default 16 of 255 on any channel); exit 1 above OG_MAX
//                                       (default 0). It needs the same Chromium build as the one that made the committed png: another
//                                       build differs by thousands of pixels (about 24000 measured) with the same inputs. It also
//                                       checks that every line the phone shows is covered by CARD_COPY, CARD_CONSTANTS, the block
//                                       lengths or the card's own example text.
// Inputs: the bytes of scripts/og/card.mjs (layout, the card's own text, the example items), the font files it embeds (read from
// its font() calls), the copy the phone shows (CARD_COPY), the copy constants (CARD_CONSTANTS) and the Pick block lengths
// (BLOCK_CHOICES.full in src/method.ts). Not inputs: CSS and layout of the Pick screen; a change there does not trigger this.
// OG_ROOT points it at another tree, for the tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const ROOT = path.resolve(process.env.OG_ROOT ?? path.join(import.meta.dirname, '..'));
const CARD = 'scripts/og/card.mjs';
const PNG = 'public/og-image.png';
const RECORD = 'scripts/og/og-image.inputs.json';
// what the phone shows of the Pick screen at 07:15 (captured with OG_TEXT, see --pixels): the header link, eyebrow, heading,
// the talk line, the tag chips of the example items, the length label and the block line (fmt.pickLine(false, false));
// `Start the block` is below the crop
export const CARD_COPY = ['about', 'pick.eyebrow', 'pick.hero', 'pick.ten', 'tag.risky', 'tag.pushed', 'pick.howLong', 'pick.full', 'pick.early', 'pick.slide'];
// BRAND is the phone's header; DOMAIN_DISPLAY is on the card itself (card.mjs imports it)
export const CARD_CONSTANTS = ['BRAND', 'DOMAIN_DISPLAY'];
const HOW = 'rebuild the card (npm run build, npx vite preview --port 4173, node scripts/og/card.mjs), look at it, then run node scripts/check-og.mjs --write';
const at = (f) => path.join(ROOT, f);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { console.error(`check:og FAIL: ${msg}`); process.exit(1); };

// the font files card.mjs embeds, read from its source: const NM = path.resolve('<dir>') and font('<pkg>', '<file>')
const cardSrc = fs.readFileSync(at(CARD), 'utf8');
const nm = cardSrc.match(/const NM = path\.resolve\('([^']+)'\)/)?.[1];
const fonts = [...cardSrc.matchAll(/font\('([\w.-]+)', '([\w.-]+)'\)/g)].map((m) => `${nm}/${m[1]}/files/${m[2]}`);
if (!nm || !fonts.length) fail(`cannot find the fonts in ${CARD} (const NM = path.resolve('...') and font('pkg', 'file') calls); update the pattern in scripts/check-og.mjs`);
const imported = cardSrc.match(/import \{([^}]+)\} from '[^']*src\/copy\.ts'/)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? [];
for (const name of imported) if (!CARD_CONSTANTS.includes(name)) fail(`${CARD} imports ${name} from src/copy.ts, which is not an input: add it to CARD_CONSTANTS in scripts/check-og.mjs`);

const copy = await import(pathToFileURL(at('src/copy.ts')).href);
const { BLOCK_CHOICES } = await import(pathToFileURL(at('src/method.ts')).href);
function inputs() {
  const files = Object.fromEntries([CARD, ...fonts].map((f) => [f, sha(fs.readFileSync(at(f)))]));
  const constants = Object.fromEntries(CARD_CONSTANTS.map((c) => [c, copy[c]]));
  const text = Object.fromEntries(CARD_COPY.map((id) => [id, copy.COPY[id]?.text ?? fail(`CARD_COPY has '${id}', which is not an id in src/copy.ts`)]));
  return { files, constants, copy: text, blockChoices: [...BLOCK_CHOICES.full] };
}
function diffInputs(was, now) {
  const out = [];
  for (const [f, h] of Object.entries(now.files)) if (was.files?.[f] !== h) out.push(`${f} changed`);
  for (const f of Object.keys(was.files ?? {})) if (!(f in now.files)) out.push(`${f} is no longer an input`);
  for (const [c, v] of Object.entries(now.constants)) if (was.constants?.[c] !== v) out.push(`constant ${c}: ${JSON.stringify(was.constants?.[c] ?? null)} is now ${JSON.stringify(v)}`);
  for (const [id, v] of Object.entries(now.copy)) if (was.copy?.[id] !== v) out.push(`copy ${id}: ${JSON.stringify(was.copy?.[id] ?? null)} is now ${JSON.stringify(v)}`);
  if (JSON.stringify(was.blockChoices) !== JSON.stringify(now.blockChoices)) out.push(`block lengths (BLOCK_CHOICES.full in src/method.ts): ${JSON.stringify(was.blockChoices ?? null)} are now ${JSON.stringify(now.blockChoices)}`);
  return out;
}

if (args.includes('--pixels')) {
  let PNGJS;
  try { PNGJS = createRequire(import.meta.url)('playwright-core/lib/utilsBundle').PNG; if (!PNGJS?.sync) throw new Error(); } catch {
    fail('cannot load pngjs from playwright-core/lib/utilsBundle (a deep import that a Playwright upgrade can move); find where it went, or compare the pngs by hand');
  }
  const url = process.env.OG_URL ?? 'http://127.0.0.1:4173';
  const tol = Number(process.env.OG_TOL ?? 16); const max = Number(process.env.OG_MAX ?? 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-og-'));
  const out = path.join(dir, 'card.png'); const textFile = path.join(dir, 'phone.txt');
  const t0 = Date.now();
  execFileSync(process.execPath, [at(CARD)], { cwd: ROOT, env: { ...process.env, OG_URL: url, OG_OUT: out, OG_TEXT: textFile }, stdio: 'ignore' });
  const ms = Date.now() - t0;
  const [a, b] = [PNGJS.sync.read(fs.readFileSync(at(PNG))), PNGJS.sync.read(fs.readFileSync(out))];
  if (a.width !== b.width || a.height !== b.height) fail(`the render is ${b.width}x${b.height}, the committed png ${a.width}x${a.height}`);
  // the phone's box, read from card.mjs's CSS, so the count can be split: the phone shows the app (the copy), the rest is the card's
  // own text, which another Chromium build antialiases differently
  const ph = cardSrc.match(/\.phone\{left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px\}/)?.slice(1).map(Number);
  let n = 0; let nPhone = 0; let box = null;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > tol) {
      n++; const x = (i / 4) % a.width; const y = Math.floor(i / 4 / a.width);
      if (ph && x >= ph[0] && x < ph[0] + ph[2] + 20 && y >= ph[1] && y < ph[1] + ph[3] + 20) nPhone++;
      box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
    }
  }
  const same = sha(fs.readFileSync(at(PNG))) === sha(fs.readFileSync(out));
  console.log(`check-og --pixels: render ${ms} ms, byte-identical ${same}, ${n} of ${a.width * a.height} pixels differ by more than ${tol}${box ? ` (inside x ${box[0]} to ${box[2]}, y ${box[1]} to ${box[3]})` : ''}${ph ? `; ${nPhone} inside the phone (the app's words), ${n - nPhone} outside it (the card's own text)` : ''}; render at ${out}`);
  // every line the phone shows must be made of declared inputs: listed copy, constants and block lengths (with the
  // separators the app puts between them), or a literal of card.mjs (the example items it types)
  const now = inputs();
  const hrs = (m) => (m % 60 ? `${(m / 60).toFixed(1).replace(/\.0$/, '')}h` : `${m / 60}h`).replace('1.5h', '1½h').replace('2.5h', '2½h'); // as App.tsx labels them
  const pieces = [...Object.values(now.copy), ...Object.values(now.constants), ...now.blockChoices.map(hrs)].sort((x, y) => y.length - x.length);
  const literals = new Set([...cardSrc.matchAll(/'([^'\\\n]+)'/g)].map((m) => m[1]));
  const lines = fs.readFileSync(textFile, 'utf8').split('\n').filter(Boolean);
  const uncovered = lines.filter((l) => !literals.has(l) && !/^[\s·,.;:×]*$/.test(pieces.reduce((rest, p) => rest.split(p).join(' '), l)));
  const unseen = CARD_COPY.filter((id) => !lines.some((l) => l.includes(now.copy[id])));
  console.log(`check-og --pixels: the phone shows ${lines.length} lines, ${lines.length - uncovered.length} covered by the declared inputs${unseen.length ? `; listed but not seen: ${unseen.join(', ')}` : ''}`);
  for (const l of uncovered) console.error(`check:og FAIL: the phone shows ${JSON.stringify(l)}, which no declared input covers: add its copy id to CARD_COPY in scripts/check-og.mjs (or its constant to CARD_CONSTANTS), then rebuild and run --write`);
  if (n > max) console.error(`check:og FAIL: the committed card differs from a fresh render by ${n} pixels (OG_MAX ${max}). If this Chromium build made the committed png, it is stale: ${HOW}. Another build differs by itself (see --help), so then judge the render by eye`);
  process.exit(uncovered.length || n > max ? 1 : 0);
}

const now = inputs(); const png = sha(fs.readFileSync(at(PNG)));
if (!fs.existsSync(at(RECORD))) {
  if (!args.includes('--write')) fail(`${RECORD} is missing, so nothing says what ${PNG} was built from: ${HOW}`);
}
const rec = fs.existsSync(at(RECORD)) ? JSON.parse(fs.readFileSync(at(RECORD), 'utf8')) : null;
const changed = rec ? diffInputs(rec.inputs ?? {}, now) : [];
const pngChanged = rec ? rec.png !== png : true;
const stale = `the card's inputs changed but ${PNG} did not, so it shows old text:\n  ${changed.join('\n  ')}\n${HOW}`;
if (args.includes('--write')) {
  if (rec && changed.length && !pngChanged) fail(stale);
  if (rec && !changed.length && !pngChanged) { console.log(`check-og: ${RECORD} is already current (png ${png.slice(0, 12)}); nothing written`); process.exit(0); }
  const record = { note: `written by node scripts/check-og.mjs --write after rebuilding ${PNG} with ${CARD}: the inputs the png was built from and its sha256`, png, inputs: now };
  const text = JSON.stringify(record, null, 2) + '\n';
  const back = JSON.parse(text);
  if (back.png !== png || diffInputs(back.inputs, inputs()).length) fail(`the record would not match the current inputs (${diffInputs(back.inputs, inputs()).join('; ')}); not written`);
  fs.writeFileSync(at(RECORD), text);
  console.log(`check-og: wrote ${RECORD} (png ${png.slice(0, 12)}${changed.length ? `; inputs: ${changed.join('; ')}` : ''})`);
  process.exit(0);
}
if (changed.length && !pngChanged) fail(stale);
if (pngChanged) fail(`${PNG} is not the one recorded in ${RECORD}${changed.length ? ` (inputs changed too: ${changed.join('; ')})` : ''}. Rebuild done? run node scripts/check-og.mjs --write`);
console.log(`check-og: OK, ${PNG} matches its recorded inputs (${1 + fonts.length} files, ${CARD_COPY.length} copy lines, ${CARD_CONSTANTS.length} constants, ${now.blockChoices.length} block lengths)`);
