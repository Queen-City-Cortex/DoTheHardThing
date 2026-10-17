# Contributing

Thanks for your interest in Do The Hard Thing. Small, focused changes are the easiest to review.

## Setup

You need Node 22.18 or newer (see `.nvmrc`). The checks are validated on 22.18 and later, the first 22 release that runs TypeScript files without a flag.

```bash
npm ci
npm run dev        # http://localhost:5173
```

## Before you open a pull request

```bash
npm run check
```

`npm run check` is the one command, and CI runs it on Node 22. It runs the public hygiene check, the text check (no dashes, the brand and domain forms), the AGENTS.md check, typecheck, lint, unit tests, the build and `check:dist`, stops at the first failure and prints the step to rerun alone (for example `npm run lint`). A pull request should pass it.

Merging to `master` deploys the live site automatically once CI passes (see [Automatic deploy](./README.md#automatic-deploy) for the required secrets and how to roll back). Only maintainers merge. Contributors never need Cloudflare credentials: pull requests and forks only run the checks.

Changes that touch what a person sees or does (screens, copy, the block timer, closing the day) should also pass the end-to-end journeys in [`e2e/`](./e2e/README.md). For example: `npm run build && VDT_PORT=$((4400 + RANDOM % 500)) npm run journeys -- first-visit start-end-block` (any free port above 4400; other people or agents on the machine may use the default 4317). CI runs 8 of them on every pull request. If you change behavior, add or update a journey or a unit test with it.

## Pull request expectations

- One concern per pull request, with a short description of what changed and why.
- Keep the diff small. Do not mix refactors with behavior changes.
- No new runtime dependencies without a good reason. The app is small on purpose.
- Read storage, the clock and notifications only through their owner modules (`src/storage.ts`, `src/clock.ts`, `src/reminder.ts`); `npm run lint` names the function to call. See the module map in [docs/architecture.md](./docs/architecture.md#module-map).
- The words of the Welcome, Pick, Close and Closed screens live in `src/copy.ts`, each marked as a talk quote, a paraphrase or the app's own words; see [docs/architecture.md](./docs/architecture.md#the-words-on-screen).
- Do not rename the `localStorage` keys (`one-thing:*`). Existing users' days live there. See [docs/architecture.md](./docs/architecture.md).
- Never send what a person writes anywhere. Item text stays on the device.

## Principles

Do The Hard Thing is a calm morning method, not a habit tracker. Contributions must not add streaks, points, badges, levels, leaderboards, guilt-based reminders or any other gamification. A missed day adds nothing and resets nothing. The count of finished days only goes up.

## Security

Please do not open a public issue for a security problem. Report it privately through GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability").

## License

By contributing you agree that your contribution is licensed under the [MIT License](./LICENSE).
