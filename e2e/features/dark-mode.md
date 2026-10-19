# Dark mode

The palette follows the device setting: `src/index.css` redefines the colour variables under `@media (prefers-color-scheme: dark)` (`--paper #15181d`, `--ink`, `--muted`, the tag colours and the rest). There is no toggle in the app.

## Sub-features

- `dm-contrast` every screen's text meets WCAG AA in dark as in light. Proved by `contrast-aa` (every screen of a day, both schemes, through `emulateMedia`) and by `welcome-v1` for the first-visit welcome. Unit side: `src/contrast.test.ts` reads the dark block of the stylesheet. The sub-feature `rs-contrast` in [resilience.md](./resilience.md) is the same check; the journey proves both ids.
- `dm-palette` the colours, tag chips, the progress light and the page background actually switch with the setting, and the dark theme-color meta matches. Not exercised beyond contrast, not verified by vdt: no journey screenshots a scheme for comparison or asserts a colour, so only contrast is checked, not that the palette looks right. Look at the `emulateMedia` screenshots by eye if the CSS changes.

## How to get to it (user POV)

- Switch the phone or browser to dark appearance, then open the app.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK.
- See `contrast-aa` in [resilience.md](./resilience.md); it switches the colour scheme itself.

## Gotchas

- The journeys reset the scheme to light after each screen. A journey that leaves it on dark changes every later check on that page.
- the reduced-motion preference is also in `src/index.css` and is not driven by any journey.
