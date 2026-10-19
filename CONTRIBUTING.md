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

`npm run check` is the one command, and CI runs it on Node 22. It runs the public hygiene check, the text check (no dashes, the brand and domain forms), the AGENTS.md check, the workflows check (the deploy gate in `.github`), typecheck, lint, unit tests, the build and `check:dist`, stops at the first failure and prints the step to rerun alone (for example `npm run lint`). A pull request should pass it.

If you change `.github/workflows`, also run [actionlint](https://github.com/rhysd/actionlint) 1.7.12 and make sure it prints nothing (`npm run check:workflows`, part of `npm run check`, guards the deploy gate but not syntax or shell).

Merging to `master` deploys the live site automatically once CI passes (see [Automatic deploy](./docs/deploy.md#automatic-deploy) for the required secrets and how to roll back). Only maintainers merge. Contributors never need Cloudflare credentials: pull requests and forks only run the checks.

Changes that touch what a person sees or does (screens, copy, the block timer, closing the day) should also pass the end-to-end journeys in [`e2e/`](./e2e/README.md). For example: `npm run build && VDT_PORT=$((4400 + RANDOM % 500)) npm run journeys -- first-visit start-end-block` (any free port above 4400; other people or agents on the machine may use the default 4317). CI runs 8 of them on every pull request. If you change behavior, add or update a journey or a unit test with it.

## Pull request expectations

- One concern per pull request, with a short description of what changed and why.
- Keep the diff small. Do not mix refactors with behavior changes.
- No new runtime dependencies without a good reason. The app is small on purpose.
- `package.json` has `overrides: { "@babel/core": "^7.0.0" }` on purpose: `workbox-build` (through `vite-plugin-pwa`) needs Babel 7, and without the override npm refuses to install a new `@vitejs/plugin-react` (ERESOLVE through an optional `@rolldown/plugin-babel` peer that wants Babel 8). Drop it when `npm install -D @vitejs/plugin-react@latest` works without it. The lock is written by npm 11 or later; npm 10 drops the `libc` lines on the native bindings, so do not commit a lock diff that only removes them.
- Read storage, the clock and notifications only through their owner modules (`src/storage.ts`, `src/clock.ts`, `src/reminder.ts`); `npm run lint` names the function to call. See the module map in [docs/architecture.md](./docs/architecture.md#module-map).
- Every word the app shows lives in `src/copy.ts`, each marked as a talk quote, a paraphrase or the app's own words; see [docs/architecture/words-on-screen.md](./docs/architecture/words-on-screen.md). Quotes are checked word for word against the talk only where `FERRISS_TRANSCRIPT` points at a transcript (`[m:ss] words` per line); CI cannot, so a maintainer with the transcript runs `npm test` before merging a copy change.
- Do not rename the `localStorage` keys (`one-thing:*`). Existing users' days live there. See [docs/architecture.md](./docs/architecture.md).
- Never send what a person writes anywhere. Item text stays on the device.

## File size limit (pre-commit hook)

A commit cannot include a file over 5,000 tokens, counted as bytes / 4 (so over 20,000 bytes). Big files are hard for people and agents to read and change whole; split them by responsibility instead.

- **Enabled automatically.** `npm ci` or `npm install` runs the `prepare` script, which sets `core.hooksPath` to the tracked `.githooks/` directory. It does nothing in CI, outside a git checkout, or when `core.hooksPath` is already set in any git config scope, global included (it leaves your value alone and prints a one-line note; to use this hook run `git config core.hooksPath .githooks`, or call `node scripts/check-file-size.mjs` from your own hook).
- **Staged files only.** It measures what is staged (a partly staged file counts as staged) and skips deleted files, symlinks, binary files and files whose first lines say `@generated` or `DO NOT EDIT`.
- **When it blocks you,** the message lists each file with its token count and says how to split it. Do not use `git commit --no-verify`.
- **Not written by hand?** Lockfiles, generated code and data are listed in [`.filesizeignore`](./.filesizeignore): one gitignore-style glob per line, with a comment saying why. Add the path there and stage that file with the commit.
- `npm run check:file-size` runs the same check on what is staged now; `npm run check:file-size -- --all` lists every tracked file over the limit.

## Principles

Do The Hard Thing is a calm morning method, not a habit tracker. Contributions must not add streaks, points, badges, levels, leaderboards, guilt-based reminders or any other gamification. A missed day adds nothing and resets nothing. The count of finished days only goes up.

## Security

Please do not open a public issue for a security problem. Report it privately through GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability").

## License

By contributing you agree that your contribution is licensed under the [MIT License](./LICENSE).
