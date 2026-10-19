// The mutation table: each row is a small edit to a copy of the repo that a safety net layer should catch.


const EM = String.fromCharCode(0x2014);
const BRAND_LINE = "export const BRAND = 'Do The Hard Thing';";
const DOMAIN_LINE = "export const DOMAIN_DISPLAY = 'DoTheHardThing.app';";
const ASK_BACK = "<button className=\"secondary\" onClick={() => (idx ? setIdx(idx - 1) : onBack())}>{t('back')}</button>";
const CUTOFF = 'value: { hour: 12 },';
const BAD_DAY_LATE = 'const late = lateAt(now.getHours());';
const PICK_LATE = 'const late = isLate(clockNow());';
const LATE_ONLY = 'const lateOnly = bad.bad && bad.late && bad.missedDays === 0;';
const PICK_DEFAULT = 'useState<number>(small ? SMALL_BLOCK_DEFAULT : BLOCK_MIN)';
const ROLLOVER = '  if (dayKey(new Date(now)) === day.date) return false;\n  if (day.closed) return true;';

// { id, what, file, edits: [[find, replace], ...], journeys, only?, why? }. A row with no journey says which layer alone
// can see it (`only`) and why. Each find must occur exactly once in the file (scripts/mutate.test.mjs checks the table).
export const MUTATIONS = [
  // the method's numbers, the late cutoff and the late welcome
  { id: 'block-min-30', what: 'full block 120 to 30 minutes (method.ts)', file: 'src/method.ts',
    edits: [['value: { min: 120, max: 180, mid: 150 },', 'value: { min: 30, max: 180, mid: 150 },']],
    journeys: ['pick-default-length', 'close-day', 'start-end-block', 'short-block-yes-counts', 'small-block-modified'] },
  { id: 'late-cutoff-11', what: 'late cutoff 12 to 11 (late-start in RULES)', file: 'src/method.ts',
    edits: [[CUTOFF, CUTOFF.replace('12', '11')]], journeys: ['late-cutoffs'] },
  { id: 'late-cutoff-13', what: 'late cutoff 12 to 13 (late-start in RULES)', file: 'src/method.ts',
    edits: [[CUTOFF, CUTOFF.replace('12', '13')]], journeys: ['late-cutoffs'] },
  { id: 'welcome-late-from-11-logic', what: 'Welcome turns late an hour before Pick (badDay reads the hour plus one, logic.ts)', file: 'src/logic.ts',
    edits: [[BAD_DAY_LATE, BAD_DAY_LATE.replace('getHours()', 'getHours() + 1')]], journeys: ['late-cutoffs'] },
  { id: 'pick-late-line-from-11', what: 'Pick turns late an hour before Welcome (late line from 11:00)', file: 'src/App/Pick.tsx',
    edits: [[PICK_LATE, PICK_LATE.replace('clockNow()', 'clockNow() + 3_600_000')]], journeys: ['late-cutoffs'] },
  { id: 'pick-late-line-never', what: 'Pick never shows its late line', file: 'src/App/Pick.tsx',
    edits: [[PICK_LATE, PICK_LATE.replace(');', ') && false;')]], journeys: ['late-cutoffs', 'review-copy', 'small-block-modified'] },
  { id: 'late-only-full-welcome', what: 'a late start with no missed days gets the full welcome back again (Welcome.tsx)', file: 'src/App/Welcome.tsx',
    edits: [[LATE_ONLY, LATE_ONLY.replace(';', ' && false;')]], journeys: ['late-cutoffs', 'returning-late', 'small-block-modified'] },
  { id: 'late-only-with-missed-days', what: 'missed days and late get the milder late welcome (Welcome.tsx)', file: 'src/App/Welcome.tsx',
    edits: [[LATE_ONLY, LATE_ONLY.replace('=== 0', '>= 0')]], journeys: ['late-cutoffs'] },
  { id: 'pick-risky-last', what: 'pick order flipped, risky last', file: 'src/logic.ts',
    edits: [['return [...hl.filter((i) => i.tags.includes(PICK_FIRST)), ...hl.filter((i) => !i.tags.includes(PICK_FIRST))];',
      'return [...hl.filter((i) => !i.tags.includes(PICK_FIRST)), ...hl.filter((i) => i.tags.includes(PICK_FIRST))];']], journeys: ['pick-order-risky-first'] },
  { id: 'break-limit-20', what: 'break limit 10 to 20 minutes (BREAK_LIMIT_MS)', file: 'src/method.ts',
    edits: [['export const BREAK_LIMIT_MS = BREAK_LIMIT_MIN * 60_000;', 'export const BREAK_LIMIT_MS = BREAK_LIMIT_MIN * 120_000;']],
    journeys: ['step-away-broken', 'review-copy'] },
  { id: 'two-breaks', what: 'one break per block allows two', file: 'src/logic.ts',
    edits: [['taken >= 0 && taken < BREAKS_PER_BLOCK;', 'taken >= 0 && taken <= BREAKS_PER_BLOCK;']], journeys: ['one-break-per-block', 'review-copy'] },
  { id: 'pick-default-150', what: 'Pick starts on 2½h instead of the 2h minimum', file: 'src/App/Pick.tsx',
    edits: [[PICK_DEFAULT, PICK_DEFAULT.replace(': BLOCK_MIN)', ': BLOCK_MIN + 30)')]], journeys: ['pick-default-length', 'start-end-block', 'close-day'] },
  { id: 'bare-block-lengths', what: 'Pick writes the full block lengths as bare numbers (same values)', file: 'src/App/Pick.tsx',
    edits: [['const opts = small ? BLOCK_CHOICES.small : BLOCK_CHOICES.full;', 'const opts = small ? BLOCK_CHOICES.small : [120, 150, 180];']],
    journeys: [], only: 'lint', why: 'the same numbers written bare: the app behaves the same, so only the method-number lint can see it' },
  // the day and its records
  { id: 'trim-days-3', what: 'trimDays window 120 to 3', file: 'src/logic.ts', edits: [['export const MAX_DAYS = 120;', 'export const MAX_DAYS = 3;']],
    journeys: ['count-grows', 'start-over-count', 'close-not-today-count'] },
  { id: 'rollover-never', what: 'shouldRollOver always false', file: 'src/logic.ts',
    edits: [[ROLLOVER, ROLLOVER.replace('=== day.date)', '=== day.date || now)')]], journeys: ['midnight-rollover', 'block-across-midnight'] },
  { id: 'settle-never-complete', what: 'settle never completes a block', file: 'src/logic.ts',
    edits: [['if (b.pausedAt == null && remainingMs(b, now) === 0) return', 'if (b.pausedAt == null && remainingMs(b, now) < 0) return']],
    journeys: ['close-day', 'block-across-midnight', 'block-reload-after-midnight', 'small-block-modified'] },
  { id: 'leftovers-ignore-didit', what: 'didIt ignored by leftovers (a done item carries over)', file: 'src/logic.ts',
    edits: [['.filter((i) => !(d.didIt === true && i.id === d.chosenId) && !aside.includes(i))', '.filter((i) => !aside.includes(i))']],
    journeys: ['yes-clears-item', 'short-block-yes-counts'] },
  { id: 'supersedes-never', what: "a stale tab never takes the other tab's closed day", file: 'src/logic.ts',
    edits: [['export const supersedes = (stored: Day, mine: Day) => stored.closed &&', "export const supersedes = (stored: Day, mine: Day) => stored.closed && mine.date === 'never' &&"]],
    journeys: ['two-tabs'] },
  { id: 'done-text-null', what: 'Yes stores no doneText (Your days shows a placeholder)', file: 'src/state.ts',
    edits: [['doneText: a.didIt ? chosenItem(s.day)?.text ?? null : null', 'doneText: null']], journeys: ['count-grows', 'history-from-close-and-about'] },
  { id: 'pick-back-to-welcome', what: 'reducer: stepBack on Pick (Look again) lands on Welcome, not Ask', file: 'src/state.ts',
    edits: [["if (a.type === 'stepBack') return { screen: 'ask', day: s.day, small: s.small };", "if (a.type === 'stepBack') return { screen: 'welcome', day: s.day, small: s.small };"]],
    journeys: ['copy-from-the-talk'] },
  { id: 'block-without-choice', what: 'reducer: Start the block with no choice still opens the block screen', file: 'src/state.ts',
    edits: [['if (!s.chosen) return s;', "if (!s.chosen) return { screen: 'block', now, day: { ...s.day, block: { ...L.startBlock(a.min, now, s.small), endedAt: null }, gotBlock: null } };"]],
    journeys: ['pick-requires-choice'] },
  // screens
  { id: 'first-day-hidden-after-nav', what: 'first-day line gone after leaving Close and coming back (remount)', file: 'src/App/Close.tsx',
    edits: [['export function Close(', 'let closeSeen = false;\nexport function Close('],
      ['  const { note, count } = L.closeLines(didIt, total);\n', '  const { note, count } = L.closeLines(didIt, total);\n  const again = useRef(closeSeen).current;\n  useEffect(() => { closeSeen = true; }, []);\n'],
      ['{count && <Tally line={count} />}', "{count && !(again && count === t('close.firstCount')) && <Tally line={count} />}"]],
    journeys: ['close-first-day-after-nav', 'history-from-close-and-about', 'close-not-today-count', 'count-grows'] },
  { id: 'no-hour-line-first-visit', what: 'hour-before-email line removed from the first-visit welcome', file: 'src/App/Welcome.tsx',
    edits: [["        <p className=\"hour\">{t('welcome.hour')}</p>\n", '']], journeys: ['first-visit', 'first-visit-late', 'welcome-v1'] },
  { id: 'ask-no-back', what: 'Back button dropped on Ask', file: 'src/App/Ask.tsx', edits: [[ASK_BACK, `{false && ${ASK_BACK}}`]],
    journeys: ['ask-back', 'first-visit', 'welcome-v1', 'focus-after-nav'] },
  { id: 'ask-back-skips-to-name', what: 'Back on a later Ask item goes to Name, not the item before', file: 'src/App/Ask.tsx',
    edits: [['onClick={() => (idx ? setIdx(idx - 1) : onBack())}', 'onClick={() => onBack()}']], journeys: ['ask-back'] },
  { id: 'save-note-hidden', what: 'blocked-storage note never shown', file: 'src/App.tsx',
    edits: [['useEffect(() => { setSaveFailed(!save(store, day.date)); }, [store, day.date]);', 'useEffect(() => { save(store, day.date); setSaveFailed(false); }, [store, day.date]);']],
    journeys: ['storage-blocked'] },
  { id: 'item-as-html', what: 'step 1 list renders item text as HTML', file: 'src/App/Name.tsx',
    edits: [['<li key={i.id}><span>{i.text}</span>', '<li key={i.id}><span dangerouslySetInnerHTML={{ __html: i.text }} />']], journeys: ['hostile-text'] },
  { id: 'dnt-ignored', what: 'Do Not Track ignored by analytics', file: 'src/analytics.ts', edits: [['if (!e.enabled || e.dnt()) return;', 'if (!e.enabled) return;']],
    journeys: ['analytics-do-not-track'] },
  // accessibility and layout
  { id: 'no-aria-pressed-group', what: 'aria-pressed removed from the Already-on-your-list toggles', file: 'src/App/Name.tsx',
    edits: [["className={`choice ${on ? 'on' : ''}`} aria-pressed={on} onClick", "className={`choice ${on ? 'on' : ''}`} onClick"]],
    journeys: ['same-answer-two-steps', 'name-pending-draft'] },
  { id: 'no-aria-pressed-leftover', what: 'aria-pressed removed from the step 1 leftover toggles', file: 'src/App/Name.tsx',
    edits: [[' aria-pressed={has(l.text)} ', ' ']], journeys: ['step0-bring-in', 'returning-late'] },
  { id: 'no-role-timer', what: 'role=timer removed', file: 'src/App/BlockView.tsx', edits: [['role="timer" aria-live="off"', 'aria-live="off"']], journeys: ['start-end-block'] },
  { id: 'dots-no-role', what: 'progress dots lose role=img', file: 'src/App/Welcome.tsx', edits: [['className="steps" role="img" aria-label', 'className="steps" aria-label']],
    journeys: ['focus-after-nav', 'review-copy'] },
  { id: 'no-overflow-wrap', what: 'overflow-wrap removed from index.css', file: 'src/index.css', edits: [['body{overflow-wrap:anywhere}', 'body{}']],
    journeys: ['long-url-widths', 'small-phone-layout'] },
  { id: 'muted-low-contrast', what: '--muted back to #6b7079 (4.48:1)', file: 'src/index.css', edits: [['--muted:#5c616a', '--muted:#6b7079']], journeys: ['contrast-aa'] },
  // the brand, the domain and the copy
  { id: 'brand-lowercase-header', what: 'brand lowercased in the header (App.tsx)', file: 'src/App.tsx',
    edits: [['<span className="brand">{BRAND}</span>', '<span className="brand">{BRAND.toLowerCase()}</span>']], journeys: ['first-visit', 'social-preview'] },
  { id: 'brand-lowercase-copy', what: 'brand lowercased at the source (copy.ts BRAND)', file: 'src/copy.ts',
    edits: [[BRAND_LINE, BRAND_LINE.replace(/'.*'/, (m) => m.toLowerCase())]], journeys: ['first-visit', 'social-preview'] },
  { id: 'domain-lowercase-copy', what: 'domain lowercased at the source (copy.ts DOMAIN_DISPLAY)', file: 'src/copy.ts',
    edits: [[DOMAIN_LINE, DOMAIN_LINE.replace(/'.*'/, (m) => m.toLowerCase())]], journeys: ['social-preview'] },
  { id: 'em-dash-copy', what: 'an em dash in a copy.ts line (pick.ten)', file: 'src/copy.ts',
    edits: [['nothing important gets done. So pick one.', `nothing important gets done ${EM} so pick one.`]], journeys: ['review-copy', 'copy-from-the-talk'] },
  { id: 'quote-cut', what: 'a talk quote loses its last word (about.busy)', file: 'src/copy.ts',
    edits: [["text: 'Being busy is a form of laziness.'", "text: 'Being busy is a form of.'"]], journeys: ['copy-from-the-talk'] },
];