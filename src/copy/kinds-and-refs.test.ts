// src/copy.ts: the kind and ref of every line, and that fmt holds no sentences. Runs everywhere (no transcript needed).

import { describe, expect, it } from 'vitest';
import { fill, fmt } from '../copy';
import type { CopyEntry } from '../copy';
import copySource from '../copy.ts?raw';
import ts from 'typescript';
import { entries, cited } from './entries.testlib';

// ---- kinds and refs, no transcript needed ----
describe('every copy entry has a kind and the right ref', () => {
  it.each(cited)('%s (quote or paraphrase) has a talk timestamp m:ss', (_id, e) => {
    expect(e.ref, "a quote or paraphrase needs ref: the [m:ss] transcript timestamp of the line it comes from").toMatch(/^\d+:\d{2}$/);
  });
  it.each(entries.filter(([, e]) => e.kind === 'own'))('%s (own) carries no ref', (_id, e) => {
    expect('ref' in e, "the app's own words never carry a talk timestamp: drop ref, or make it kind: 'paraphrase'").toBe(false);
  });
  it.each(entries)('%s has trimmed, non-empty text and a known kind', (_id, e) => {
    expect(['quote', 'paraphrase', 'own']).toContain(e.kind);
    expect(e.text.trim()).not.toBe('');
    expect(e.text).toBe(e.text.trim());
  });
  it('no two ids hold the same text: one line, one entry, used wherever it shows (tsc already rejects a repeated id)', () => {
    const seen = new Map<string, string>();
    for (const [id, e] of entries) {
      expect(seen.get(e.text), `${id} repeats ${seen.get(e.text)}: use t('${seen.get(e.text)}') in both places`).toBeUndefined();
      seen.set(e.text, id);
    }
  });
});

// fmt holds no talk words: every sentence is an entry with a kind, and fmt only fills its {placeholders} and joins
// entries. Read from the source, since fmt's literals are not visible at run time.
describe('fmt holds no sentences of its own', () => {
  const source = ts.createSourceFile('copy.ts', copySource, ts.ScriptTarget.Latest, true);
  const literals: string[] = [];
  let found = false;
  const walk = (node: ts.Node, inFmt: boolean) => {
    const here = inFmt || (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fmt');
    if (here && ts.isVariableDeclaration(node)) found = true;
    if (here && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) literals.push(node.text);
    node.forEachChild((child) => walk(child, here));
  };
  walk(source, false);
  it('finds fmt in src/copy.ts', () => expect(found).toBe(true));
  it('no literal in fmt has four or more words', () => {
    for (const literal of literals) {
      const words = literal.split(/\s+/).filter((w) => /\w/.test(w)).length;
      expect(words, `fmt holds "${literal}": make it an entry in COPY with a kind (a value in it is a {placeholder} filled with fill()), and build the line from t() or fill()`).toBeLessThan(4);
    }
  });
  it('fill() replaces each placeholder once, keeps typed text as typed, and refuses a missing value', () => {
    expect(fmt.closeItem('{item} $& $1')).toBe('“{item} $& $1”, your one thing today.');
    expect(fmt.pausedLine(3, 10)).toBe('Stepped away 3 min. Back within 10 to keep it one block. You get one pause per block.');
    expect(() => fill('close.item', {})).toThrow("fill('close.item'): no value for {item}");
  });
  it.each(entries.filter(([, e]) => e.text.includes('{')))('%s: every {placeholder} has a name', (_id, e) => {
    expect(e.text.replace(/\{\w+\}/g, ''), 'a brace in an entry is a {name} placeholder, filled by fill()').not.toMatch(/[{}]/);
  });
});

// a quote or paraphrase needs a ref in m:ss form; the app's own words can never carry one
// @ts-expect-error quote without ref
export const quoteNoRef: CopyEntry = { kind: 'quote', text: 'x' };
// @ts-expect-error paraphrase without ref
export const paraphraseNoRef: CopyEntry = { kind: 'paraphrase', text: 'x' };
// @ts-expect-error own with a ref
export const ownRef: CopyEntry = { kind: 'own', text: 'x', ref: '4:32' };
// @ts-expect-error a ref that is not a timestamp
export const badRef: CopyEntry = { kind: 'quote', text: 'x', ref: 'soon' };
// @ts-expect-error seconds need two digits
export const shortRef: CopyEntry = { kind: 'quote', text: 'x', ref: '4:5' };
// @ts-expect-error seconds need two digits, no more
export const longRef: CopyEntry = { kind: 'quote', text: 'x', ref: '4:055' };
