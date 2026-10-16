import { describe, expect, it } from 'vitest';
// the stylesheet as text (a plain ?raw import of .css is blanked by vitest's css handling)
const css = Object.values(import.meta.glob('./index.css', { query: '?raw', import: 'default', eager: true }))[0] as string;

// WCAG 2.x contrast of the design tokens. The muted grey is used for small text on the paper, on the wells (inputs, the block, rows
// pressed) and on the chip fill, in both light and dark, so it has to clear 4.5:1 on every one of those.
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const dark = css.indexOf('prefers-color-scheme:dark');
const schemes = { light: css.slice(0, dark), dark: css.slice(dark) };
const token = (scheme: keyof typeof schemes, name: string) => {
  const m = schemes[scheme].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} not found in ${scheme}`);
  return m[1];
};

describe('muted text contrast (WCAG AA 4.5:1)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const bg of ['paper', 'well', 'well-2']) {
      it(`${scheme}: --muted on --${bg}`, () => {
        expect(ratio(token(scheme, 'muted'), token(scheme, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('light muted on paper is comfortably above the line (about 5:1 or better)', () => {
    expect(ratio(token('light', 'muted'), token('light', 'paper'))).toBeGreaterThanOrEqual(5);
  });
  it('the placeholder is muted at full strength (an opacity under 1 would drop it below AA)', () => {
    const m = css.match(/::placeholder\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/color:var\(--muted\)/);
    expect(m![0]).not.toMatch(/opacity:\s*0?\.\d/);
  });
});

describe('sub-line text contrast (--sub: the 16px lines under headings)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const bg of ['paper', 'well', 'well-2']) {
      it(`${scheme}: --sub on --${bg} is at least AA`, () => {
        expect(ratio(token(scheme, 'sub'), token(scheme, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('--sub is darker than --muted in light and lighter in dark (one step stronger)', () => {
    expect(ratio(token('light', 'sub'), token('light', 'paper'))).toBeGreaterThan(ratio(token('light', 'muted'), token('light', 'paper')));
    expect(ratio(token('dark', 'sub'), token('dark', 'paper'))).toBeGreaterThan(ratio(token('dark', 'muted'), token('dark', 'paper')));
  });
});

describe('long unbroken item text', () => {
  it('breaks anywhere instead of widening the page', () => {
    expect(css).toMatch(/body\{[^}]*overflow-wrap:anywhere/);
  });
  it('lets flex and grid children holding item text shrink below their content', () => {
    expect(css).toMatch(/\.plain li>span:first-child[^{]*\{[^}]*min-width:0/);
    expect(css).toMatch(/\.dates \.t[^{]*\{[^}]*min-width:0/);
    expect(css).toMatch(/grid-template-columns:22px minmax\(0,1fr\) auto/);
  });
});
