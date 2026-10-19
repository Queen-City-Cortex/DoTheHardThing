// Shared by the pieces of scripts/mutate.mjs: the repo root, the layers, small file and port helpers.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const REPO = path.resolve(import.meta.dirname, '..', '..');

export const LAYERS = ['lint', 'types', 'unit', 'journeys'];
export const fileText = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
export const count = (text, find) => text.split(find).length - 1;

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port: Number(port) });
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
  });
}
/** The /index.html bytes `url` serves once it answers, or null when `child` (the preview) exits or 30 s pass. */
export async function ready(url, child) {
  for (let i = 0; i < 60 && child.exitCode === null && !child.signalCode; i++) {
    try { const r = await fetch(`${url}/index.html`); if (r.ok) return await r.text(); } catch { /* not up yet */ }
    await sleep(500);
  }
  return null;
}