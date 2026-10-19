// e2e/csp-watch.mjs, without a browser: it refuses to start without CSP_LOG, and with it wraps chromium.launch in the
// same module instance drive.mjs imports.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WATCH = fileURLToPath(new URL('../e2e/csp-watch.mjs', import.meta.url));
const node = (env, code) => spawnSync(process.execPath, ['--import', WATCH, '--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, ...env } });

describe('csp-watch preload', () => {
  it('refuses to start without CSP_LOG', () => {
    const r = node({ CSP_LOG: '' }, '');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('csp-watch: set CSP_LOG to the file the violations go to');
  });
  it('wraps chromium.launch of @playwright/test, which drive.mjs imports', () => {
    const r = node({ CSP_LOG: '/dev/null' }, "import { chromium } from '@playwright/test'; console.log(chromium.launch.toString().includes('newContext'))");
    expect(r.stderr).toBe('');
    expect(r.stdout.trim()).toBe('true');
  });
});
