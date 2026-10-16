# Block timer

During a block, the countdown runs from stored timestamps. "End block" or a step-away of 10 minutes or more ends it and moves to the close screen. However and whenever it ended, Close asks the same question, `Did you do it?` (see [close-day.md](./close-day.md)); the block's length is never judged on screen.

## Sub-features

- `bt-countdown` decreases with the clock (`1:55:00` after 5 minutes).
- `bt-end` "End block" goes to Close: `Did you do it?`, `“<item>”, your one thing today.`, Yes / Not today with nothing chosen and `Close today` disabled. Storage has `endReason: "stopped"` and `didIt: null`.
- `bt-broken` "Step away briefly" shows `holding`; after 11 minutes the block ends (`endReason: "broken"`) and the same Close shows, with no message about the break.
- `bt-one-break` each block allows one step-away of up to 10 minutes. Before it, the line under the timer ends `One short pause if you must, then back.`; while away it reads `Stepped away N min. Back within 10 to keep it one block. You get one pause per block.` (copy only: the rule, 10 minutes ends the block, is unchanged) After `I'm back`, `Step away briefly` is gone and `Your one pause is used.` shows; the timer keeps counting and storage has `breaks: 1`.
- `bt-midnight` a block belongs to the day it started. Past midnight it keeps running on that day, whether the app stays open or is reloaded, and a stale pause still breaks it. When it ends, Close shows for that item; once answered, `Close today` goes to the new day's welcome.

## How to get to it (user POV)

- Start a block from Pick. A reload during a block returns to the timer.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK.

- **Countdown and End.** Run `vdt journey start-end-block`. After `clock.runFor('05:00')` the timer shows `1:55:00`. `End block` leads to Close (`expectClose`), and `localStorage.json` has `endReason: "stopped"`, `didIt: null`.
- **Short block, Yes counts.** Run `vdt journey short-block-yes-counts`. End after 5 min, Close asks, `Yes` gives `That's your first one. Nothing else to add.` and `Your first day. It starts here.`; `Close today` shows `One thing, done.`; storage `didIt: true`, `doneText: "Ask for the raise"`, `closed: true`. Next morning (`setSystemTime(2026-10-15 07:30)`, reload, `I'm ready`) step 1 offers nothing: the item is done.
- **Long step-away.** Run `vdt journey step-away-broken`. `Step away briefly` shows `holding`, then `fastForward('11:00')`, then `I'm back` if it's still shown. Close asks the question with no break message; storage `endReason: "broken"`.
- **One break per block.** Run `vdt journey one-break-per-block`. `runFor('05:00')`, `Step away briefly`, `runFor('03:00')`, `I'm back`: no `Step away briefly` button, `Your one pause is used.`, timer `1:55:00`, then `1:54:00` one minute later.
- **Across midnight, app open.** Run `vdt journey block-across-midnight`. Start at 23:30 with a 2h block, then `runFor('01:00:00')`: the timer still shows `1:00:00` for `Ask for the raise`. One more hour: Close asks; `Yes` and `Close today` lead to `Make some tea.`. Storage has `2026-10-14` closed with `didIt: true`, plus a `2026-10-15` record.
- **Across midnight, reloaded.** Run `vdt journey block-reload-after-midnight`. `setSystemTime(2026-10-15 00:10)` and reload: the timer for `Ask for the raise` (`1:20:00`). Then `02:00` and reload: Close asks for that item.
- **Proof.** `block-running.*`, `end-block.*` and `localStorage.json` in `start-end-block`; `close-asks.*`, `answer-yes.*`, `close-today.*` and `next-morning-done-item-gone.*` in `short-block-yes-counts`; `step-away.*` and `back-after-11min.*` in `step-away-broken`; `back-after-3min.*`, `still-counting.*` and `localStorage.json` in `one-break-per-block`; `still-running-after-midnight.*`, `new-day-welcome.*` and `localStorage.json` in `block-across-midnight`; `reload-0010.*` and `reload-0200.*` in `block-reload-after-midnight`.

## Gotchas

- Both end cases used to leave the user stuck on the timer. A FAIL here means a regression.
- With the clock paused, the timer reads exactly `2:00:00` at start. Real-time drift only appears if `pauseAt` is removed.
- Only one step-away per block. A journey that steps away twice will not find the button the second time. Blocks stored before `breaks` existed count any `pausedMs > 0` as the break already used.
- The settle effect can move to Close before `I'm back` is clicked. The journey tolerates either.
- Focus time still decides `gotBlock` internally (2h+ of focus, the one break excluded), but nothing shown, counted or carried reads it. The old Close verdict (`a start, not a full block`) must never appear.
