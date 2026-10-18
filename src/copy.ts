// Every word the app shows, in one place: the Welcome (first visit, returning morning, late start, missed days), Name,
// Ask, Pick (and "Nothing got a yes"), block, Close, Closed, Your days and About screens, the header, the save note, the
// notifications, and the labels logic.ts builds (tags, day counts, the reminder status). App.tsx, logic.ts and
// reminder.ts render or return words only through t(id), fmt and the constants here, and the journeys (e2e/drive.mjs)
// import this file, so a wording change here moves the app and its assertions together.
// Pure like method.ts: no imports, no DOM. Erasable TypeScript only (no enums, namespaces or parameter properties), so
// Node runs it with its types stripped.
//
// Each line says where it comes from, so a later change can tell a faithful line from a convenient one:
//   quote       the talk word for word; ref is the timestamp of the transcript line where the quoted words start
//   paraphrase  the talk in the app's words; ref is the timestamp of the line it paraphrases
//   own         the app's own words; it can never carry a talk timestamp
// src/copy.test.ts checks the quotes and refs against the transcript where FERRISS_TRANSCRIPT points at one (the transcript
// is not in the repo), and checks kinds, ref shapes and the REQUIRED lines everywhere.
// fmt holds no talk words: a line from the talk is an entry with a kind. A line with a value in it is an entry with a
// {placeholder} that fmt fills through fill(), and src/copy.test.ts fails on any literal of four or more words in fmt.
//
// Some ids are named for one screen and show on others too (the no-duplicate-text test makes them share one entry), so a
// wording change there moves every place: close.yes is also Ask's Yes, pick.eyebrow is also Ask's last button,
// twoQuestions is the last Name button and the Ask eyebrow, yourOneThing is the block eyebrow and the Your days stand-in
// for a done day with no text, and back, next, about, done, yourDays and no show on more than one screen.
//
// Bundle cost: the ids, kinds and refs ship to the browser with the text (about 1.5 KB gzip for 142 entries). If the
// table keeps growing, build a text-only map at build time.

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
/** A timestamp in the talk transcript, m:ss (two digits of seconds, so '4:5' and '4:005' are type errors). */
export type TalkRef = `${number}:${Digit}${Digit}`;
export type CopyEntry =
  | { kind: 'quote'; text: string; ref: TalkRef }
  | { kind: 'paraphrase'; text: string; ref: TalkRef }
  | { kind: 'own'; text: string; ref?: never };

// the brand in Title Case and the domain as people read it. DOMAIN_DISPLAY is the domain on the link preview card
// (scripts/og/card.mjs); SITE_URL is the live site the journeys and scripts/verify-live.mjs check. index.html keeps its
// meta tags literal (it cannot import this file), and check-text holds them to the same spelling.
export const BRAND = 'Do The Hard Thing';
export const DOMAIN_DISPLAY = 'DoTheHardThing.app';
export const SITE_URL = 'https://dothehardthing.app';
export const TALK_URL = 'https://x.com/tferriss/status/2110445158206447830';

const entries = <T extends Record<string, CopyEntry>>(e: T): T => e;

