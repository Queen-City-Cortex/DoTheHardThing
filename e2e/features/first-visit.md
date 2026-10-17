# First-visit onboarding

A brand-new visitor sees one welcome screen at any hour: the promise `Each morning, do the one hard thing you’ve been avoiding.`, three numbered steps, who the method is from with one link to the talk, `Start`, and a one-line assurance. `Start` leads into naming the discomfort. They never see "Welcome back" or "Later start today".

## Sub-features

- `fv-welcome` the new-user welcome at 08:00: eyebrow `Welcome`; h1 `Each morning, do the one hard thing you’ve been avoiding.`; a numbered list of three: `Name what you’re avoiding` / `Write it plainly: three to five, no more.`, `Pick one thing` / `The one that matters most today.`, `Protect one block` / `At least two to three hours, unbroken.` (the talk: [4:11] three to five and no more, [6:05] pick one thing, [5:01] at least two to three hours, [5:22] one uninterrupted block); `Built from Tim Ferriss’s morning method.` with the one link `Watch his short talk` (href `https://x.com/tferriss/status/2110445158206447830`, new tab, `noreferrer`, the same name and URL on About); the `Start` button; under it the small line `Ideally an hour before email or screens.` (the talk's [3:55], "wake up at least an hour before you have to be at a computer screen"), shown at any hour; then `Free · private · works offline` (middle dots, no em dash anywhere). Order top to bottom: Start, hour line, assurance. There is no `Before email` eyebrow here (that belongs to the returning welcomes).
- `fv-welcome-late` the same welcome at 18:57, after the 11:00 late hour.
- `fv-fits` the welcome fits 430, 390, 375 and 320 wide with no overflow, `Start` and the talk link are at least 44px tall, Start, the hour line and the assurance all end inside the screen with no scroll at 320×640, 360×640, 375×667, 390×844 and 430×932 (a compact layout applies under 380px wide or 700px tall; 320×568, the oldest iPhone SE, still scrolls about 65px), and its text meets AA in light and dark (`welcome-v1`).
- `fv-name` `Start` opens step 1 of 3, "What have you been putting off?", with a text input for pushed items and a `Skip` button (it reads `Next` once something is added or typed).
- `fv-back` every Name step has `Back`; on step 1 it returns to Welcome.
- `fv-draft` text typed but not added is added under the current step's tag when you press `Next` (or `Two questions`), and the input is empty on the next step. Only a full list rejects an add: the draft stays, the muted note reads `Five is the limit.`, and Next does not advance.
- `fv-same-answer` one thing can answer several steps: an item has `tags` (any of pushed, risky, anxious). Typing text already on the list (case and spacing ignored) never makes a copy. If it lacks this step's tag it gains it, in place (`That one's already on your list. Marked risky too.`), even with five items listed. If it already has the tag, the note is `That one's already on your list as <label>.`. Either way the draft clears and Next is not blocked. The chip label lists risky, then anxious, then pushed (`risky · anxious · pushed`, `risky · pushed 1×` once carried). The chip colour follows risky, then anxious, then pushed.
- `fv-listed` on steps 2 and 3 the list is a group `Already on your list` under the muted line `Already on your list. Tap one if it fits here too.`. Each row is a toggle button (`aria-pressed`) that is on when the item has this step's tag. Tapping an off row adds the tag; tapping an on row removes it, and an item whose only tag that was leaves the list. Step 1 keeps the plain list with `Remove <item>` (×) buttons and the leftover chips.

## How to get to it (user POV)

- Open `/` in a browser with no saved data.
- Open it after clearing site data, or from a fresh home-screen install.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK.

- **Morning first visit.** Run `vdt journey first-visit`. `expectFirstWelcome` in `drive.mjs` checks everything in `fv-welcome`, and that `I'm ready`, `Welcome back`, `Later start today`, `Before email` and `Start where you are` are absent and the hour line is visible between Start and the assurance.
- **Late first visit.** Run `vdt journey first-visit-late`. Same assertions at 18:57.
- **Layout and schemes.** Run `vdt journey welcome-v1` (touch emulation, 390×844). `fv-fits` at four widths, screenshots at 390 and 320; `Start` then `Back` returns to the same welcome; About from the welcome and `Done` back; after a full day, 08:00 the next day is the old returning welcome (`Make some tea.`, `I'm ready`, no `Start`, no list).
- **Start onboarding.** This is part of both journeys: choose `Start` (the regex `READY` in `drive.mjs` also matches `I'm ready`, which every later welcome uses). Heading `What have you been putting off?`, `Step 1 of 3`, a textbox with that name, and `Skip`. `Back` returns to the welcome heading.
- **Pending draft.** Run `vdt journey name-pending-draft`. Type `Call mom` on step 1 and press `Next` without `Add`: the risky step lists `Call mom` as an unpressed `pushed` row, and the textbox is empty. Add `Ask for the raise`, then type ` ask for the RAISE` and `Add`: `That one's already on your list as risky.`, the textbox is empty, still two rows. Type `call mom` and `Add`: `That one's already on your list. Marked risky too.`, its row is pressed and reads `risky · pushed`. Type `Call mom` and press `Next`: the anxious step opens. Storage holds `Call mom` `["pushed","risky"]` and `Ask for the raise` `["risky"]`.
- **Same answer on two steps.** Run `vdt journey same-answer-two-steps`. Step 1: add `Talking to leads`, `Next`. Step 2: type it again, `Add`: no error, the note `That one's already on your list. Marked risky too.`, one row `risky · pushed`, pressed. Step 3: the row is unpressed; tapping it gives `risky · anxious · pushed`. Typing it again shows `That one's already on your list as risky · anxious · pushed.`. Ask has one step (`Step 1 of 1`) titled with that label; Pick lists it once. Storage holds one item with `tags: ["pushed","risky","anxious"]` and no `tag` key.
- **Proof.** `01-welcome.png` and `.aria.txt`, `02-ready.*` and `03-back-to-welcome.*` in each first-visit dir; `pushed-draft.*`, `risky-has-draft.*`, `duplicate-same-tag.*`, `duplicate-other-tag.*`, `duplicate-then-next.*` and `localStorage.json` for the draft journey; `risky-same-text.*`, `anxious-tap.*`, `anxious-already.*`, `ask-once.*`, `pick-once.*` and `localStorage.json` for `same-answer-two-steps`.

## Gotchas

- The `Ideally an hour before email or screens.` line is on the first-visit welcome at any hour (restored under Start) and on returning morning welcomes (returning-user.md); the late bad-day welcome hides it after 11:00.
- The welcome is decided once at load, from history excluding today. Reloading on day one still shows the new-user welcome (by design).
- A new user (no leftovers) keeps the step-1 hint `The thing you keep moving to tomorrow. Write it plainly.` and the placeholder `Write it plainly`. Returning users with leftovers see them as `pushed N×` toggle buttons on step 1, above the same input, with the hint `From yesterday, still open. Tap what still matters. …` and the placeholder `Or write something new` (see [returning-user.md](./returning-user.md)).
- `Back` drops an unadded draft rather than carrying it to another step's tag.
- Before multi-tag, typing the same text on a later step was rejected with `That is already on the list.`. That string is gone; a journey that still finds it is a regression.
- On steps 2 and 3 there are no `listitem`s: the rows are buttons in the `Already on your list` group. `row(p, text)` in `drive.mjs` matches either form.
- Items stored with an old single `tag` load as `tags: [tag]` (`src/decode.ts`); the storage key is `one-thing:v3` (a missing v3 is migrated from `one-thing:v2`, which is left in place).
- The service worker is not installed on the first load of a fresh context. Offline behavior is not covered here.
