// The REQUIRED lines of src/copy.ts: the copy ids each screen state must show. Used by src/copy/required-lines.test.ts and screens.testlib.ts.
import type { CopyId } from '../copy';

// Lines that must be on a screen whenever it shows: src/copy/required-lines.test.ts renders each screen state and looks for every one.
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
