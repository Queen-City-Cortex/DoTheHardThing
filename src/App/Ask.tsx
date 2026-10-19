import { useEffect, useRef, useState } from 'react';
import * as L from '../logic';
import { t } from '../copy';
import type { CopyId } from '../copy';
import { Steps } from './Welcome';
import { Chip } from './Name';

export function Ask({ items, setItem, onBack, onDone }: { items: L.Item[]; setItem: (id: string, field: 'satisfied' | 'leverage', value: boolean) => void; onBack: () => void; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { // the next item's heading takes focus (the first item's is focused by the screen change)
    if (!mounted.current) { mounted.current = true; return; }
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [idx]);
  const it = items[idx];
  if (!it) return null;
  const yn = (f: 'satisfied' | 'leverage', q: CopyId) => (
    <div className="q"><p>{t(q)}</p>
      <div className="yn">
        <button className={it[f] === true ? 'on' : ''} onClick={() => setItem(it.id, f, true)}>{t('close.yes')}</button>
        <button className={it[f] === false ? 'on' : ''} onClick={() => setItem(it.id, f, false)}>{t('no')}</button>
      </div></div>
  );
  const last = idx === items.length - 1;
  return (
    <section className="card">
      <Steps n={items.length} at={idx} />
      <p className="eyebrow">{t('twoQuestions')}</p>
      <h1 className="item-title">{it.text} <Chip tags={it.tags} pushedCount={it.pushedCount} /></h1>
      {yn('satisfied', 'ask.satisfied')}
      {yn('leverage', 'ask.leverage')}
      <div className="actions sticky row">
        <button className="secondary" onClick={() => (idx ? setIdx(idx - 1) : onBack())}>{t('back')}</button>
        <button className="primary" disabled={!L.answered(it)} onClick={() => (last ? onDone() : setIdx(idx + 1))}>{t(last ? 'pick.eyebrow' : 'next')}</button>
      </div>
    </section>
  );
}
