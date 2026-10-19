// The security headers every static response gets, and the parser for public/_headers that check-dist.mjs,
// verify-live.mjs and their tests share. Cloudflare applies _headers only to static asset responses (the SPA fallback
// included), never to a response the Worker makes (/api/event). See Hosting in docs/architecture.md.

// The Content-Security-Policy, sent Report-Only: the browser logs a violation to the console and blocks nothing. There
// is no report-uri or report-to (the repo has no endpoint). Derived from the built page (docs/architecture.md, Hosting):
// same-origin scripts, styles, fonts, icons, manifest, service worker and fetch, plus the Cloudflare Web Analytics
// beacon. Enforcing it (the header without -Report-Only) is a later owner decision; check:dist refuses it until then.
export const CSP_DIRECTIVES = [
  ['default-src', "'self'"],
  ['script-src', "'self' https://static.cloudflareinsights.com"],
  ['connect-src', "'self' https://cloudflareinsights.com"],
  ['img-src', "'self'"],
  ['style-src', "'self'"],
  ['font-src', "'self'"],
  ['manifest-src', "'self'"],
  ['worker-src', "'self'"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  ['frame-ancestors', "'none'"],
];
export const CSP_REPORT_ONLY = CSP_DIRECTIVES.map(([d, v]) => `${d} ${v}`).join('; ');

// Every origin the CSP may name: anything other than 'self' and 'none' must be here, so adding one is a visible edit.
// Each origin lists the directives that must always allow it.
export const CSP_ORIGINS = {
  'https://static.cloudflareinsights.com': { must: ['script-src'], why: 'the Cloudflare Web Analytics beacon script (beacon.min.js)' },
  'https://cloudflareinsights.com': { must: ['connect-src'], why: 'where the beacon posts its report (/cdn-cgi/rum; the edge-injected beacon posts to the same-origin /cdn-cgi/rum)' },
};

// What is wrong with a CSP value, as fix-naming messages: a report-uri or report-to (no endpoint exists), a source
// that is not 'self', 'none' or a CSP_ORIGINS origin, or a beacon origin missing from its directive.
export function cspProblems(value) {
  const out = [];
  const directives = new Map(norm(value).split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...src] = d.split(' '); return [name.toLowerCase(), src]; }));
  for (const name of ['report-uri', 'report-to']) if (directives.has(name)) out.push(`has ${name}, but the repo has no report endpoint: remove it (a Report-Only CSP still logs violations to the browser console)`);
  for (const [name, src] of directives) {
    if (name === 'report-uri' || name === 'report-to') continue;
    for (const s of src) if (s !== "'self'" && s !== "'none'" && !(s in CSP_ORIGINS)) out.push(`${name} allows \`${s}\`: only 'self', 'none' and the origins in CSP_ORIGINS (scripts/headers-policy.mjs) may appear; add the origin there with the reason, or remove it`);
  }
  for (const [origin, { must }] of Object.entries(CSP_ORIGINS)) {
    for (const name of must) if (!(directives.get(name) ?? []).includes(origin)) out.push(`${name} does not allow ${origin}, which the Cloudflare Web Analytics beacon needs: add it to ${name}`);
  }
  return out;
}

// The policy: lowercase header name -> exact value. One `/*` rule in public/_headers gives them to every path.
export const POLICY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // features the app never uses (it uses notifications and the service worker, which Permissions-Policy does not govern)
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'x-frame-options': 'DENY',
  'content-security-policy-report-only': CSP_REPORT_ONLY,
};

// Left out on purpose (docs/architecture.md, Hosting); verify:live reports whether the live site sends them anyway
export const LEFT_OUT = {
  'strict-transport-security': 'the .app TLD is HSTS-preloaded in browsers; includeSubDomains is hard to undo',
  'content-security-policy': 'the CSP is sent Report-Only; enforcing it is a later owner decision',
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
