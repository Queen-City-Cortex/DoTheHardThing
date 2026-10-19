import * as L from '../logic';
import { TALK_URL, fmt, t } from '../copy';

export function Steps({ n, at }: { n: number; at: number }) {
  return <div className="steps" role="img" aria-label={fmt.steps(at + 1, n)}>{Array.from({ length: n }, (_, i) => <i key={i} className={i === at ? 'on' : i < at ? 'done' : ''} />)}</div>;
}

// the first-ever visit: the whole method on one screen. Returning variants below are unchanged.
const HOW = [['first.step1', 'first.step1.d'], ['first.step2', 'first.step2.d'], ['first.step3', 'first.step3.d']] as const;
function FirstWelcome({ onStart }: { onStart: () => void }) {
  return (
    <section className="card welcome">
      <p className="eyebrow">{t('first.eyebrow')}</p>
      <h1 className="hero promise">{t('first.hero')}</h1>
      <ol className="how">
        {HOW.map(([s, d], i) => <li key={t(s)}><span className="n" aria-hidden="true">{i + 1}</span><div><b>{t(s)}</b><span className="d">{t(d)}</span></div></li>)}
      </ol>
      <p className="src">{t('first.source')}<br /><a href={TALK_URL} target="_blank" rel="noreferrer">{t('talk.link')}</a></p>
      <div className="cta">
        <button className="primary big" onClick={onStart}>{t('first.start')}</button>
        <p className="hour">{t('welcome.hour')}</p>
        <p className="assure">{t('first.assure')}</p>
      </div>
    </section>
  );
}

export function Welcome({ bad, onStart, small, setSmall }: { bad: L.BadDay; onStart: () => void; small: boolean; setSmall: (b: boolean) => void }) {
  const { eyebrow, showHourLine } = L.welcomeFraming(bad);
  const hourLine = showHourLine && <p className="muted small">{t('welcome.hour')}</p>;
  const shorter = <label className="toggle"><input type="checkbox" checked={small} onChange={(e) => setSmall(e.target.checked)} /> <span>{t('bad.shorter')}</span></label>;
  if (bad.firstVisit && !bad.bad) return <FirstWelcome onStart={onStart} />;
  // late with no missed days: a milder welcome, the late line as its heading and the shorter block still offered.
  // The welcome back and its talk lines are for missed days only.
  const lateOnly = bad.bad && bad.late && bad.missedDays === 0;
  return (
    <section className="card">
      <p className="eyebrow">{eyebrow}</p>
      {lateOnly ? (
        <>
          <h1 className="hero">{t('bad.late')}</h1>
          {shorter}
        </>
      ) : bad.bad ? (
        <>
          <h1 className="hero">{t('bad.hero')}</h1>
          <p className="muted">{t('bad.missed')} {t('bad.everybody')}</p>
          <blockquote>&ldquo;{t('bad.vonnegut')}&rdquo;<cite>{t('bad.vonnegut.cite')}</cite></blockquote>
          <p className="muted">{t('bad.notAlone')}</p>
          {hourLine}
          {shorter}
        </>
      ) : (
        <>
          <h1 className="hero">{t('morning.hero')}</h1>
          <p className="muted">{t('morning.email')} {t('morning.takes')}</p>
          {hourLine}
        </>
      )}
      <div className="actions"><button className="primary" onClick={onStart}>{t('welcome.ready')}</button></div>
    </section>
  );
}
