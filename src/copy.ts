// The words on the Welcome (first visit, returning morning, late start, missed days), Pick (and "Nothing got a yes"),
// Close and Closed screens, in one place. App.tsx renders those screens only through t(id), fmt and the constants here,
// logic.ts reads its close and welcome lines from here, and the journeys (e2e/drive.mjs) import this file, so a wording
// change here moves the app and its assertions together. The other screens move here next.
// Pure like method.ts: no imports, no DOM. Erasable TypeScript only (no enums, namespaces or parameter properties), so
// Node runs it with its types stripped.
//
// Each line says where it comes from, so a later change can tell a faithful line from a convenient one:
//   quote       the talk word for word; ref is the timestamp of the transcript line where the quoted words start
//   paraphrase  the talk in the app's words; ref is the timestamp of the line it paraphrases
//   own         the app's own words; it can never carry a talk timestamp
// src/copy.test.ts checks the quotes and refs against the transcript where FERRISS_TRANSCRIPT points at one (the transcript
// is not in the repo), and checks kinds, ref shapes and the REQUIRED lines everywhere.

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
/** A timestamp in the talk transcript, m:ss (two digits of seconds, so '4:5' and '4:005' are type errors). */
export type TalkRef = `${number}:${Digit}${Digit}`;
export type CopyEntry =
  | { kind: 'quote'; text: string; ref: TalkRef }
  | { kind: 'paraphrase'; text: string; ref: TalkRef }
  | { kind: 'own'; text: string; ref?: never };

// the brand in Title Case and the domain as people read it. DOMAIN_DISPLAY and SITE_URL have no consumer yet: they are
// reserved for step 7 and the other surfaces (the remaining screens, the share text, the meta tags)
export const BRAND = 'Do The Hard Thing';
export const DOMAIN_DISPLAY = 'DoTheHardThing.app';
export const SITE_URL = 'https://dothehardthing.app';
export const TALK_URL = 'https://x.com/tferriss/status/2110445158206447830';

const entries = <T extends Record<string, CopyEntry>>(e: T): T => e;

// Judgment calls on kind, none visible on screen: `first.step2` is a quote of a fragment ("so you got to pick one thing"),
// and `close.good` and `closed.slide` are paraphrases ("That's the whole thing."; the talk says "they'll", not "It'll").
export const COPY = entries({
  // ---- welcome, first visit ----
  'first.eyebrow': { kind: 'own', text: 'Welcome' },
  'first.hero': { kind: 'own', text: 'Each morning, do the one hard thing you’ve been avoiding.' },
  'first.step1': { kind: 'own', text: 'Name what you’re avoiding' },
  'first.step1.d': { kind: 'paraphrase', text: 'Write it plainly: three to five, no more.', ref: '4:11' },
  'first.step2': { kind: 'quote', text: 'Pick one thing', ref: '6:05' },
  'first.step2.d': { kind: 'own', text: 'The one that matters most today.' },
  'first.step3': { kind: 'own', text: 'Protect one block' },
  'first.step3.d': { kind: 'paraphrase', text: 'At least two to three hours, unbroken.', ref: '5:01' },
  'first.source': { kind: 'own', text: 'Built from Tim Ferriss’s morning method.' },
  'talk.link': { kind: 'own', text: 'Watch his short talk' }, // one name for the link, wherever it appears
  'first.start': { kind: 'own', text: 'Start' },
  'first.assure': { kind: 'own', text: 'Free · private · works offline' },
  // one line for the first visit and every morning welcome. The talk's step one: "wake up at least an hour before you
  // have to be at a computer screen"
  'welcome.hour': { kind: 'paraphrase', text: 'Ideally an hour before email or screens.', ref: '3:55' },

  // ---- welcome, returning ----
  'welcome.eyebrow.morning': { kind: 'own', text: 'Before email' },
  'welcome.eyebrow.late': { kind: 'own', text: 'Start where you are' },
  'welcome.ready': { kind: 'own', text: 'I\'m ready' },
  'morning.hero': { kind: 'paraphrase', text: 'Make some tea.', ref: '4:06' },
  'morning.email': { kind: 'paraphrase', text: 'Email can wait; it\'s the mind killer.', ref: '4:02' },
  'morning.takes': { kind: 'own', text: 'This takes a few minutes, then one protected block.' },
  'bad.hero': { kind: 'own', text: 'Welcome back. No catching up needed.' },
  'bad.missed': { kind: 'own', text: 'It’s been a few days.' },
  'bad.late': { kind: 'own', text: 'Later start today.' },
  'bad.everybody': { kind: 'quote', text: 'Even the best of the best feel this way sometimes. It happens to everybody.', ref: '7:11' },
  'bad.vonnegut': { kind: 'quote', text: 'When I write, I feel like an armless, legless man with a crayon in his mouth.', ref: '7:21' },
  'bad.vonnegut.cite': { kind: 'own', text: 'Kurt Vonnegut' },
  'bad.notAlone': { kind: 'quote', text: 'You\'re better than you think, and you\'re definitely not alone.', ref: '7:34' },
  'bad.shorter': { kind: 'own', text: 'Try a shorter block today (1 to 2h). A modified practice; the full block is two to three hours.' },

  // ---- pick ----
  'none.hero': { kind: 'own', text: 'Nothing got a yes.' },
  'none.useful': { kind: 'own', text: 'That\'s useful to know. Is there something you\'re avoiding that didn\'t make the list?' },
  'guise': { kind: 'quote', text: 'Being busy is most often used as a guise for avoiding the few critically important but uncomfortable actions you need to take.', ref: '6:56' },
  'cite.tim': { kind: 'own', text: 'Tim Ferriss' },
  'none.again': { kind: 'own', text: 'Look again' },
  'pick.eyebrow': { kind: 'own', text: 'Pick one' },
  'pick.hero': { kind: 'own', text: 'Which one thing gets today?' },
  'pick.ten': { kind: 'paraphrase', text: 'With ten important things, nothing important gets done. So pick one.', ref: '5:55' },
  'pick.howLong': { kind: 'own', text: 'How long' },
  'pick.lengthLabel': { kind: 'own', text: 'Block length' },
  'pick.smallNote': { kind: 'own', text: 'A shorter block is a modified practice. The full block is two to three hours.' },
  // first.step3.d without the period: the Pick line goes on after it (fmt.pickLine), so it is its own entry, which the
  // one-line-one-entry test cannot see
  'pick.full': { kind: 'paraphrase', text: 'At least two to three hours, unbroken', ref: '5:01' },
  'pick.small': { kind: 'own', text: 'One unbroken block' },
  'pick.early': { kind: 'own', text: 'first thing, before the day gets loud.' },
  'pick.late': { kind: 'own', text: 'First thing is best, but now works too.' },
  'pick.slide': { kind: 'paraphrase', text: 'Let the rest slide; it\'ll still be there tomorrow.', ref: '5:08' },
  'pick.start': { kind: 'own', text: 'Start the block' },

  // ---- close and closed ----
  'close.eyebrow': { kind: 'own', text: 'Close the day' },
  'close.hero': { kind: 'own', text: 'Did you do it?' },
  'close.noItem': { kind: 'own', text: 'Your one thing today.' },
  'close.yes': { kind: 'own', text: 'Yes' },
  'close.notToday': { kind: 'own', text: 'Not today' },
  'close.first': { kind: 'own', text: 'That\'s your first one. Nothing else to add.' },
  'close.firstCount': { kind: 'own', text: 'Your first day. It starts here.' },
  'close.good': { kind: 'paraphrase', text: 'Good. That\'s the whole thing for today.', ref: '5:43' },
  'close.alright': { kind: 'paraphrase', text: 'That\'s alright. It\'ll still be there tomorrow.', ref: '5:08' },
  'close.today': { kind: 'own', text: 'Close today' },
  'seeDays': { kind: 'own', text: 'See your days' },
  'closed.eyebrow': { kind: 'own', text: 'Today is closed' },
  'closed.done': { kind: 'own', text: 'One thing, done.' },
  'closed.fresh': { kind: 'own', text: 'Tomorrow is a fresh page.' },
  'closed.slide': { kind: 'paraphrase', text: 'Let the rest of the urgent but less important stuff slide. It\'ll still be there tomorrow.', ref: '5:08' },
  'closed.noStreaks': { kind: 'own', text: 'No streaks. If you slip, just come back.' },
  'closed.overGroup': { kind: 'own', text: 'Start today over' },
  'closed.overAsk': { kind: 'own', text: 'Start over? Today\'s list and block will be cleared.' },
  'closed.overYes': { kind: 'own', text: 'Yes, start over' },
  'closed.keep': { kind: 'own', text: 'Keep today' },
});

