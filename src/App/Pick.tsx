import { useState } from 'react';
import * as L from '../logic';
import { isLate, now as clockNow } from '../clock';
import { BLOCK_CHOICES, BLOCK_MIN, SMALL_BLOCK_DEFAULT } from '../method';
import { fmt, t } from '../copy';
import { Chip } from './Name';

// The late cutoff is LATE_CUTOFF in src/method.ts, the same hour the Welcome uses.
const hrs = (m: number) => (m % 60 ? `${(m / 60).toFixed(1).replace(/\.0$/, '')}h` : `${m / 60}h`).replace('1.5h', '1½h').replace('2.5h', '2½h');

export function Pick({ day, small, upd, onBack, onStart }: { day: L.Day; small: boolean; upd: (p: { chosenId: string }) => void; onBack: () => void; onStart: (min: number) => void }) {
  const list = L.pickOrder(day.items);
  const [min, setMin] = useState<number>(small ? SMALL_BLOCK_DEFAULT : BLOCK_MIN);
  const late = isLate(clockNow());
  if (!list.length) return (
    <section className="card">
      <h1>{t('none.hero')}</h1>
      <p className="muted">{t('none.useful')}</p>
      <blockquote>{t('guise')}<cite>{t('cite.tim')}</cite></blockquote>
      <div className="actions"><button className="primary" onClick={onBack}>{t('none.again')}</button></div>
    </section>
  );
  const opts = small ? BLOCK_CHOICES.small : BLOCK_CHOICES.full;
  return (
    <section className="card">
      <p className="eyebrow">{t('pick.eyebrow')}</p>
      <h1>{t('pick.hero')}</h1>
      <p className="muted">{t('pick.ten')}</p>
      <div className="choices">
        {list.map((i) => (
          <button key={i.id} className={`choice ${day.chosenId === i.id ? 'on' : ''}`} onClick={() => upd({ chosenId: i.id })}>
            <span>{i.text}</span><Chip tags={i.tags} pushedCount={i.pushedCount} />
          </button>
        ))}
      </div>
      <p className="eyebrow">{t('pick.howLong')}</p>
      <div className="seg" role="radiogroup" aria-label={t('pick.lengthLabel')}>
        {opts.map((m) => <button key={m} role="radio" aria-checked={min === m} className={min === m ? 'on' : ''} onClick={() => setMin(m)}>{hrs(m)}</button>)}
      </div>
      {small && <p className="muted small">{t('pick.smallNote')}</p>}
      <p className="muted small">{fmt.pickLine(small, late)}</p>
      <div className="actions sticky"><button className="primary" disabled={!L.validChoice(day.items, day.chosenId)} onClick={() => onStart(min)}>{t('pick.start')}</button></div>
    </section>
  );
}

// the buttons name the block action; the reducer applies it at the time send() reads