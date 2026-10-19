# Privacy and analytics

## Privacy


- What you write (items and answers) stays in your browser's `localStorage` on your device. It is never sent anywhere, and there is no account or sync.
- The app sends three anonymous counts to its own Worker (`started`, `finished`, `opened_history`), at most once per browser per day, with no text, id or cookie. The Worker stores the event name and a country code. Details are in [Analytics](#analytics) below.
- None of the three counts is sent when your browser sends Do Not Track or Global Privacy Control, and none is sent in development builds. The optional Cloudflare beacon below does not read those signals.

## Analytics

Two cookie-free pieces. Neither ever sees what you write. The About page says what is collected.

### 1. Visits: Cloudflare Web Analytics (optional beacon)

Page views, referrers (for example, how many came from a tweet) and countries.

1. Cloudflare dashboard > **Analytics & Logs** > **Web Analytics** > **Add a site**.
2. Choose the hostname `dothehardthing.app`. Cloudflare shows a JavaScript snippet; copy the `token` from `data-cf-beacon='{"token": "..."}'`. (Do not paste the snippet into the code.)
3. Build with the token set, then deploy:

   ```bash
   VITE_CF_ANALYTICS_TOKEN=<token> npm run build && npx wrangler deploy
   ```

   Or put `VITE_CF_ANALYTICS_TOKEN=<token>` in a git-ignored `.env.production.local` file and run the usual deploy command.

Without the variable, the build contains no Cloudflare script at all, so nothing ships broken. The token is not a secret (it is visible in the page), but it stays out of git anyway.

### 2. Finished days: anonymous event counts (Workers Analytics Engine)

Cloudflare Web Analytics cannot count custom events, so the app sends three counts to its own Worker, which writes them to Workers Analytics Engine:

| event | when |
| --- | --- |
| `started` | the Name screen (step 1 of 3) opens (once per browser per day) |
| `finished` | "Did you do it?" is answered Yes (once per browser per day) |
| `opened_history` | Your days is opened (once per browser per day) |

- The request is `POST /api/event` with the body `{"event":"started"}`. Nothing else is sent: no item text, no stored data, no id, no cookie. The Worker stores the event name and a country code from Cloudflare's own request metadata; it does not store IPs or user agents.
- Off in development. Off when the browser sends Do Not Track or Global Privacy Control. Silent when offline or blocked; nothing is retried.
- Client: `src/analytics.ts`. Worker: `worker/index.ts`. Binding: `analytics_engine_datasets` in `wrangler.jsonc` (binding `EVENTS`, dataset `dothehardthing_events`). The dataset is created on the first write; there is nothing to set up by hand. If the deploy complains that Analytics Engine is not enabled, open Cloudflare dashboard > **Workers & Pages** > **Analytics Engine** once and enable it.

Reading the counts, with an API token that has the **Account Analytics: Read** permission (`curl` or Grafana):

```sql
SELECT blob1 AS event, toDate(timestamp) AS day, SUM(_sample_interval) AS count
FROM dothehardthing_events
GROUP BY event, day
ORDER BY day DESC, event
```

```bash
curl "https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql" \
  -H "Authorization: Bearer <api_token>" --data "<the query above>"
```

Because each event is counted once per browser per day, `finished` divided by `started` over a day or week is a rough "how many who began got to Yes" figure. A day left unfinished carries over to the next date, so it is only meaningful over a week or more.
