# Returning user and bad days

A user with real history gets "Make some tea." on a normal morning. On a late start (11:00 or later) or after missed days they get "Welcome back. No catching up needed." with the shorter-block toggle. Yesterday's open items are offered on step 1 with their original tags and a pushed count, but nothing comes along unless tapped. A one thing answered Yes is done and not offered; after Not today (or no answer) it is. Items answered No/No were set aside and are not offered; items never answered (an abandoned day) are. Visits where nothing was written don't count as history.

## Sub-features

- `ru-late` opening the next day at 14:00 shows `Later start today.` and the checkbox `Try a shorter block today (1 to 2h). A modified practice; the full block is two to three hours.`
- `ru-late-cutoffs` the two late cutoffs as they are today (`LATE_CUTOFFS` in `src/method.ts`, product question Q1): a returning Welcome at 10:59 is the morning one (`Make some tea.`, eyebrow `Before email`, the hour line); at 11:00 and 11:30 it is the late one (`Later start today.`, eyebrow `Start where you are`, no hour line). Pick at 11:30 still shows its morning line (`…unbroken, first thing, before the day gets loud.…`); from 12:00 its late line (`…unbroken. First thing is best, but now works too.…`). Both lines come from `fmt.pickLine`.
- `ru-small` with the toggle on, Pick offers `1h`/`1½h`/`2h` and shows `A shorter block is a modified practice. The full block is two to three hours.` When the 1h block completes, Close asks `Did you do it?` like any other block; Not today keeps the item for the next day.
- `ru-step0` when leftovers exist, step 1's hint reads `From yesterday, still open. Tap what still matters. The rest stays behind, and nothing comes along unless you choose it.` and the textbox placeholder is `Or write something new` (otherwise `Write it plainly`). Each leftover is a toggle button (`aria-pressed`), none pressed at first, and the list below is empty: the primary button reads `Skip` until something is on today's list, then `Next`. Tapping a pressed leftover takes it off again. A new user with no leftovers sees the usual step 1.
- `ru-leftovers` the leftovers are labelled by all their original tags: `risky · pushed 1×`, `anxious · pushed 1×`, `risky · anxious · pushed 1×`, or `pushed 1×` for a pushed item. Tapping one adds it with those tags and the count kept. No/No items and a one thing answered Yes are not offered.
- `ru-missed` Mon ritual, an empty peek on Tue, back Thu: `It’s been a few days.`, and Monday's items are offered.
- `ru-morning-line` a returning user on a normal morning (08:00 the next day) sees `Make some tea.`, the hour-before line (`Ideally an hour before email or screens.`) and `Email can wait; it's the mind killer.`, eyebrow `Before email`, and no `Pen and paper`.
- `ru-peek` an empty evening visit followed by the next morning is still a first visit.
- `ru-midnight` an app left open past midnight moves to the new day (checked on `visibilitychange`, window focus and every 60 s). A closed day, or one with no block, rolls over to today's record or a fresh day. A day whose block is running or on Close keeps its date until `Close today`, which then goes straight to the new day's welcome (see `bt-midnight` in [block-timer.md](./block-timer.md)).
- `ru-carried` on load, the most recent earlier day (yesterday only) stays open if it is not closed and its block is still running (after settling) or ended with "Did you do it?" not answered yet (`didIt: null`). Otherwise today's record, or a new day.
- History, leftovers and the bad-day check are measured from the open day's date, so the open day never counts as its own history.

## How to get to it (user POV)

- Use the app on one day, then open it again on a later day or at a later hour.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK. History is created by the journey itself through the UI.

