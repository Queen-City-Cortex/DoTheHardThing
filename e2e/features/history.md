# Your days (history)

A quiet list of the days the user did their one thing. Only done days (`didIt: true`) are listed or counted; a missed day, a Not today or an unanswered day leaves no row and needs nothing. There is no streak, no calendar of gaps and never a zero. The count only goes up: days that fall out of the 120-day stored window are folded into a per-month archive, so the total and the month counts stay.

## Sub-features

- `hi-list` eyebrow `Your days`, heading `Days you did your one thing`, muted `Only the days you did it are listed. Other days add nothing and need nothing.`, then the tally `N days since you started` (`1 day since you started`), N in bold.
- `hi-month` the current month: label `<Month> · N days`, then a list (accessible name = the month) of `Wed 14   Ask for the raise` rows, newest first. Omitted when the month has none.
- `hi-earlier` label `Earlier` and a list (accessible name `Earlier`) of earlier months with their counts (`October   3 days`), newest first; a month with nothing is never listed. A month from another year shows its year (`December 2025`).
- `hi-empty` with nothing done yet: the same eyebrow and heading, muted `Nothing here yet. The first day you answer Yes will appear on this page, with its date and the one thing you did.`, no tally, no lists, no digit, just `Back`.
- `hi-now` today's answer counts as soon as it is tapped on Close, before `Close today`.
- `hi-entries` three ways in: `See your days` on Close (after an answer) and on the closed screen, and the `Your days` row in About (after the quotes, before the reminder rule), which reads `Your days  N ›`, or just `Your days  ›` while nothing is done. Its accessible name is `Your days`.
- `hi-back` the header shows `Done` (as on About) and the page ends with a `Back` button; both go back one step. About → Your days → Done returns to About, and About → Done to where About was opened. If the date rolls over while About or Your days is open, Done goes to the new day's screen.
- `hi-two-tabs` a tab left open (stale) never overwrites a day another tab closed; when it is focused again it shows that closed day.

## How to get to it (user POV)

- Answer Close, then `See your days`; or close the day, then `See your days`; or `About` in the header, then `Your days`.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK. History is built through the UI, one ritual day at a time (`ritualDay` in `e2e/drive/actions.mjs`), except `migrate-v2`.

- **Empty.** Run `vdt journey history-empty`. A brand-new profile: About's row reads `Your days ›` with no digit; the page shows the empty copy, no `since you started`, no list, no digit in the main area. `Back` returns to About, `Done` to Welcome.
- **Count grows, history lists done days only.** Run `vdt journey count-grows`. 14 Oct Yes (`Your first day. It starts here.`), 15 Oct Not today (`1 day you've done…`), 16 Oct Yes (`2 days…`), 17 Oct Not today keeps `2 days…`, Yes gives `3 days…`. History: `3 days since you started`, `October · 3 days`, rows `Sat 17`, `Fri 16`, `Wed 14`; no `Thu 15` and no `Call the landlord`. Then `setSystemTime(2026-11-02 08:00)`: About shows `Your days 3 ›`; history has no November block and `Earlier` lists `October  3 days`.
- **Ways in and back.** Run `vdt journey history-from-close-and-about`. Close → See your days → Done → Close (Yes still on); See your days → Back → Close; Close today; See your days → Done → closed screen; About (`Your days 1 ›`) → Your days → Done → About; Your days → Back → About; Done → closed screen.
- **Start over.** See `start-over-count` in [close-day.md](./close-day.md).
- **Migration (the only seeded journey).** Run `vdt journey migrate-v2`. Before the first load, an init script writes `one-thing:v2`: 12 Oct `gotBlock: true` (chosen `Ask for the raise`), 13 Oct `gotBlock: false` (`Call the landlord`), both items with an old single `tag: "risky"`. After load: `Make some tea.`, About `Your days 1 ›`, history `1 day since you started` with only `Mon 12  Ask for the raise`; step 1 offers `Call the landlord  risky · pushed 1×`. Storage: `one-thing:v3` holds 12 Oct `didIt: true`, `doneText`, 13 Oct `didIt: null`, items with `tags: ["risky"]` and no `tag`; `one-thing:v2` is unchanged.
- **Two tabs.** Run `vdt journey two-tabs`. Tab B opens first and stays on Welcome; tab A (same context, same clock) does the whole day with Yes. Tab B (still on the first-ever Welcome) then taps `Start` and adds `Call mom` (its save): the stored 14 Oct is still A's (`didIt: true`, closed, no `Call mom`). A real `focus` event on B shows `One thing, done.`, and B's history lists `Wed 14`.
- **Proof.** `history-october.*`, `november-about.*`, `november-history.*` in count-grows; `your-days-empty.*`; each step of history-from-close-and-about; `history.*`, `leftover-single-tag.*` and `localStorage.json` in migrate-v2; `tab-b-adds-item.*`, `tab-b-focus.*` in two-tabs.

## Gotchas

- Zero-hiding is deliberate: no `0` anywhere (About row, tally, month labels). `expectHistory` asserts no standalone `0` in the main area.
- The store keeps 120 days (`MAX_DAYS`); older done days live only as month counts in `archive`. A month that is partly archived shows its full count under Earlier, but only stored days can be listed by date. The current month always fits in the window.
- Dates are labelled from their `YYYY-MM-DD` parts (`dayLabel`, `monthLabel`), never shifted by the time zone.
- "This month" is the real current date's month, not the open day's. A day carried past midnight into a new month is listed under its own month.
- History reads the store with the open day substituted, so an answered but unclosed day already shows.
- A day with Yes but no chosen item lists as `Your one thing`.
- `migrate-v2` is the one exception to "never seed storage". The init script only writes v2 if it is absent, so reloads keep the same seed.
- Two tabs: the open day is normally this tab's own in a merge. It gives way only when the stored copy is closed, this tab's is not, and this tab's record is not newer (`supersedes` in `src/logic.ts`). Starting today over makes a newer record, so it is never undone by the merge.
