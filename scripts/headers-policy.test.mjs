// The _headers parser that check:dist and verify:live share: rule matching, joining, detaching, errors.
import { describe, it, expect } from 'vitest';
import { CSP_ORIGINS, CSP_REPORT_ONLY, POLICY, cspProblems, display, headersFor, norm, parseHeaders } from './headers-policy.mjs';

describe('parseHeaders and headersFor', () => {
  it('matches splats greedily (also the empty rest) and placeholders up to one slash', () => {
    const { rules, errors } = parseHeaders('/*\n  A: 1\n/assets/:name\n  B: 2\n');
    expect(errors).toEqual([]);
    expect([...headersFor(rules, '/')]).toEqual([['a', '1']]);
    expect(headersFor(rules, '/assets/x.js').get('b')).toBe('2');
    expect(headersFor(rules, '/assets/x/y.js').has('b')).toBe(false);
    expect(headersFor(rules, '/nope').get('a')).toBe('1');
  });
  it('treats dots and other regex characters in a path literally', () => {
    const { rules } = parseHeaders('/sw.js\n  A: 1\n');
    expect(headersFor(rules, '/swxjs').has('a')).toBe(false);
    expect(headersFor(rules, '/sw.js').get('a')).toBe('1');
  });
  it('joins a header two matching rules set, and detaches with !', () => {
    const { rules } = parseHeaders('/*\n  Cache-Control: no-cache\n  X: 1\n/a\n  Cache-Control: max-age=60\n  ! X\n');
    expect(headersFor(rules, '/a').get('cache-control')).toBe('no-cache, max-age=60');
    expect(headersFor(rules, '/a').has('x')).toBe(false);
    expect(headersFor(rules, '/b').get('x')).toBe('1');
  });
  it('skips comments and blank lines, keeps colons in values, and reports what it cannot read', () => {
    const { rules, errors } = parseHeaders('# a comment\n\n/\n  Link: <https://x>; rel=preload\n  nocolon\n');
    expect(headersFor(rules, '/').get('link')).toBe('<https://x>; rel=preload');
    expect(errors).toEqual(['line 5: `nocolon` is not `Name: value`']);
    expect(parseHeaders('  A: 1\n').errors).toEqual(['line 1: a header before any path rule']);
    expect(parseHeaders('https://x.example/*\n').errors[0]).toContain('is not a path rule');
  });
  it('names, values and the policy', () => {
    expect(display('x-content-type-options')).toBe('X-Content-Type-Options');
    expect(norm('  camera=(),   microphone=() ')).toBe('camera=(), microphone=()');
    expect(Object.keys(POLICY)).toEqual(['x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-frame-options', 'content-security-policy-report-only']);
    expect(POLICY).not.toHaveProperty('content-security-policy');
    expect(POLICY['x-frame-options']).toBe('DENY');
  });
  it('public/_headers gives every path class the policy (the same table check:dist uses)', async () => {
    const { readFileSync } = await import('node:fs');
    const { rules, errors } = parseHeaders(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'));
    expect(errors).toEqual([]);
    for (const path of ['/', '/sw.js', '/manifest.webmanifest', '/assets/index-x.js', '/nope']) {
      for (const [n, v] of Object.entries(POLICY)) expect(norm(headersFor(rules, path).get(n)), `${path} ${n}`).toBe(v);
    }
  });
});

describe('the Report-Only CSP', () => {
  it('is the policy derived from the built page, with no problems', () => {
    expect(CSP_REPORT_ONLY).toBe("default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self'; style-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    expect(cspProblems(CSP_REPORT_ONLY)).toEqual([]);
    expect(Object.keys(CSP_ORIGINS)).toEqual(['https://static.cloudflareinsights.com', 'https://cloudflareinsights.com']);
  });
  it('flags a report endpoint, an origin off the allowlist, and a missing beacon origin', () => {
    expect(cspProblems(CSP_REPORT_ONLY + '; report-uri /csp')[0]).toContain('has report-uri, but the repo has no report endpoint');
    expect(cspProblems(CSP_REPORT_ONLY + '; report-to csp')[0]).toContain('has report-to');
    expect(cspProblems(CSP_REPORT_ONLY.replace("style-src 'self'", "style-src 'self' https://fonts.example"))).toEqual([expect.stringContaining('style-src allows `https://fonts.example`')]);
    expect(cspProblems(CSP_REPORT_ONLY.replace(' https://static.cloudflareinsights.com', ''))).toEqual([expect.stringContaining('script-src does not allow https://static.cloudflareinsights.com')]);
    // an allowed origin in the wrong directive is not enough
    expect(cspProblems(CSP_REPORT_ONLY.replace(' https://cloudflareinsights.com', '').replace("img-src 'self'", "img-src 'self' https://cloudflareinsights.com"))).toEqual([expect.stringContaining('connect-src does not allow https://cloudflareinsights.com')]);
  });
});