- **Late return.** Run `vdt journey returning-late`. Day 1 at 07:30: ritual, `End block`, `Not today`, `Close today`. Then `setSystemTime(2026-10-15 14:00)` and reload. You see the `Welcome back…` heading, `Later start today.`, and the checkbox `/shorter block.*modified practice/`. `I'm ready` shows the step-1 leftover hint, `Ask for the raise … risky · pushed 1×`, and the textbox with placeholder `Or write something new`.
- **Bring in only what you tap.** Run `vdt journey step0-bring-in`. Day 1: `Tax letter` (pushed, Yes/No), `Ask for the raise` (risky, Yes/Yes, the one thing), `Email the school` (anxious, No/Yes); end the block, `Not today`, close. Day 2: three unpressed leftovers, no list items, `Skip`. Tap `Tax letter`: pressed, listed, `Next`. Tap `Email the school` twice: back out. `Next`: the risky step's `Already on your list` group has only `Tax letter`; storage for 2026-10-15 holds only `Tax letter` (`pushedCount: 1`).
- **Tag kept, No/No dropped.** Run `vdt journey carryover-keeps-tag-drops-noyes`. Day 1 at 07:30: `Ask for the raise` (risky, Yes/Yes), `Tax letter` (anxious, Yes/No), `Old chore` (anxious, No/No, absent from Pick). Start `Ask for the raise`, end it after 5 min, `Not today`, `Close today`. Day 2 at 07:30: the step-1 leftovers are `Ask for the raise` (contains `risky` and `pushed 1×`) and `Tax letter` (contains `anxious`), with no `Old chore`. Tapping the raise lists it as `risky · pushed 1×`, and storage for 2026-10-15 holds it with `tags: ["risky"]` and `pushedCount: 1`.
- **Yes clears the item.** See `yes-clears-item` in [close-day.md](./close-day.md). Like `close-day` (Yes), but `Tax letter` is answered Yes/No so it carries. Next morning it shows `Tax letter … anxious · pushed 1×` and `Ask for the raise` is gone.
- **Shorter block.** Run `vdt journey small-block-modified`. Day 1 at 07:30: ritual up to Pick only. Day 2 at 14:00: check the shorter-block toggle, run the ritual again; Pick shows the modified-practice line and a `2h` radio. Choose `1h` (timer `1:00:00`), `runFor('01:00:01')`: Close asks `Did you do it?`; `Not today` shows its note and no count line (nothing done yet). `Close today` shows `Tomorrow is a fresh page.`; storage for 2026-10-15 has `didIt: false`, `targetMin: 60`, `endReason: "complete"`. Day 3 at 08:00: `Ask for the raise … risky · pushed 1×` on step 1.
- **The late cutoffs.** Run `vdt journey late-cutoffs`. Day 1 to Pick at 07:30. Day 2 at 10:59: `Make some tea.` with the morning framing; `I'm ready` and add `Call mom`. Day 3 at 11:00: `Later start today.`, late framing; `I'm ready` and add `Call dad`. Day 4 at 11:30: `Later start today.` again (the day before has content, so it is a late start, not missed days), late framing; the ritual to Pick shows the morning Pick line and not the late one; `runFor('30:00')` to 12:00 and choosing the item shows the late line and not the morning one.
- **Morning line for a returning user.** Run `vdt journey welcome-hour-line`. Day 1 to Pick at 07:30, then 08:00 the next day: the checks in `ru-morning-line`.
- **Missed days.** Run `vdt journey missed-days`. Covers the Mon, Tue-peek and Thu sequence above.
- **Peek visit.** Run `vdt journey peek-then-return`. Shows the first-visit welcome (`Each morning, do the one hard thing you’ve been avoiding.`, `Start`) both evenings.
- **Midnight.** Run `vdt journey midnight-rollover`. 23:30, then `End block`, `Not today` and `Close today` (`Today is closed`), then `runFor('02:00:00')` and `visibilitychange`. It expects `Today is closed` to be gone (the new day's welcome shows).
- **Proof.** `day2-late.*` and `leftovers.*`; `step0-offered.*`, `tap-tax-letter.*`, `tap-email-twice.*` and `next-step-lists-one.*` in `step0-bring-in`; `next-morning-chips.*` and `bring-in-raise.*` in `carryover-keeps-tag-drops-noyes`; `toggle-shorter.*`, `close-asks.*`, `answer-not-today.*` and `next-morning-leftover.*` in `small-block-modified`; `thu-welcome-back.*` and `mon-leftovers.*`; `1059-morning.*`, `1100-late.*`, `1130-pick-morning-line.*` and `1200-pick-late-line.*` in late-cutoffs; `next-morning.*`; `after-midnight.*`.

## Gotchas

- A day counts as history only with at least one item or a block (`hasContent`). A peek day saves an empty record that is ignored.
- `missedDays` counts from the last day with content. One missed day still says "a few days".
- The Welcome late cutoff is 11:00, but the Pick copy uses 12:00 (product question Q1; `late-cutoffs` asserts both as they are today, so deciding Q1 means changing that journey too).
- "Start today over" always starts the real current date.
- A block that ended and was answered (Yes or Not today) but never closed keeps its day while the app stays open. After a reload on a later date it is left as history and today opens. An ended block with no answer is offered again, even a short one.
- Leftovers come only from the most recent earlier day with content, and are never added to today on their own. The hint says `From yesterday` even when that day was several days ago.
- Travel and timezone changes are not covered. Set `timezoneId` per context if you add one.
