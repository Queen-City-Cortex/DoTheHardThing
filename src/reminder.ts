import { now } from './clock';
import { nextReminder, type Permission, type ReminderMode } from './logic';
const TAG = 'morning';
const OPTS = { body: 'Make some tea. Email can wait.', icon: '/pwa-192.png', tag: TAG };
let timer: ReturnType<typeof setTimeout> | undefined;
let gen = 0; // every call bumps this; work from an older call stops at its next check
let queue: Promise<void> = Promise.resolve(); // runs never interleave, so a stale one can't land after a newer cancel

type Trigger = new (t: number) => unknown;
const triggerCtor = () => (window as unknown as { TimestampTrigger?: Trigger }).TimestampTrigger;

/** 'trigger': the OS can fire a scheduled notification with the app closed. 'open-only': a timer, only while the app is open. */
export function reminderMode(): ReminderMode {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if ('TimestampTrigger' in window && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) return 'trigger';
  return 'open-only';
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try { return await navigator.serviceWorker?.getRegistration(); } catch { return undefined; }
}
async function closeTagged(reg: ServiceWorkerRegistration | undefined) {
  if (!reg || typeof reg.getNotifications !== 'function') return;
  try {
    const ns = await reg.getNotifications({ tag: TAG, includeTriggered: true } as GetNotificationOptions);
    ns.forEach((n) => n.close());
  } catch { /* not supported here */ }
}
const stopTimer = () => { clearTimeout(timer); timer = undefined; };

function armTimer(hhmm: string, reg: ServiceWorkerRegistration | undefined, g: number) {
  timer = setTimeout(async () => {
    if (g !== gen) return;
    try { if (reg) await reg.showNotification('Good morning', OPTS); else new Notification('Good morning', OPTS); } catch { /* ignore */ }
    if (g === gen) armTimer(hhmm, reg, g); // tomorrow, without closing the one just shown
  }, nextReminder(hhmm, new Date(now())).getTime() - now());
}

async function run(hhmm: string | null, g: number) {
  stopTimer();
  const reg = await registration();
  await closeTagged(reg);
  if (g !== gen) return;
  if (!hhmm || reminderMode() === 'unsupported' || Notification.permission !== 'granted') return;
  const Trigger = triggerCtor();
  if (reg && Trigger) {
    // one occurrence; the app re-schedules on every open
    try { await reg.showNotification('Good morning', { ...OPTS, showTrigger: new Trigger(nextReminder(hhmm, new Date(now())).getTime()) } as NotificationOptions); return; } catch { /* fall through */ }
    if (g !== gen) return;
  }
  armTimer(hhmm, reg, g);
}

/** Replace any pending reminder with one for `hhmm` (null = none). Never rejects. */
export function scheduleReminder(hhmm: string | null): Promise<void> {
  const g = ++gen;
  stopTimer();
  queue = queue.then(() => run(hhmm, g)).catch(() => {});
  return queue;
}
/** Cancel the timer and any scheduled or shown 'morning' notification. */
export function cancelReminder(): Promise<void> { return scheduleReminder(null); }

export async function notify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/pwa-192.png' }); else new Notification(title, { body });
  } catch { /* ignore */ }
}

export const readPermission = (): Permission => ('Notification' in window ? Notification.permission : 'denied');
/** Ask, then re-read the answer rather than trusting the return value. Never throws or rejects.
 *  Old Safari: requestPermission only takes a callback and can throw; the block starts regardless. */
export async function askPermission(): Promise<Permission> {
  try { await Promise.resolve(Notification.requestPermission()); } catch { /* old Safari or blocked: re-read below */ }
  return readPermission();
}
/** Ask only if the person has not answered yet (Pick, before the first block). Never throws; does not wait for the answer. */
export function askPermissionIfUnasked(): void {
  if ('Notification' in window && Notification.permission === 'default') void askPermission();
}