// Judgment calls on kind: `first.step2` and `block.comeBack` are quotes of fragments ("so you got to pick one thing",
// "just gently come back to your one to-do."), `close.good` and `closed.slide` are paraphrases ("That's the whole
// thing."; the talk says "they'll", not "It'll"), and the Name, block and About calls are noted at each entry.
export const COPY = entries({
  // ---- shared: one word or line on more than one screen ----
  'about': { kind: 'own', text: 'About' }, // the header link and the About heading
  'done': { kind: 'own', text: 'Done' }, // the header link on About and Your days
  'saveNote': { kind: 'own', text: 'Progress will not be saved on this device.' },
  'back': { kind: 'own', text: 'Back' }, // Name, Ask, Your days
  'next': { kind: 'own', text: 'Next' }, // Name, Ask
  'no': { kind: 'own', text: 'No' }, // Ask; its Yes is close.yes, the same word
  'twoQuestions': { kind: 'own', text: 'Two questions' }, // the last Name button and the Ask eyebrow
  'yourDays': { kind: 'own', text: 'Your days' }, // the Your days eyebrow and the About row
  'yourOneThing': { kind: 'own', text: 'Your one thing' }, // the block eyebrow and a done day with no text on Your days
  // the screen main.tsx shows if the app fails to render
  'error.hero': { kind: 'own', text: 'Something went wrong.' },
  'error.reload': { kind: 'own', text: 'Reloading usually fixes it.' },
  'error.button': { kind: 'own', text: 'Reload' },
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

  // ---- name: three steps, one per tag ----
  // The step titles and hints are the talk's step three in the app's words, so paraphrases: the putting-off step is
  // "things that have been punted from one day's to do list to the next" (4:21), the risky one "with some chance of
  // rejection or conflict" (4:32, the hint the sentence from 4:26), the anxious one "most anxious or uncomfortable" (4:16).
  // "Write it plainly" is the app's own, inside a paraphrase: a judgment call.
  'name.eyebrow': { kind: 'own', text: 'Name the discomfort' },
  'name.pushed': { kind: 'paraphrase', text: 'What have you been putting off?', ref: '4:21' },
  'name.pushed.hint': { kind: 'paraphrase', text: 'The thing you keep moving to tomorrow. Write it plainly.', ref: '4:21' },
  'name.risky': { kind: 'paraphrase', text: 'What could get you rejected, or start a conflict?', ref: '4:32' },
  'name.risky.hint': { kind: 'paraphrase', text: 'Most important usually means most uncomfortable, very often with some chance of rejection or conflict.', ref: '4:26' },
  'name.anxious': { kind: 'paraphrase', text: 'What else is making you anxious?', ref: '4:16' },
  'name.anxious.hint': { kind: 'paraphrase', text: 'Whatever else makes you most anxious or uncomfortable.', ref: '4:16' },
  'name.leftovers': { kind: 'own', text: 'From yesterday, still open. Tap what still matters. The rest stays behind, and nothing comes along unless you choose it.' },
  'name.placeholder': { kind: 'own', text: 'Write it plainly' },
  'name.placeholderNew': { kind: 'own', text: 'Or write something new' },
  // the full-list placeholder, and the same words as a sentence in the note under the input: two lines, two entries
  'name.placeholderFull': { kind: 'own', text: 'Five is the limit' },
  'name.full': { kind: 'own', text: 'Five is the limit.' },
  'name.add': { kind: 'own', text: 'Add' },
  'name.skip': { kind: 'own', text: 'Skip' },
  'name.listed': { kind: 'own', text: 'Already on your list' },
  'name.listedTap': { kind: 'own', text: 'Already on your list. Tap one if it fits here too.' },
  // the notes under the input when the text is already listed: gained this step's tag, or had it already
  'name.noteTagged': { kind: 'own', text: 'That one\'s already on your list. Marked {tag} too.' },
  'name.noteAlready': { kind: 'own', text: 'That one\'s already on your list as {label}.' },
  // own, not a paraphrase: "three to five" is the talk's (4:11), but the talk says "and no more", never that fewer is fine
  'name.fewer': { kind: 'own', text: 'Three to five usually helps, but fewer is fine if that\'s honest.' },
  // the tag words on every chip and in the Name notes (fmt.tag, fmt.pushedTimes)
  'tag.pushed': { kind: 'own', text: 'pushed' },
  'tag.risky': { kind: 'own', text: 'risky' },
  'tag.anxious': { kind: 'own', text: 'anxious' },

  // ---- ask: the talk's step four, word for word. Its Yes is close.yes and its last button pick.eyebrow ----
  'ask.satisfied': { kind: 'quote', text: 'If this were the only thing I accomplished today, would I be satisfied with my day?', ref: '4:40' },
  'ask.leverage': { kind: 'quote', text: 'Will moving this forward make all the other to-dos unimportant or easier to knock off later?', ref: '4:45' },

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

  // ---- the block ----
  'block.fallback': { kind: 'own', text: 'The one thing' },
  'block.holding': { kind: 'own', text: 'holding' },
  'block.left': { kind: 'own', text: 'left in the block' },
  // paraphrases, judgment calls: "no distractions, no social media" (5:22) and "don't freak out and downward spiral" (5:33)
  'block.focus': { kind: 'paraphrase', text: 'No email, no social. Just this.', ref: '5:22' },
  'block.drifted': { kind: 'paraphrase', text: 'You came back. No need to spiral.', ref: '5:33' },
  // own: the talk's block is uninterrupted; the one short pause is the app's rule (BREAKS_PER_BLOCK in src/method.ts)
  'block.pauseHint': { kind: 'own', text: 'One short pause if you must, then back.' },
  'block.paused': { kind: 'own', text: 'Stepped away {min} min. Back within {limit} to keep it one block.' }, // fmt.pausedLine
  'block.onePause': { kind: 'own', text: 'You get one pause per block.' }, // the end of fmt.pausedLine
  'block.back': { kind: 'own', text: 'I\'m back' },
  'block.comeBack': { kind: 'quote', text: 'Gently come back to your one to-do', ref: '5:37' },
  'block.stepAway': { kind: 'own', text: 'Step away briefly' },
  'block.pauseUsed': { kind: 'own', text: 'Your one pause is used.' },
  'block.end': { kind: 'own', text: 'End block' },
  // the notification when a block runs its full length
  'notify.title': { kind: 'own', text: 'Your block is done' },
  'notify.body': { kind: 'own', text: 'Whenever you are ready, close the day.' },

  // ---- close and closed ----
  'close.eyebrow': { kind: 'own', text: 'Close the day' },
  'close.hero': { kind: 'own', text: 'Did you do it?' },
  'close.noItem': { kind: 'own', text: 'Your one thing today.' },
  'close.item': { kind: 'own', text: '“{item}”, your one thing today.' }, // fmt.closeItem
  // fmt.closeCount; `days` is daysWord(n): '1 day' or 'N days'
  'close.count': { kind: 'own', text: '{days} you\'ve done your one thing since you started' },
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

  // ---- your days ----
  'days.hero': { kind: 'own', text: 'Days you did your one thing' },
  'days.empty': { kind: 'own', text: 'Nothing here yet. The first day you answer Yes will appear on this page, with its date and the one thing you did.' },
  'days.only': { kind: 'own', text: 'Only the days you did it are listed. Other days add nothing and need nothing.' },
  'days.earlier': { kind: 'own', text: 'Earlier' },

  // ---- about ----
  // a paraphrase, judgment call: the talk's "an eight step process for maximizing efficacy, which is doing the right
  // thing" (3:50, set against efficiency at 3:44); the three steps after the colon are the app's summary of it
  'about.intro': { kind: 'paraphrase', text: 'Tim Ferriss\'s morning method for efficacy, doing the right thing, rather than efficiency: his eight steps, condensed to three. Name what\'s uncomfortable, pick one thing, protect one block.', ref: '3:50' },
  'about.busy': { kind: 'quote', text: 'Being busy is a form of laziness.', ref: '6:49' },
  'about.method': { kind: 'own', text: 'Method by Tim Ferriss.' },
  'about.independent': { kind: 'own', text: 'An independent app based on Tim Ferriss\'s method. Not affiliated with or endorsed by him.' },
  'about.reminder': { kind: 'own', text: 'Morning reminder' },
  'about.time': { kind: 'own', text: 'Reminder time' },
  'about.off': { kind: 'own', text: 'Off' },
  'about.free': { kind: 'own', text: 'Free and works offline.' },
  // one paragraph each: what stays on the device, what is counted (src/analytics.ts, worker/index.ts), Do Not Track, and
  // the host's own visit count
  'privacy.device': { kind: 'own', text: 'What you write stays on this device and is never sent anywhere.' },
  'privacy.tallies': { kind: 'own', text: 'We keep three anonymous tallies: days started, days finished, and history opened. Each is a plain count plus the country, with no name, number, cookie, or address attached.' },
  'privacy.dnt': { kind: 'own', text: 'If your browser’s Do Not Track setting is on, we keep no tallies at all.' },
  'privacy.host': { kind: 'own', text: 'Our host, Cloudflare, counts page visits without cookies.' },
  // what the reminder control says (reminderStatus in logic.ts); a set reminder is fmt.reminderSet: reminder.set, then
  // how it fires (reminder.trigger with a scheduled trigger, reminder.openOnly without)
  'reminder.set': { kind: 'own', text: 'Reminder set for {time}.' },
  'reminder.trigger': { kind: 'own', text: 'It is scheduled on this device and refreshed each time you open the app.' },
  'reminder.openOnly': { kind: 'own', text: 'It only fires while this app is open.' },
  'reminder.unsupported': { kind: 'own', text: 'Notifications aren\'t available on this device. On iPhone, add to Home Screen first.' },
  'reminder.denied': { kind: 'own', text: 'Notifications are blocked for this site, so no reminder can be set. Allow them in your browser settings.' },
  'reminder.ask': { kind: 'own', text: 'Pick a time and your browser will ask for permission.' },
  'reminder.allowed': { kind: 'own', text: 'Notifications are allowed. Pick a time.' },
  // the morning notification (src/reminder.ts). The body is the talk's steps one and two in short ("make a cup of tea",
  // 4:06; "Email is the mind killer", 4:02), like morning.hero
  'reminder.title': { kind: 'own', text: 'Good morning' },
  'reminder.body': { kind: 'paraphrase', text: 'Make some tea. Email can wait.', ref: '4:06' },
});

