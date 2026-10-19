# www to the bare domain

`www.dothehardthing.app` should answer `301` to `https://dothehardthing.app` with the same path and query. This is a Cloudflare zone rule: nothing in the repo or CI creates it, and CI cannot prove it. `wrangler.jsonc` keeps `www.dothehardthing.app` as a custom domain of the Worker, which gives www its proxied DNS record and certificate; a Single Redirect is the first request phase Cloudflare runs, before Workers (Cloudflare's rules execution order, https://developers.cloudflare.com/rules/url-forwarding/), so the Worker should never see www. The custom domains page ("Redirect between www and root domain") recommends a redirect rule for this but its recipe uses a placeholder DNS record, not a Worker custom domain; if www keeps answering 200 after the rule exists, `verify:live --www` stays PENDING and the fix is to look at that (docs/architecture.md, Hosting).

In the Cloudflare dashboard, zone `dothehardthing.app`:

1. Rules > Overview > **Create rule** > **Redirect Rule**. Rule name: `www to bare domain`.
2. **When incoming requests match**: **Custom filter expression**, then Field **Hostname**, Operator **equals**, Value `www.dothehardthing.app` (the expression preview shows `http.host eq` and that host).
3. **Then**: URL redirect, Type **Dynamic**, Expression: `concat("https://dothehardthing.app", http.request.uri.path)`, Status code **301**, **Preserve query string** on.
4. **Deploy**.

Why this form and not the wildcard one (`https://www.*` to `https://${1}`): it names the one host exactly, matches `http` too, and keeps the path explicitly; the query comes from Preserve query string.

Verify: `npm run verify:live -- --require-www` (exit 0 only when `/` and `/?x=1` both get the right 301), or `curl -sI https://www.dothehardthing.app/`, which shows `HTTP/2 301` and `location: https://dothehardthing.app/`. Before the rule exists, `npm run verify:live -- --www` prints `PENDING www redirect: not created yet` and does not fail. The default `npm run verify:live` (what CI runs) does not ask www. `WWW_SITE` overrides the www origin it asks (the tests point it at a local server).

History: what someone wrote while on www lives in that origin's `localStorage` and stays there; the redirect does not move it to the bare domain, and nothing deletes it.
