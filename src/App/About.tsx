import { useEffect, useState } from 'react';
import * as L from '../logic';
import { askPermission, cancelReminder, readPermission, reminderMode } from '../reminder';
import { TALK_URL, fmt, t } from '../copy';
import type { CopyId } from '../copy';

// shown on About, one paragraph each: what stays on the device, what is counted (src/analytics.ts, worker/index.ts), Do Not Track, and the host's own visit count
const PRIVACY = ['privacy.device', 'privacy.tallies', 'privacy.dnt', 'privacy.host'] as const satisfies readonly CopyId[];

export function About({ reminder, total, onDays, setReminder }: { reminder: string | null; total: number; onDays: () => void; setReminder: (r: string | null) => void }) {
  const mode = reminderMode();
  // read on every render; permission can change in browser settings while the app is open, so refresh on focus
  const permission = readPermission();
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const status = L.reminderStatus(mode, permission, reminder);
  const off = () => { setReminder(null); cancelReminder(); };
  return (
    <section className="card">
      <h1>{t('about')}</h1>
      <p className="muted">{t('about.intro')}</p>
      <blockquote>{t('about.busy')}<cite>{t('cite.tim')}</cite></blockquote>
      <blockquote>{t('guise')}<cite>{t('cite.tim')}</cite></blockquote>
      <p className="muted">{t('about.method')} <a href={TALK_URL} target="_blank" rel="noreferrer">{t('talk.link')}</a>.</p>
      <p className="muted small">{t('about.independent')}</p>
      {/* the count only once there is one: never a zero */}
      <button className="row-link" aria-label={t('yourDays')} onClick={onDays}><span>{t('yourDays')}</span><span>{fmt.daysLink(total)}</span></button>
      <hr className="rule" />
      <p className="eyebrow">{t('about.reminder')}</p>
      {mode !== 'unsupported' && (
        <div className="adder">
          <input type="time" aria-label={t('about.time')} value={status.active && reminder ? reminder : ''} disabled={permission === 'denied'} onChange={async (e) => {
            const v = e.target.value || null;
            if (!v) { off(); return; }
            const p = readPermission() === 'default' ? await askPermission() : readPermission();
            setTick((n) => n + 1);
            // only a granted permission saves a time; anything else leaves the reminder unset
            if (p === 'granted') setReminder(v);
          }} />
          {status.active && <button className="secondary" onClick={off}>{t('about.off')}</button>}
        </div>
      )}
      <p className="muted small" role="status">{status.message}</p>
      <div id="privacy">{PRIVACY.map((id) => <p key={id} className="muted small">{t(id)}</p>)}</div>
      <p className="muted small">{t('about.free')}</p>
    </section>
  );
}