export type CopyId = keyof typeof COPY;
export const t = (id: CopyId): string => COPY[id].text;
/** The tags, as logic.ts names them (its Tag type; copy.ts imports nothing, so the names are repeated here). */
export type TagName = 'pushed' | 'risky' | 'anxious';
/** An entry with its {placeholders} filled in one pass (a value is never scanned again, so text a person typed stays as typed). */
export const fill = (id: CopyId, values: Record<string, string | number>): string => t(id).replace(/\{(\w+)\}/g, (_, key: string) => {
  if (!(key in values)) throw new Error(`fill('${id}'): no value for {${key}}`);
  return String(values[key]);
});

// lines with a value in them, built from the entries above
export const fmt = {
  closeItem: (item: string) => fill('close.item', { item }),
  // `days` is daysWord(n): '1 day' or 'N days'
  closeCount: (days: string) => fill('close.count', { days }),
  pickLine: (small: boolean, late: boolean) =>
    `${t(small ? 'pick.small' : 'pick.full')}${late ? `. ${t('pick.late')}` : `, ${t('pick.early')}`} ${t('pick.slide')}`,
  // a count of days, for Close, Your days and the About row: '1 day' or 'N days'
  daysWord: (n: number) => (n === 1 ? '1 day' : `${n} days`),
  daysCount: (days: string) => `${days} since you started`,
  monthLine: (month: string, days: string) => `${month} · ${days}`,
  // the Your days row on About: the count only once there is one, never a zero
  daysLink: (total: number) => (total > 0 ? `${total} ›` : '›'),
  // the progress dots: step `at` (from 1) of `of`
  steps: (at: number, of: number) => `Step ${at} of ${of}`,
  tag: (tag: TagName) => t(`tag.${tag}`),
  pushedTimes: (n: number) => `${t('tag.pushed')} ${n}×`,
  remove: (item: string) => `Remove ${item}`,
  // the notes under the Name input when the text is already listed: gained this step's tag, or had it already
  noteTagged: (tag: string) => fill('name.noteTagged', { tag }),
  noteAlready: (label: string) => fill('name.noteAlready', { label }),
  pausedLine: (awayMin: number, limitMin: number) => `${fill('block.paused', { min: awayMin, limit: limitMin })} ${t('block.onePause')}`,
  reminderSet: (time: string, trigger: boolean) => `${fill('reminder.set', { time })} ${t(trigger ? 'reminder.trigger' : 'reminder.openOnly')}`,
};

