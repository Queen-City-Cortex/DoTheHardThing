// A preload for e2e/drive.mjs that records every Content-Security-Policy violation in every page of every journey,
// without editing drive.mjs. It wraps chromium.launch, so each browser's newContext adds an init script that turns the
// page's securitypolicyviolation events into console lines, and appends to the file named by CSP_LOG:
//   `context <url>`                          once per page load (a positive control: the watcher saw the page)
//   `violation <directive> <blocked> <doc>`  once per violation a page reports (Report-Only or enforced)
//   `console <type>: <text>`                 the browser's own console line about CSP (usually the same violation again)
// Every line that is not a context line is a violation; zero of them with context lines present means none. Usage (e2e/README.md, CSP watch):
//   CSP_LOG=/tmp/csp.log NODE_OPTIONS="--import=$PWD/e2e/csp-watch.mjs" VDT_URL=http://127.0.0.1:<port> node e2e/run.mjs
// NODE_OPTIONS reaches the drive.mjs children run.mjs spawns; `node --import` alone would not.
/* global document -- the init script runs in the page */
import { appendFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const LOG = process.env.CSP_LOG;
if (!LOG) throw new Error('csp-watch: set CSP_LOG to the file the violations go to');
const TAG = 'csp-watch:';
const write = (line) => appendFileSync(LOG, line.replace(/\s+/g, ' ').trim() + '\n');

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...opts) => {
    const context = await newContext(...opts);
    await context.addInitScript((tag) => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`${tag} ${e.violatedDirective} ${e.blockedURI || '(inline)'} ${e.documentURI}`));
    }, TAG);
    context.on('page', (page) => page.on('load', () => write(`context ${page.url()}`)));
    context.on('console', (m) => {
      const text = m.text();
      if (text.startsWith(TAG)) write(`violation ${text.slice(TAG.length)}`);
      else if (/Content Security Policy|Refused to/i.test(text)) write(`console ${m.type()}: ${text}`);
    });
    return context;
  };
  return browser;
};
