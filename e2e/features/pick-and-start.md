# Pick and start

After naming items, the user answers two yes/no questions per item, sees only items with at least one yes on Pick, chooses one and a duration, and starts the block.

## Sub-features

- `ps-name` goes through step 1 (pushed: `Skip`, or add items then `Next`), then adds risky and anxious items with `Add`; the list shows each with its tag on every step.
- `ps-ask` answers the satisfied and leverage questions per item; `Next`, then `Pick one`.
- `ps-filter` hides No/No items from Pick.
- `ps-order` Pick lists items tagged risky (rejection or conflict, alone or among other tags) first, then everything else in the order written. Pushed count does not rank, and anxious is not forced last (`pickOrder`, from the talk at 4:26). Ask goes in guided order: by an item's earliest tag (pushed, risky, anxious), so a pushed + risky item sits with the pushed ones.
- `ps-pushed-label` tag chips (step 1 leftovers, the Name list, Ask, Pick) use `tagLabel(tags, pushedCount)`: risky and anxious first, then `pushed` (never `pushed 0×`), or `pushed N×` once carried. Examples: `pushed`, `risky`, `risky · pushed`, `risky · anxious · pushed`, `pushed 1×`, `risky · pushed 1×`. An item named on two or three steps appears once, with the combined label.
- `ps-choice` keeps `Start the block` disabled until a listed item is chosen.
- `ps-start` starts a block of the chosen length; the timer shows `2:00:00`.
- `ps-talk-copy` the talk's own words are on Name (the risky hint `Most important usually means most uncomfortable, very often with some chance of rejection or conflict.`), Ask (both questions word for word), `Nothing got a yes.` (the `Look again` path, a `Tim Ferriss` quote), Pick (`With ten important things, nothing important gets done. So pick one.`) and About (two quotes). Close quotes nothing.
- `ps-block-copy` the block length is stated as the talk does ([5:01], [5:17]): Pick's line reads `At least two to three hours, unbroken, first thing, before the day gets loud. Let the rest slide; it'll still be there tomorrow.` (from 12:00: `…unbroken. First thing is best, but now works too.…`; with the shorter-block toggle on it starts `One unbroken block`, since that block is a modified practice). The anxious Name step's hint uses his words, `Whatever else makes you most anxious or uncomfortable.` ([4:16]); `chest` appears nowhere. The block screen says `No email, no social. Just this. One short pause if you must, then back.`, and the pause behaves as before (a 9-minute step-away does not end the block).
- `ps-small` with the bad-day shorter-block toggle on, the options are `1h`, `1½h` and `2h` (default `1½h`) and a muted line reads `A shorter block is a modified practice. The full block is two to three hours.` Whatever the length, Close asks the same `Did you do it?` (see [close-day.md](./close-day.md)).

## How to get to it (user POV)

- Welcome, then `Start` (first visit) or `I'm ready` (every later welcome), then the Name steps, then `Two questions`, then the Ask steps, then `Pick one`.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK, and the journey starts on a fresh context at 07:30.

- **Name and ask.** This is `throughToPick` inside every block journey. On step 1 it expects `What have you been putting off?`, `Step 1 of 3` and the textbox, adds any `pushed` option items, then presses `Skip` (or `Next`). It adds `Ask for the raise` (risky) and `Tax letter` (anxious), answers Yes/Yes on the first and No/No on the rest (override with `answers: [[sat, lev], …]` in guided order). Pick heading `Which one thing gets today?`.
- **Order.** Run `vdt journey pick-order-risky-first`. First visit: `Tax letter` added on step 1 (pushed, `Next`), `Ask for the raise` on the risky step, no anxious items, both Yes/Yes. On Pick the first choice matches `/Ask for the raise/` and the second `/Tax letter/`.
- **Filter and choice.** Run `vdt journey pick-requires-choice`. `Call the landlord` (No/No) is absent, Start is disabled, choosing `Ask for the raise` enables it.
- **Pushed label.** Run `vdt journey pushed-zero-label`. On a first visit, add `Call mom` on step 1 and answer it Yes/Yes. On Pick the button matching `/Call mom/` contains `pushed` and does not contain `0×`.
- **The talk's words.** Run `vdt journey copy-from-the-talk`. Skip step 1, add `Ask for the raise` as risky, answer No/No: `Nothing got a yes.` with the blockquote; `Look again`, Yes/Yes, Pick shows its hint (and not the risky-step line), run a 2h block: Close has no quote and no `Anything left comes forward tomorrow.`; About quotes Tim Ferriss twice and has no `No streaks`.
- **Review copy.** Run `vdt journey review-copy`. First visit, one risky item, one 2h block with a 9-minute pause: every line in `ps-block-copy`, the dots as `img` `Step 1 of 3`, no em dash on any screen, and About's lines (see [analytics.md](./analytics.md), `an-privacy-note`; `his eight steps, condensed to three`; `An independent app based on Tim Ferriss's method. Not affiliated with or endorsed by him.`; exactly one link, `Watch his short talk`, and no `original post`).
- **Start.** See `start-end-block` in [block-timer.md](./block-timer.md). After choosing the item and the `2h` radio, `Start the block` shows a timer containing `2:00:00`.
- **Proof.** `03-pushed.*`, `06-ask.*` and `07-pick.*`, plus `pick-list.*`, `pick-order.*` and `pick-pushed-label.*`.

## Gotchas

- Pick has no Back button, so a chosen item can't be invalidated through the UI from Pick. The stale-choice guard is covered by unit tests, not by a journey.
- Choosing a Pick item is a button whose name includes its tag (for example `Ask for the raise risky`). Match it with a regex.
- The shorter-block options (60/90/120) and the modified-practice line only appear when the bad-day toggle is checked (`small-block-modified` in [returning-user.md](./returning-user.md) drives them). Normal options are 2h/2½h/3h; `BLOCK_MAX` is 180.
