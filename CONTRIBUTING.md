# Contributing

Thanks for your interest in Do The Hard Thing. Small, focused changes are the easiest to review.

## Setup

You need Node 22 (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:5173
```

## Before you open a pull request

```bash
npm run lint
npm test
npm run build
```

CI runs the same three commands on Node 22. A pull request should pass all of them.

Merging to `master` deploys the live site automatically once CI passes (see [Automatic deploy](./README.md#automatic-deploy) for the required secrets and how to roll back). Only maintainers merge. Contributors never need Cloudflare credentials: pull requests and forks only run the checks.

Changes that touch what a person sees or does (screens, copy, the block timer, closing the day) should also pass the end-to-end journeys in [`e2e/`](./e2e/README.md). For example: `e2e/vdt launch && e2e/vdt journey first-visit start-end-block`. If you change behavior, add or update a journey or a unit test with it.

## Pull request expectations

- One concern per pull request, with a short description of what changed and why.
- Keep the diff small. Do not mix refactors with behavior changes.
- No new runtime dependencies without a good reason. The app is small on purpose.
- Do not rename the `localStorage` keys (`one-thing:*`). Existing users' days live there. See [docs/architecture.md](./docs/architecture.md).
- Never send what a person writes anywhere. Item text stays on the device.

## Principles

Do The Hard Thing is a calm morning method, not a habit tracker. Contributions must not add streaks, points, badges, levels, leaderboards, guilt-based reminders or any other gamification. A missed day adds nothing and resets nothing. The count of finished days only goes up.

## Security

Please do not open a public issue for a security problem. Report it privately through GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability").

## License

By contributing you agree that your contribution is licensed under the [MIT License](./LICENSE).