// Lines that must be on a screen whenever it shows: src/copy.test.ts renders each screen state and looks for every one.
// Sentences only (a line ending in . ? or !, or of four or more words): a button name like 'Yes' would pass by accident.
const ABOUT = ['about.intro', 'about.busy', 'guise', 'about.method', 'about.independent', 'privacy.device', 'privacy.tallies', 'privacy.dnt', 'privacy.host', 'about.free'] as const;
// About in each state the reminder control can be in: what the control says is the one line that changes
const ABOUT_STATES = {
  aboutUnsupported: [...ABOUT, 'reminder.unsupported'],
  aboutDenied: [...ABOUT, 'reminder.denied'],
  aboutAsk: [...ABOUT, 'reminder.ask'],
  aboutAllowed: [...ABOUT, 'reminder.allowed'],
} as const;
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
  nameFirst: ['name.pushed', 'name.pushed.hint'],
  // leftovers from yesterday replace the step's hint
  nameLeftovers: ['name.pushed', 'name.leftovers'],
  ask: ['ask.satisfied', 'ask.leverage'],
  block: ['block.focus', 'block.pauseHint'],
  blockDrifted: ['block.drifted', 'block.pauseHint'],
  blockPaused: ['block.onePause'],
  blockPauseUsed: ['block.focus', 'block.pauseUsed'],
  daysEmpty: ['days.hero', 'days.empty'],
  days: ['days.hero', 'days.only'],
  ...ABOUT_STATES,
} as const satisfies Record<string, readonly CopyId[]>;
