A mobile-first daily focus PWA: name what's uncomfortable, pick one thing, protect one block. Live at https://dothehardthing.app.

The hard thing you have been avoiding tends to lose to easier work unless you choose it before the day fills up. DoTheHardThing.app walks you through Tim Ferriss's morning method for that choice: name what you are putting off, answer two questions about each item, pick one, and protect a two to three hour block to do it. It is for people who want a calm daily routine, with no account, no streaks, and nothing you write leaving your device.

## Install and run

You need Node 22.18 or newer (`.nvmrc` pins 22).

```bash
git clone https://github.com/Queen-City-Cortex/DoTheHardThing.git
cd DoTheHardThing
npm ci
npm run dev        # http://localhost:5173
```

## Usage

Open http://localhost:5173 in a phone-sized browser window and work through one day:

1. Name up to five things you keep putting off.
2. For each, answer the two questions: would finishing it alone satisfy you about the day, and would it make the other to-dos unimportant or easier?
3. Pick the one thing for today.
4. Start a 2, 2.5 or 3 hour block. One step away of under 10 minutes is allowed; 10 minutes or more ends the block.
5. Close the day by answering "Did you do it?" with Yes or Not today.

## Architecture

The app is a Vite, React and TypeScript PWA in `src/`, served by a Cloudflare Worker in `worker/` whose only code path accepts anonymous event counts; the static files come from the Worker's assets binding. The main design decision is that the app is local-first: everything you write is one JSON value in `localStorage`, and the Worker only ever receives three anonymous counts (`started`, `finished`, `opened_history`), at most once per browser per day. See [docs/architecture.md](docs/architecture.md), and [docs/deploy.md](docs/deploy.md), [docs/analytics.md](docs/analytics.md) and [docs/method.md](docs/method.md) for the rest.

## Tests

```bash
npm run check
```

This one command runs the public hygiene check, the text check, the AGENTS.md check, the workflows check, typecheck, lint, the Vitest unit tests, the production build and the build output check. CI runs the same command on every pull request and every push to master.
