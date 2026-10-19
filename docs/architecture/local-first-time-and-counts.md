[Architecture index](../architecture.md)

# Local-first

There is no account and no server-side copy of anything a person writes. The whole state is one JSON value in `localStorage` under the key `one-thing:v3`: the list of days (items, the chosen one, the block, the "Did you do it?" answer), the reminder time, and a small per-month archive of finished-day counts for days that have aged out of the stored window (the 120 most recent days). The service worker precaches the app shell, so it loads and works offline.

A second key, `one-thing:events`, records only which anonymous count names were already sent today, so a refresh does not count twice.

## Why the keys are still called `one-thing:*`

The project began under the working name "One Thing". The keys are part of the stored data format, and people already have days saved under them. Renaming a key would make the app look empty on their next visit, so the keys keep their original prefix. The previous format, `one-thing:v2`, is read once to migrate into v3 and is never written or deleted. Any change to the stored shape should add a new versioned key and a migration, not rename an old one.

# Time

The app depends on the device's local clock: a day is the local calendar date, and a block belongs to the day it started. The end-to-end journeys use Playwright's fake clock to move time.

# Anonymous counts

The client sends at most three events (`started`, `finished`, `opened_history`), once per browser per day, as `POST /api/event` with `{"event":"<name>"}`. Nothing is sent in development or when the browser signals Do Not Track or Global Privacy Control. The Worker allow-lists the name and writes a data point to Workers Analytics Engine containing the event name and the country code from Cloudflare's request metadata. It does not store IP addresses or user agents. See [analytics.md](../analytics.md).
