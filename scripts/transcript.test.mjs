// scripts/transcript.mjs: which path wins, when the talk checks skip, and that a set but unreadable path is an error.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTranscript, transcriptPath } from './transcript.mjs';

const dir = mkdtempSync(join(tmpdir(), 'transcript-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const saved = { FERRISS_TRANSCRIPT: process.env.FERRISS_TRANSCRIPT, TRANSCRIPT: process.env.TRANSCRIPT };
beforeEach(() => { delete process.env.FERRISS_TRANSCRIPT; delete process.env.TRANSCRIPT; });
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

describe('transcript.mjs', () => {
  it('takes the argument, then FERRISS_TRANSCRIPT, then TRANSCRIPT; empty counts as unset', () => {
    expect(transcriptPath()).toBeNull();
    process.env.TRANSCRIPT = 'old.txt';
    expect(transcriptPath()).toBe('old.txt');
    process.env.FERRISS_TRANSCRIPT = '';
    expect(transcriptPath()).toBe('old.txt');
    process.env.FERRISS_TRANSCRIPT = 'new.txt';
    expect(transcriptPath()).toBe('new.txt');
    expect(transcriptPath('arg.txt')).toBe('arg.txt');
  });
  it('returns null (skip) only when no path is set', () => {
    expect(readTranscript()).toBeNull();
    expect(readTranscript('')).toBeNull();
  });
  it('reads a path that exists', () => {
    const p = join(dir, 'talk.txt');
    writeFileSync(p, '[0:01] one two\n');
    expect(readTranscript(p)).toEqual({ path: p, text: '[0:01] one two\n' });
  });
  it('returns an error naming the path when it is set but cannot be read', () => {
    const missing = join(dir, 'missing.txt');
    process.env.FERRISS_TRANSCRIPT = missing;
    expect(readTranscript()).toEqual({ path: missing, error: expect.stringContaining(`cannot read the transcript at ${missing} (no such file)`) });
    expect(readTranscript(dir)?.error).toContain(`at ${dir} (it is a directory)`);
  });
});