export type CopyId = keyof typeof COPY;
export const t = (id: CopyId): string => COPY[id].text;

// lines with a value in them, built from the entries above
export const fmt = {
  closeItem: (item: string) => `“${item}”, your one thing today.`,
  // `days` is daysWord(n) from logic.ts: '1 day' or 'N days'
  closeCount: (days: string) => `${days} you've done your one thing since you started`,
  pickLine: (small: boolean, late: boolean) =>
    `${t(small ? 'pick.small' : 'pick.full')}${late ? `. ${t('pick.late')}` : `, ${t('pick.early')}`} ${t('pick.slide')}`,
};

// Lines that must be on a screen whenever it shows: src/copy.test.ts renders each screen state and looks for every one.
// Sentences only (a line ending in . ? or !, or of four or more words): a button name like 'Yes' would pass by accident.
const FIRST_WELCOME = ['first.hero', 'first.step1.d', 'first.step2.d', 'first.step3.d', 'first.source', 'talk.link', 'welcome.hour', 'first.assure'] as const;
export const REQUIRED = {
  firstWelcome: FIRST_WELCOME,
  // a first visit after the welcomeFraming cutoff is still the first welcome, hour line included
  firstWelcomeLate: FIRST_WELCOME,
  morningWelcome: ['morning.hero', 'morning.email', 'morning.takes', 'welcome.hour'],
  lateWelcome: ['bad.hero', 'bad.late', 'bad.everybody', 'bad.vonnegut', 'bad.notAlone', 'bad.shorter'],
  missedWelcome: ['bad.hero', 'bad.missed', 'bad.everybody', 'welcome.hour', 'bad.shorter'],
  nothingPicked: ['none.hero', 'none.useful', 'guise'],
  pick: ['pick.hero', 'pick.ten', 'pick.full', 'pick.slide'],
  close: ['close.hero', 'close.noItem'],
  closeFirstYes: ['close.hero', 'close.first', 'close.firstCount'],
  closed: ['closed.done', 'closed.slide'],
  closedNotToday: ['closed.fresh', 'closed.slide', 'closed.noStreaks'],
} as const satisfies Record<string, readonly CopyId[]>;
