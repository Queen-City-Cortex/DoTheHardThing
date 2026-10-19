// The reminder part of src/logic.ts, moved out to keep that file small; src/logic.ts re-exports it, so `import { nextReminder } from './logic'`
// still works. Pure like logic.ts: no DOM, and its only import is the copy.
import { fmt, t } from '../copy';

// ---------- reminder ----------
/** Next occurrence of HH:MM local after `now`. */
export function nextReminder(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now); d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}
export type ReminderMode = 'unsupported' | 'trigger' | 'open-only';
export type Permission = 'default' | 'granted' | 'denied';
/** What the reminder control can honestly say: `active` only when a reminder will actually be scheduled. */
export function reminderStatus(mode: ReminderMode, permission: Permission, reminder: string | null): { active: boolean; message: string } {
  if (mode === 'unsupported') return { active: false, message: t('reminder.unsupported') };
  if (permission === 'denied') return { active: false, message: t('reminder.denied') };
  if (permission !== 'granted') return { active: false, message: t('reminder.ask') };
  if (!reminder) return { active: false, message: t('reminder.allowed') };
  return { active: true, message: fmt.reminderSet(reminder, mode === 'trigger') };
}
