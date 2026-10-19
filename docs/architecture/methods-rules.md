[Architecture index](../architecture.md)

# The method's rules

`src/method.ts` is the one home for the method's numbers. `RULES` lists each rule with where it comes from: `talk` (the talk says it; `ref` is the transcript timestamp and `quote` a verbatim piece of that line), `reading` (the app's reading of a line in the talk) or `app` (the app's own addition). The named constants the app uses (`MAX_ITEMS`, `BLOCK_MIN`, `BLOCK_CHOICES`, `BREAK_LIMIT_MS` and the rest) are read from `RULES`, and lint flags a bare hour cutoff, block length, item count or minutes-as-milliseconds anywhere else in `src/`. `src/method.test.ts` has one test per rule that pins its numbers as literals next to the talk's line.

There is one late cutoff, `LATE_CUTOFF` (12:00, the `late-start` rule), for the Welcome framing, the bad-day check and the Pick screen's line alike (product question Q1, decided by the owner). It is the app's own hour, not the talk's: the talk's only clock anchors are "I didn't get up until 1130" (0:29) and "around 12 noon" (0:40). Code asks `isLate(t)` from `clock.ts`, or `lateAt(hour)` from `method.ts` in pure code; lint flags an hour compared with a literal anywhere else in `src/`. A late start with no missed days gets the milder late welcome (`src/App/Welcome.tsx`); missed days, late or not, get the full welcome back.
