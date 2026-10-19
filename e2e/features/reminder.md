# Morning reminder

The About screen has an optional morning reminder. It only shows a time as set when the browser has granted notifications. A status line under the control says what will actually happen, and `Off` cancels both the in-page timer and any notification scheduled with a Notification Trigger.

## Sub-features

- `rm-status` a `role=status` line under the control always says what is true. The copy comes from `reminderStatus` in `src/logic/reminder.ts` (re-exported by `src/logic.ts`; `src/App/About.tsx` calls it):
  - `Pick a time and your browser will ask for permission.` (not asked yet)
  - `Notifications are allowed. Pick a time.` (granted, no time)
  - `Reminder set for HH:MM. It only fires while this app is open.` (granted, no `TimestampTrigger`; this is what Chromium shows)
  - `Reminder set for HH:MM. It is scheduled on this device and refreshed each time you open the app.` (granted, with Notification Triggers)
  - `Notifications are blocked for this site, so no reminder can be set. Allow them in your browser settings.` (denied; the time input is disabled)
  - `Notifications aren't available on this device. On iPhone, add to Home Screen first.` (unsupported: there is no Notification API; the `Reminder time` input and `Off` are not rendered at all. Driven by `no-notification-api`, see `rs-no-notification` in [resilience.md](./resilience.md))
- `rm-set` picking a time asks for permission if it hasn't been asked yet. The time is saved (storage `reminder: "HH:MM"`) only if permission is granted.
- `rm-denied` if permission is blocked, no time can be set: the input is disabled and empty, the blocked message shows, and nothing is saved.
- `rm-off` `Off` shows only while a reminder is active. It clears storage (`reminder: null`) and cancels the timer and any `morning`-tagged notification. Clearing the time input by hand does the same as `Off` (not driven by vdt: the journeys press `Off`).

## How to get to it (user POV)

- Open `About` from the header, then find `Morning reminder` and the `Reminder time` input.

## Driving it with vdt

Preconditions:

- `vdt doctor` prints OK.
- `reminder-honest-granted` runs in full Chromium (`channel: 'chromium'`, new headless) with `permissions: ['notifications']` (see `CONTEXT` in `e2e/drive/context.mjs`). The default headless shell reports `Notification.permission` as `denied` even when granted, so it can't be used for this journey. `reminder-honest-denied` runs in the default headless shell, which starts with notifications `denied` and shows no prompt.

- **Granted.** Run `vdt journey reminder-honest-granted`. Open `About`. The status reads `Notifications are allowed. Pick a time.` Fill `Reminder time` with `06:30`. The status reads `Reminder set for 06:30. It only fires while this app is open.` and storage has `reminder: "06:30"`. `Off` brings the status back to `Notifications are allowed. Pick a time.`, empties the input and sets storage `reminder: null`.
- **Blocked.** Run `vdt journey reminder-honest-denied`. Open `About`. The status reads the blocked message, the `Reminder time` input is disabled and empty, there is no `Off`, no `Reminder set for` text, and storage has no reminder.
- **Proof.** `set-0630.*`, `off.*` and `localStorage.json` in `reminder-honest-granted`; `about-blocked.*`, `localStorage.json` and `permission.json` (`Notification.permission` and the Permissions API state before and after) in `reminder-honest-denied`.

## Gotchas

- A fresh headless-shell context has no 'default' (ask) state to drive: it is already `denied`. The ask-then-refuse path (type a time, browser prompts, user refuses) is therefore covered by unit logic only, not by vdt. Playwright's `permissions` option can only grant.
- Chromium has no `TimestampTrigger`, so these journeys only cover the open-only path. The trigger path (one occurrence, re-scheduled on every app open) is covered by `src/reminder.test.ts`, not by vdt.
- The fake clock is paused, so the reminder's timer never fires during a journey. These journeys prove what is shown and stored, not that a notification is delivered.
