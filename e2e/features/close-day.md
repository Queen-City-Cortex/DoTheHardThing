# Close the day

However the block ended (ran out, ended early, broken by a long step-away, a 1h block or a 3h one), Close asks one plain question: "Did you do it?". The user answers `Yes` or `Not today`. The answer is theirs: the block never answers for them, and nothing on the screen judges its length. A Yes adds one day to a gentle count that only goes up; Not today adds nothing and takes nothing. There is no streak, no zero, no quote and no verdict about the block. After `Close today` the day reads "One thing, done." or "Tomorrow is a fresh page." and stays closed across reloads.

## Sub-features

- `cd-question` eyebrow `Close the day`, heading `Did you do it?`, muted `“<item>”, your one thing today.` (curly quotes; `Your one thing today.` if no item is chosen), then `Yes` / `Not today` with nothing chosen. `Close today` is disabled until one is tapped. No blockquote, no `The full block ran.`, no block minutes.
- `cd-never-verdict` the strings `a start, not a full block` and `got its block` never appear anywhere. Every Close journey asserts that (`noVerdict` in `drive.mjs`).
- `cd-answer` `Yes` stores `didIt: true` and `doneText` = the chosen item's text; `Not today` stores `didIt: false`, `doneText: null`. Either can be switched before closing; the chosen one carries the `on` class.
- `cd-lines` after an answer: an italic note, a rule, the count line, and a `See your days` link button. The copy comes from `closeLines` in `src/logic.ts`:
  - first Yes ever: note `That's your first one. Nothing else to add.`, line `Your first day. It starts here.` (no number at all)
  - later Yes: `Good. That's the whole thing for today.`, `N days you've done your one thing since you started` (N in bold)
  - Not today: `That's alright. It'll still be there tomorrow.`, then `1 day you've done…` / `N days you've done…`, or no count line at all while nothing is done yet
- `cd-count-now` the count is every done day in the store with the open day as it is right now, so switching Yes / Not today moves it by one at once.
- `cd-no-streaks` Closed after `Not today` adds `No streaks. If you slip, just come back.` (the talk's [5:33] gentle come-back, as product copy); after Yes it is absent. No number either way. Asserted in `close-not-today-count` (Yes day: absent; the Not today day: present).
- `cd-leftovers` a Yes takes the chosen item off tomorrow's leftovers, whatever the block length (a 5-minute block too). Not today, or a day never answered, keeps it (`pushed 1×` the next morning). No/No items still drop.
- `cd-close` `Close today` shows eyebrow `Today is closed` and `One thing, done.` (Yes) or `Tomorrow is a fresh page.` (Not today), the line `Let the rest of the urgent but less important stuff slide. It'll still be there tomorrow.`, and `See your days`.
- `cd-persist` after a reload, the closed screen remains.
- `cd-start-over` `Start today over` asks first, inline: `Start over? Today's list and block will be cleared.` with `Yes, start over` and `Keep today`. `Keep today` changes nothing. `Yes, start over` replaces today's record with a fresh one (answer included), so the count loses only today's own Yes; every earlier day stays counted and listed.
- `cd-notify` when a block completes, the notification reads `Your block is done` / `Whenever you are ready, close the day.` (not verified by vdt, see Gotchas).

## How to get to it (user POV)

- Let a block run out, or end it; Close opens. Answer, then `Close today`. `See your days` opens [history](./history.md).

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK.

- **Complete, answer, close.** Run `vdt journey close-day`. `clock.runFor('02:00:01')`: the question with nothing chosen (`expectClose`). `Yes`: the first-Yes note and `Your first day. It starts here.`. `Close today`: `One thing, done.`. Reload: `Today is closed`, `See your days`. Storage: `closed: true`, `didIt: true`, `doneText: "Ask for the raise"`.
- **Short block, Yes counts.** Run `vdt journey short-block-yes-counts`. End after 5 min, the same question, `Yes` gives the first-day line, `Close today`. Next morning `Ask for the raise` is not offered.
- **Short block, Not today keeps the item.** Run `vdt journey small-block-modified` (a completed 1h block; see [returning-user.md](./returning-user.md)). Not today shows no count line on a first day; the item comes back as `risky · pushed 1×`.
- **First Yes.** Folded into `history-from-close-and-about` (see [history.md](./history.md)); the old `close-first-yes` journey was a strict subset of it. After Yes the main area has no digit at all (checked at its `answer-yes` step), `See your days` lists `Wed 14  Ask for the raise`, and `Done` returns to Close with Yes still on.
- **Not today with a count.** Run `vdt journey close-not-today-count`. Day 1: Not today (no count line, no digit), switch to Yes, back to Not today, Yes, close. Day 2: Not today shows `1 day you've done your one thing since you started`.
- **Count only grows.** Run `vdt journey count-grows` (in [history.md](./history.md)).
- **Start over.** Run `vdt journey start-over-confirm` (inline confirm; `Keep today` changes nothing; `Yes, start over` gives Welcome and an empty open record) and `vdt journey start-over-count` (day 1 Yes, day 2 Yes `2 days…`, start over: About shows `Your days 1 ›`, history lists only Wed 14, stored 2026-10-14 untouched).
- **Yes clears the item.** Run `vdt journey yes-clears-item`. Like close-day, with `Tax letter` answered Yes/No so it carries: next morning `Tax letter … anxious · pushed 1×` and no `Ask for the raise`.
- **Proof.** `block-complete.*`, `answer-yes.*`, `close.*`, `reload-still-closed.*` and `localStorage.json` in close-day; `answer-yes.*`, `close-to-days.*` and `done-to-close.*` in history-from-close-and-about; `first-not-today.*`, `answer-not-today.*` in close-not-today-count; `ask-start-over.*`, `keep-today.*`, `yes-start-over.*`; `history-keeps-earlier.*` in start-over-count.

## Gotchas

- `gotBlock` is still stored (the block's own outcome, from `autoGotBlock`) but nothing shown, counted or carried reads it. Don't assert on it as user behavior.
- Nothing is pre-selected, even after a full 2h block: the old auto-Yes is gone.
- The note and count copy use a straight apostrophe (`you've`, `That's`), as `closeLines` returns it.
- The completion notification needs Notification permission. Headless denies it, so the notification is not verified.
- There is no `window.confirm`; the confirmation is inline. Starting over also clears the bad-day "shorter block" toggle.
- An ended block left unanswered keeps its day open past midnight (it is offered again after a reload); once answered, even without `Close today`, a reload on a later date leaves it as history.
- `runFor` takes `hh:mm:ss` with two-digit hours (`02:00:01`).
