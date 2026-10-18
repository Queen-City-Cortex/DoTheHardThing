// The security headers every static response gets, and the parser for public/_headers that check-dist.mjs,
// verify-live.mjs and their tests share. Cloudflare applies _headers only to static asset responses (the SPA fallback
// included), never to a response the Worker makes (/api/event). See Hosting in docs/architecture.md.

// The policy: lowercase header name -> exact value. One `/*` rule in public/_headers gives them to every path.
export const POLICY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // features the app never uses (it uses notifications and the service worker, which Permissions-Policy does not govern)
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'x-frame-options': 'DENY',
};

// Left out on purpose (docs/architecture.md, Hosting); verify:live reports whether the live site sends them anyway
export const LEFT_OUT = {
  'strict-transport-security': 'the .app TLD is HSTS-preloaded in browsers; includeSubDomains is hard to undo',
  'content-security-policy': 'not adopted yet',
};

// The display name of a policy header, for messages: x-frame-options -> X-Frame-Options
export const display = (name) => name.replace(/(^|-)(\w)/g, (_, d, c) => d + c.toUpperCase());

// Parse a _headers file. Rules start at column 0 with a path (`*` splat, `:name` placeholder); their headers follow,
// indented, as `Name: value` or `! Name` (detach); `#` starts a comment line. Returns { rules, errors }: an error is a
// line this parser cannot read (an absolute URL rule, a header before any rule, a line with no colon).
export function parseHeaders(text) {
  const rules = []; const errors = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const where = `line ${i + 1}`;
    if (!line.trim() || line.trim().startsWith('#')) return;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) { errors.push(`${where}: \`${line}\` is not a path rule (this parser reads only rules that start with /)`); return; }
      const pattern = line.trim();
      const re = new RegExp('^' + pattern.split(/(\*|:\w+)/).map((p) => (p === '*' ? '.*' : /^:\w+$/.test(p) ? '[^/]+' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
      rules.push({ pattern, re, headers: new Map(), detach: new Set() });
      return;
    }
    const rule = rules.at(-1);
    if (!rule) { errors.push(`${where}: a header before any path rule`); return; }
    const body = line.trim();
    if (body.startsWith('!')) { rule.detach.add(body.slice(1).trim().toLowerCase()); return; }
    const c = body.indexOf(':');
    if (c <= 0) { errors.push(`${where}: \`${body}\` is not \`Name: value\``); return; }
    const name = body.slice(0, c).trim().toLowerCase();
    const value = body.slice(c + 1).trim();
    rule.headers.set(name, rule.headers.has(name) ? `${rule.headers.get(name)}, ${value}` : value);
  });
  return { rules, errors };
}

// The headers a request path gets: every matching rule applies, a header set by two rules has its values joined with a
// comma (as Cloudflare does), and a `! Name` in any matching rule removes it. Returns Map(lowercase name -> value).
export function headersFor(rules, path) {
  const out = new Map(); const detach = new Set();
  for (const r of rules.filter((r) => r.re.test(path))) {
    for (const [n, v] of r.headers) out.set(n, out.has(n) ? `${out.get(n)}, ${v}` : v);
    for (const n of r.detach) detach.add(n);
  }
  for (const n of detach) out.delete(n);
  return out;
}

// Values are compared with whitespace collapsed
export const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
