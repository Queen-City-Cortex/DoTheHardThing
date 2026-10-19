// ---- known gaps: each journey asserts the behavior we want, so it FAILS while the gap is open ----
// Not in `--list` (so `vdt list`, e2e/run.mjs and CI never run them); `--list-gaps` lists them and `node e2e/gaps.mjs` runs
// them against e2e/known-gaps.json, where each has an owner and an expiry. A wanted behavior that is missing is noted with
// `gapOpen`, and the journey ends with one error of our own, `gap open (N of M): ...` (N wanted behaviors still missing of
// the M it checks), the text the entry's `fails_with` matches with its count, so a half-fixed gap reads WRONG, not XFAIL.
// None is open today: the owner decided the last two on 2026-10-19 (a reload keeps today's behavior, pinned by
// reload-mid-naming and reload-mid-ask; Back from Ask's first item returns to Name's last step, back-to-last-substep).
// A new gap adds `'gap-<name>': journey({ id: 'gap-<name>', ... }, async (s) => { const gap = gapOpen(); ...; gap.end(); })` here.
export function gapOpen() {
  const open = []; let total = 0;
  return {
    want: (ok, what, saw) => { total++; if (!ok) open.push(`${what} (saw ${JSON.stringify(saw)})`); },
    end: () => { if (open.length) throw new Error(`gap open (${open.length} of ${total}): ${open.join('; ')}`); },
  };
}
export const gapJourneys = {};
