// The device clock. The only module that reads it; everything else takes `now` (ms) as an argument.
// A placeholder for now: the same Date.now() as before, in one place so a later change can swap it.
import { dayKey } from './logic';
import { lateAt, type LateCutoff } from './method';
export const now = (): number => Date.now();
/** Today's date key on this device, 'YYYY-MM-DD'. */
export const today = (): string => dayKey(new Date(now()));
/** True when the local hour of `t` is at or after the named late cutoff (LATE_CUTOFFS in src/method.ts, Q1). */
export const isLate = (t: number | Date, cutoff: LateCutoff): boolean => lateAt(new Date(t).getHours(), cutoff);
