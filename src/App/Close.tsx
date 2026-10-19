import { useState } from 'react';
import * as L from '../logic';
import { fmt, t } from '../copy';

export function Tally({ line }: { line: string }) {
  const m = /^(\d+) (.*)$/.exec(line);
  return <p className="tally">{m ? <><strong>{m[1]}</strong> <span>{m[2]}</span></> : <span>{line}</span>}</p>;
}
const SeeDays = ({ onDays }: { onDays: () => void }) => <p className="muted small"><button className="link flush" onClick={onDays}>{t('seeDays')}</button></p>;

// the user's own answer, whatever the block did; a missed day adds nothing and nothing here says how long the block ran
export function Close({ didIt, item, total, onAnswer, onDays, onDone }: { didIt: boolean | null; item?: L.Item; total: number; onAnswer: (didIt: boolean) => void; onDays: () => void; onDone: () => void }) {
  const { note, count } = L.closeLines(didIt, total);
  return (
    <section className="card">
      <p className="eyebrow">{t('close.eyebrow')}</p>
      <h1>{t('close.hero')}</h1>
      <p className="muted">{item ? fmt.closeItem(item.text) : t('close.noItem')}</p>
      <div className="yn">
        <button className={didIt === true ? 'on' : ''} onClick={() => onAnswer(true)}>{t('close.yes')}</button>
        <button className={didIt === false ? 'on' : ''} onClick={() => onAnswer(false)}>{t('close.notToday')}</button>
      </div>
      {note && (
        <>
          <p className="note">{note}</p>
          <hr className="rule" />
          {count && <Tally line={count} />}
          <SeeDays onDays={onDays} />
        </>
      )}
      <div className="actions"><button className="primary" disabled={didIt === null} onClick={onDone}>{t('close.today')}</button></div>
    </section>
  );
}

export function Closed({ didIt, onDays, onStartOver }: { didIt: boolean | null; onDays: () => void; onStartOver: () => void }) {
  // starting over wipes today's list and block, so it takes a second, explicit tap
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="card">
      <p className="eyebrow">{t('closed.eyebrow')}</p>
      <h1>{t(didIt ? 'closed.done' : 'closed.fresh')}</h1>
      <p className="muted">{t('closed.slide')}</p>
      {didIt === false && <p className="muted">{t('closed.noStreaks')}</p>}
      <SeeDays onDays={onDays} />
      {confirming ? (
        <div className="actions" role="group" aria-label={t('closed.overGroup')}>
          <p className="muted small" role="status">{t('closed.overAsk')}</p>
          <button className="secondary" autoFocus onClick={onStartOver}>{t('closed.overYes')}</button>
          <button className="link" onClick={() => setConfirming(false)}>{t('closed.keep')}</button>
        </div>
      ) : (
        <div className="actions"><button className="secondary" onClick={() => setConfirming(true)}>{t('closed.overGroup')}</button></div>
      )}
    </section>
  );
}

// only done days are listed and counted; a missed day leaves no row, and no zero is ever shown