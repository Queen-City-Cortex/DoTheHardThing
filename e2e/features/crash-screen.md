# Crash screen

If rendering throws, a small error boundary in `src/main.tsx` replaces the app with a card: the heading `Something went wrong.`, the line `Reloading usually fixes it.` and a `Reload` button that reloads the page (`error.hero`, `error.reload` and `error.button` in `src/copy.ts`). Stored data is untouched.

## Sub-features

- `cr-boundary` a render error shows the card instead of a blank page, and `Reload` calls `location.reload()`. Not exercised anywhere, not verified by vdt: no journey can make the app throw while rendering through the real UI (storage is decoded defensively, and the harness may not seed storage or call app functions), and no unit test renders the boundary either. The `journey` helpers do check that no `pageerror` happens during a day, which is the opposite case.

## How to get to it (user POV)

- Nobody should reach it. It only shows after an unexpected bug.

## Driving it with vdt

Preconditions:

- Nothing to run. Do not add a journey that breaks the app on purpose unless it can do so through the UI; a test that injects a throw belongs in a unit test.

## Gotchas

- The boundary catches render errors only. An error in an event handler or an async callback does not show it.
- The copy is `own` text in `src/copy.ts`, so the copy checks do not compare it with the talk.
