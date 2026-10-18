# Resilience: offline, small phones, blocked storage, odd input

The app is offline-first and keeps everything on the device, so it has to cope when the network, the storage, the screen or the typed text is not what the happy path assumes. This file covers those conditions. Nothing here is a feature the user opens; each is a state the app must survive.

## Sub-features

- `rs-offline` after one online visit the service worker has precached the app shell (`sw.js`, 12 entries today including the 3 self-hosted fonts; `npm run check:dist` fails if a file the page loads is missing from the list) and controls the page (the second load, not the first). With the network off, a reload shows the app, a whole day can be worked, a running block survives an offline reload (the timer is recomputed from stored timestamps), and the closed day survives another offline reload.
- `rs-small-phone` at 375×667 with touch emulation (iPhone SE class) a whole day, including a long item that wraps over several lines, never scrolls sideways, and Close today is reachable (the page scrolls; the action is not pinned off-screen).
- `rs-reload-mid-naming` the app keeps no step memory. A reload during the Name steps returns to Welcome; `I'm ready` opens step 1 with the items already added still listed. An unadded draft is lost. The same holds during Ask. A known gap, registered as reload-mid-flow-restarts-step in [../known-gaps.json](../known-gaps.json) (the owner decides; a rough edge on iPhone, which discards home-screen apps).
- `rs-storage-blocked` when `localStorage.setItem` throws (private mode, full storage) the muted note `Progress will not be saved on this device.` shows; nothing throws, and the day can still be worked in memory.
- `rs-no-notification` with no `Notification` API (iPhone Safari outside the home-screen app) About says `Notifications aren't available on this device. On iPhone, add to Home Screen first.` and shows no `Reminder time` input.
- `rs-hostile-text` items are plain text: markup (`<img … onerror=…>`), quotes, emoji and CJK are shown literally and stored unchanged; a blank or whitespace-only draft keeps `Add` disabled; nothing runs.
- `rs-long-text` a pasted URL (65 and 72 characters, no break opportunity) as an item wraps on every screen that shows item text (both Name steps, Ask, Pick, Block heading, Close, Your days, step 1 bring-in, and its picked state) at 320, 375, 390 and 430 wide: no sideways scroll, no box or line of text outside the page's padded column, no element clipping its content. Driven by `long-url-widths` (Driving below); screenshots at 320 and 375 per screen. Measure with `documentElement.clientWidth`, not `innerWidth`: a touch browser widens `innerWidth` to fit overflowing content and hides the overflow.
- `rs-contrast` every screen of a day (welcome, both Name steps, Ask, Pick, Block, paused Block, Close, Close after Yes, Closed, Your days, About, bring-in), in light and dark: every element's own text meets WCAG AA against its first opaque background (4.5:1, or 3:1 for large text; disabled controls exempt). Driven by `contrast-aa` (Driving below). Unit side: `src/contrast.test.ts` checks `--muted` on `--paper`, `--well` and `--well-2` in both schemes and that the placeholder is not faded.

## How to get to it (user POV)

- Offline: use the app once online, then turn on airplane mode and reopen it.
- Small phone: an iPhone SE or any 375-wide device.
- The rest: private browsing, a browser tab on iPhone, or pasting odd text into an item.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK. The service worker only exists in a production build, which `vdt launch` and the live site both are.

- **Offline reload.** Run `vdt journey offline-reload`. Waits for the precache (8+ entries) and a reload to be controlled by the worker, then `setOffline(true)`: reload shows Welcome; the full ritual and `Start the block` (`2:00:00`) work; an offline reload shows the timer; `runFor('02:00:01')`, Yes, Close today; an offline reload shows `Today is closed`. Storage holds `didIt: true`.
- **Small phone.** Run `vdt journey small-phone-layout`. Viewport 375×667, `isMobile`, `hasTouch`. After every screen (welcome, pick, block, close, close-yes, closed, days, about) `noHScroll` asserts no horizontal scroll and no element wider than the viewport.
- **Reload mid-naming.** Run `vdt journey reload-mid-naming`. Step 2, a typed draft, reload: Welcome; `I'm ready`: `Talking to leads` is listed, the draft is gone.
- **Known gap: a reload keeps the step.** Run `vdt journey gap-reload-keeps-step`. A known gap that fails today on purpose: it asserts the wanted behavior (a reload on Name step 2 stays on step 2, a reload on Ask item 2 of 3 stays there) and ends with `gap open (N of 2): ...`, naming each part that is not (N of them); the registered `fails_with` carries `(2 of 2)`, so a half fix reads WRONG. `node e2e/gaps.mjs` runs it and expects that failure (reload-mid-flow-restarts-step in [../known-gaps.json](../known-gaps.json)); `vdt list` leaves it out.
- **Storage blocked.** Run `vdt journey storage-blocked` (an init script makes `Storage.prototype.setItem` throw). The note shows; the ritual through `Start the block` works; no page error.
- **No Notification API.** Run `vdt journey no-notification-api` (an init script deletes `window.Notification`). About shows the unavailable line and no time input.
- **Long text.** Run `vdt journey long-url-widths`; a FAIL names the screen, width and element. **Contrast.** Run `vdt journey contrast-aa`; a FAIL names the screen, scheme, element and ratio.
- **Focus after navigation.** Run `vdt journey focus-after-nav`. Keyboard only through a whole day: after each screen change focus is on the item input (the Name steps) or on the new heading (Ask, Pick, Block, Close, Closed, Your days, About), so typing and Enter work at once; the progress dots are an `img` named `Step 1 of 3`; a plain reload leaves focus on the page body.
- **Hostile text.** Run `vdt journey hostile-text`. The markup item is listed literally, `Add` is disabled for blanks, no dialog opens, no `<img>` in `main`, the stored text equals what was typed.
- **Proof.** `offline-reload.*`, `block-survives-offline-reload.*`, `closed-survives-offline-reload.*`; `close.*` and `closed-days-about.*` in small-phone-layout; `ready-again.*`; `note.*`; `about.*`; `blank.*`.

## Gotchas

- Not in vdt: an axe-core scan (wcag2a/aa/21aa + best-practice) of every screen in light and dark needs the real clock and axe-core, which the product does not depend on, so it is a manual probe. After the contrast fix its only finding is gap (1) below, on step 1, 2, Ask and in both schemes; `color-contrast` is clean.
- Known product gaps still open: (1) On a 320×568 screen Close today needs a scroll after answering.
- Fixed and now asserted: the progress dots are `role="img"` with their label (no axe `aria-prohibited-attr`; `focus-after-nav` checks the image), and after every screen change focus is on the new heading, or on the item input on the name steps, so Tab and typing work at once (`focus-after-nav`: keyboard-only through a whole day; a page load itself does not grab focus). Earlier: long unbroken strings (`long-url-widths`) and muted text contrast (`contrast-aa`, plus `src/contrast.test.ts`). See the two sub-features above.
- The first visit writes an empty `one-thing:v3` record straight away (a peek day); it is ignored as history.
- The first load of a fresh context is not controlled by the worker; `waitForOfflineReady` reloads once to get there. Do not assert offline behaviour before that.
- Against the live site `/api/event` is stubbed for every journey (`session` in `drive.mjs`), so no run adds to the real counts.
