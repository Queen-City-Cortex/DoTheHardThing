[Architecture index](../architecture.md)

# The method's rules

`src/method.ts` is the one home for the method's numbers. `RULES` lists each rule with where it comes from: `talk` (the talk says it; `ref` is the transcript timestamp and `quote` a verbatim piece of that line), `reading` (the app's reading of a line in the talk) or `app` (the app's own addition). The named constants the app uses (`MAX_ITEMS`, `BLOCK_MIN`, `BLOCK_CHOICES`, `BREAK_LIMIT_MS` and the rest) are read from `RULES`, and lint flags a bare hour cutoff, block length, item count or minutes-as-milliseconds anywhere else in `src/`. `src/method.test.ts` has one test per rule that pins its numbers as literals next to the talk's line.

There are two late cutoffs on purpose until a product decision is made: `LATE_CUTOFFS.welcomeFraming` (11:00, the Welcome framing and the bad-day check) and `LATE_CUTOFFS.pickWarning` (12:00, the Pick screen's line). Code asks `isLate(t, cutoff)` from `clock.ts`. A compile-time check in `method.ts` fails `tsc -b` when they become one value (delete the `@ts-expect-error` line and merge them) and when that line is removed while they still differ.
