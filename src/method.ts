// The method's rules as data. This is the only file where the method's numbers live: block length, the 3 to 5
// items, the one break and its 10 minutes, the shorter-block options and the late cutoff. Lint points here when one
// of them turns up as a bare number anywhere else, and src/method.test.ts checks the logic against every rule.
// Pure: no imports, no DOM, no clock. Plain TypeScript that Node can run with its types stripped
// (scripts/check-method-quotes.mjs imports it), so no enums, namespaces or parameter properties.
//
// Each rule says where it comes from, so a later change can tell a faithful rule from a convenient one:
//   talk     the talk says it (ref is the timestamp in the transcript, quote is a verbatim piece of that line)
//   reading  the app's reading of a line in the talk; the talk does not state the number this way
//   app      the app's own addition; never attribute it to the talk

/** A timestamp in the talk transcript, m:ss. */
export type Ref = `${number}:${number}`;
export type Source = 'talk' | 'reading' | 'app';
interface RuleBase { source: Source; ref: Ref | null; quote: string | null; says: string }

export const RULES = {
  'three-to-five-items': {
    source: 'talk', ref: '4:36', quote: 'So write down those three to five things.',
    says: 'Write down three to five things and no more. Five is a hard cap; fewer than three gets a gentle note.',
    value: { suggested: 3, max: 5 },
  },
  'pick-risky-first': {
    source: 'reading', ref: '4:32', quote: 'To find the most important, you can often just look for the most',
    says: 'The pick list puts items with some chance of rejection or conflict (risky) first, then the rest in the order written. Never by push count.',
    value: { first: 'risky' },
  },
  'block-two-to-three-hours': {
    source: 'talk', ref: '5:17', quote: 'block out at least two to three hours to focus on one of them for today.',
    says: 'A full block is two to three hours.',
    value: { min: 120, max: 180, mid: 150 },
  },
  'full-block-is-120-focus-minutes': {
    source: 'reading', ref: '5:27', quote: '10 minutes here and there to add up to 120 minutes does not work.',
    says: 'A block is full once it holds 120 minutes of focus, the break excluded, however it ended. Less is a start. The 120 is the block minimum of block-two-to-three-hours; a test pins that they agree.',
    value: { focusMin: 120 },
  },
  'one-break-per-block': {
    source: 'app', ref: '5:22', quote: 'This is one block of time, uninterrupted, no distractions, no social media, cobbling together',
    says: 'The talk asks for one uninterrupted block. The app allows one short step-away per block; 10 minutes or more away ends it.',
    value: { breaks: 1, limitMin: 10 },
  },
  'shorter-block-options': {
    source: 'app', ref: null, quote: null,
    says: 'On a bad day the user may try a shorter block of 1 to 2 hours, labelled a modified practice. Pick starts on 90 minutes.',
    value: { options: [60, 90] },
  },
  // One cutoff (PRODUCT QUESTION Q1, decided: 12:00) for the Welcome framing, the bad-day check and the Pick line alike.
  // Not from the talk: its only clock anchors are "I didn't get up until 1130" (0:29) and "around 12 noon" (0:40).
  'late-start': {
    source: 'app', ref: null, quote: null,
    says: 'Opening at or after 12:00 local time counts as a late start: the Welcome framing, the bad-day check and the Pick line.',
    value: { hour: 12 },
  },
} as const satisfies Record<string, RuleBase & { value: unknown }>;
export type RuleId = keyof typeof RULES;

export const MAX_ITEMS = RULES['three-to-five-items'].value.max;
export const SUGGESTED_MIN = RULES['three-to-five-items'].value.suggested;
export const BLOCK_MIN = RULES['block-two-to-three-hours'].value.min;
export const BLOCK_MAX = RULES['block-two-to-three-hours'].value.max;
export const FULL_BLOCK_FOCUS_MIN = RULES['full-block-is-120-focus-minutes'].value.focusMin;
export const SMALL_BLOCK_OPTIONS = RULES['shorter-block-options'].value.options;
/** The shorter block Pick starts on. */
export const SMALL_BLOCK_DEFAULT = SMALL_BLOCK_OPTIONS[1];
export const BREAKS_PER_BLOCK = RULES['one-break-per-block'].value.breaks;
export const BREAK_LIMIT_MIN = RULES['one-break-per-block'].value.limitMin;
export const BREAK_LIMIT_MS = BREAK_LIMIT_MIN * 60_000;
export const PICK_FIRST = RULES['pick-risky-first'].value.first;
/** The late cutoff: a local hour (0 to 23) at or after it is a late start. */
export const LATE_CUTOFF = RULES['late-start'].value.hour;
/** True when a local hour is at or after the late cutoff. The one place an hour is compared with it. */
export const lateAt = (hour: number): boolean => hour >= LATE_CUTOFF;
/** The block lengths Pick offers: the shorter options up to a full block, or a full block up to its maximum. */
export const BLOCK_CHOICES = {
  small: [...SMALL_BLOCK_OPTIONS, BLOCK_MIN],
  full: [BLOCK_MIN, RULES['block-two-to-three-hours'].value.mid, BLOCK_MAX],
} as const;
