# The method and the app

**Live at [DoTheHardThing.app](https://dothehardthing.app).**

A morning method, as an offline-first PWA: name what you have been avoiding, ask two questions, pick one thing, and protect one unbroken block of two to three hours to do it. No account, no streaks, nothing you write ever leaves your device.

| Name it | Two questions | Pick one | Protect the block |
| --- | --- | --- | --- |
| ![Naming what you are putting off](screenshots/02-name-pushed.png) | ![The two questions](screenshots/05-two-questions.png) | ![Pick one thing](screenshots/06-pick-one.png) | ![The block timer](screenshots/07-block-after-reload.png) |

More screens (close the day, About, a returning bad day, dark mode) are in [`docs/screenshots/`](screenshots/).

## What the app does


- **Name what is uncomfortable.** Three short prompts (what you keep putting off, what could get you rejected or start a conflict, what is making you anxious). Up to five items. One item can answer more than one prompt.
- **Two questions, then pick one.** For each item: would finishing it alone leave you satisfied with the day, and would it make the other to-dos unimportant or easier? Then choose the one thing for today.
- **Protect one block.** A 2, 2.5 or 3 hour countdown. One short step-away (under 10 minutes) is allowed; 10 minutes or more ends the block.
- **Close the day.** "Did you do it?" is your own answer, Yes or Not today. There is no scoring.
- **Your days.** A quiet history of the days you finished, with a count that only goes up.
- **Gentle on bad days.** Returning after missed days or starting late (11:00 or later) lets you choose a shorter, modified block instead of a guilt trip.
- **Optional morning reminder** through the browser's notifications, if you allow them.
- **Works offline and installs** to your home screen (service worker and web manifest). Light and dark themes follow your device.

## Principles


- **No streaks, no gamification.** No points, badges, levels or leaderboards. A missed day adds nothing and resets nothing; the count of finished days only goes up.
- **One thing.** The method is deliberately small: one thing, one block.
- **Calm and honest.** No guilt, no nagging. The reminder says so when it cannot work (for example, when notifications are blocked).
- **Your data stays yours.** Local-first, no account.

## Credit


The method is Tim Ferriss's: his morning approach to efficacy (doing the right thing, rather than efficiency), condensed here from eight steps to three. See [his post on X](https://x.com/tferriss/status/2110445158206447830), which links the short talk.

Do The Hard Thing is an independent project. It is not affiliated with or endorsed by Tim Ferriss. The one-pause allowance inside a block and the shorter block offered after missed days or a late start are this app's own additions, not part of his method.
