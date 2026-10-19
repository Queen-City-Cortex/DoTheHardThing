import * as L from '../logic';
import { BREAK_LIMIT_MIN } from '../method';
import { fmt, t } from '../copy';

export function BlockView({ block, item, now, act }: { block: L.Block; item?: L.Item; now: number; act: (a: 'pause' | 'resume' | 'drift' | 'stop') => void }) {
  const paused = block.pausedAt != null;
  const away = paused ? now - block.pausedAt! : 0;
  const canPause = L.canPause(block);
  return (
    <section className="card center">
      <p className="eyebrow">{t('yourOneThing')}</p>
      <h1 className="item-title">{item?.text ?? t('block.fallback')}</h1>
      <div className={`block ${paused ? 'paused' : ''}`} role="timer" aria-live="off" style={{ ['--p' as string]: L.progress(block, now) }}>
        <div className="light" aria-hidden="true" />
        <span className="time">{L.formatMs(L.remainingMs(block, now))}</span>
        <span className="left">{t(paused ? 'block.holding' : 'block.left')}</span>
      </div>
      {paused ? (
        <p className="muted small">{fmt.pausedLine(Math.floor(away / 60000), BREAK_LIMIT_MIN)}</p>
      ) : (
        <p className="muted small">{t(block.drifts.length ? 'block.drifted' : 'block.focus')}{canPause && ` ${t('block.pauseHint')}`}</p>
      )}
      <div className="actions">
        {paused ? <button className="primary big" onClick={() => act('resume')}>{t('block.back')}</button>
          : <button className="primary big" onClick={() => act('drift')}>{t('block.comeBack')}</button>}
        {canPause && <button className="secondary" onClick={() => act('pause')}>{t('block.stepAway')}</button>}
        {!paused && !canPause && <p className="muted small">{t('block.pauseUsed')}</p>}
        <button className="link" onClick={() => act('stop')}>{t('block.end')}</button>
      </div>
    </section>
  );
}

// a count line with its number set apart (`<strong>23</strong> days you've done\u2026`); a line without a number stays plain