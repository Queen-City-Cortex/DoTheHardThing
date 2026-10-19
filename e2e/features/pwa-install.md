# Install as an app (PWA metadata)

The site can be added to a phone's home screen and then opens standalone. What makes that possible is metadata: the web app manifest and its icons, the Apple touch icon and the theme-color tags. The service worker and the offline behavior are in [resilience.md](./resilience.md) (`rs-offline`). No journey installs the app.

## Sub-features

- `pw-manifest` the manifest (`vite.config.ts`, built to `manifest.webmanifest`) names the app `Do The Hard Thing` (short name `Hard Thing`), `display: standalone`, `start_url: /`, with `pwa-192.png`, `pwa-512.png` and a maskable `pwa-512.png`, and `theme_color` and `background_color` `#f4f3ef` (the paper colour). Checked outside vdt, not verified by vdt: `npm run check:dist` fails when the colours differ from the page's theme-color meta or the built CSS's `--paper`, when the orientation is locked or when an icon is missing from `dist`; `npm run verify:live` checks the live manifest equals `dist/manifest.webmanifest`.
- `pw-icons` `apple-touch-icon.png` (linked from `index.html`), `favicon.svg`, and the two PWA PNGs are in the precache, so they work offline. Checked outside vdt, not verified by vdt: `check:dist` (every file the page loads is in `sw.js`). Whether the pictures look right is checked by eye.
- `pw-theme-color` `index.html` has two theme-color metas, `#f4f3ef` for light and `#15181d` for dark. Checked outside vdt, not verified by vdt: `check:dist` compares only the light one with the manifest.
- `pw-install` Add to Home Screen opens the app standalone and offline. Not exercised, not verified by vdt: it needs a real device or browser install flow; no journey or script drives it.

## How to get to it (user POV)

- iPhone Safari: Share, then Add to Home Screen. Android Chrome: the install prompt or menu. Desktop Chrome: the install icon in the address bar.

## Driving it with vdt

Preconditions:

- No vdt command installs the app. Run `npm run build` and `npm run check:dist` for the manifest and icons, and `npm run verify:live` for the live manifest. `offline-reload` proves the service worker half (see [resilience.md](./resilience.md)).

## Gotchas

- iPhone discards home-screen apps sometimes, which is why a reload that loses the Name or Ask step matters (the reload gap in [resilience.md](./resilience.md)).
- Notifications on iPhone work only from the home-screen app (see `rm-status` in [reminder.md](./reminder.md) and `rs-no-notification`).
