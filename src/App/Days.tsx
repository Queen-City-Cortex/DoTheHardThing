import * as L from '../logic';
import { today } from '../clock';
import { fmt, t } from '../copy';
import { Tally } from './Close';

export function Days({ days, archive, onBack }: { days: L.Day[]; archive: L.Archive; onBack: () => void }) {
  const total = L.totalDone(days, archive);
  const ym = today().slice(0, 7);
  const entries = L.thisMonthEntries(days, ym);
  const earlier = L.earlierMonths(days, archive, ym);
  // a month from another year says which year
  const month = (m: string) => (m.slice(0, 4) === ym.slice(0, 4) ? L.monthLabel(m) : `${L.monthLabel(m)} ${m.slice(0, 4)}`);
  return (
    <section className="card">
      <p className="eyebrow">{t('yourDays')}</p>
      <h1>{t('days.hero')}</h1>
      {total === 0 ? (
        <p className="muted">{t('days.empty')}</p>
      ) : (
        <>
          <p className="muted">{t('days.only')}</p>
          <Tally line={fmt.daysCount(fmt.daysWord(total))} />
          {entries.length > 0 && (
            <>
              <p className="label">{fmt.monthLine(L.monthLabel(ym), fmt.daysWord(L.monthDone(days, archive, ym)))}</p>
              <ul className="dates" aria-label={L.monthLabel(ym)}>
                {entries.map((e) => <li key={e.date}><span className="d">{L.dayLabel(e.date)}</span><span className="t">{e.text}</span></li>)}
              </ul>
            </>
          )}
          {earlier.length > 0 && (
            <>
              <p className="label">{t('days.earlier')}</p>
              <ul className="months" aria-label={t('days.earlier')}>
                {earlier.map((m) => <li key={m.ym}><span>{month(m.ym)}</span><span>{fmt.daysWord(m.count)}</span></li>)}
              </ul>
            </>
          )}
        </>
      )}
      <div className="actions"><button className="secondary" onClick={onBack}>{t('back')}</button></div>
    </section>
  );
}
