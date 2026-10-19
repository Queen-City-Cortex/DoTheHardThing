import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from '../logic';
import { fmt, t } from '../copy';
import type { CopyId } from '../copy';
import { Steps } from './Welcome';

const uid = () => Math.random().toString(36).slice(2, 10);

const PHASES: { tag: L.Tag; title: CopyId; hint: CopyId }[] = [
  { tag: 'pushed', title: 'name.pushed', hint: 'name.pushed.hint' },
  { tag: 'risky', title: 'name.risky', hint: 'name.risky.hint' },
  { tag: 'anxious', title: 'name.anxious', hint: 'name.anxious.hint' },
];

export function Chip({ tags, pushedCount }: { tags: L.Tag[]; pushedCount: number }) {
  return <span className={`tag ${L.primaryTag(tags)}`}>{L.tagLabel(tags, pushedCount)}</span>;
}

export function Name({ day, history, today, upd, onBack, onNext }: { day: L.Day; history: L.Day[]; today: string; upd: (p: { items: L.Item[] }) => void; onBack: () => void; onNext: () => void }) {
  const lefts = useMemo(() => L.leftovers(history, today), [history.length, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const [phase, setPhase] = useState(0);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [phase]); // each name step opens on its input, so typing and Enter just work
  const items = L.filled(day.items);
  const P = PHASES[phase];
  // leftovers are offered, never carried: nothing comes along unless tapped
  const offering = phase === 0 && lefts.length > 0;
  const hint = t(offering ? 'name.leftovers' : P.hint);
  const has = (text: string) => items.some((i) => L.norm(i.text) === L.norm(text));
  // a leftover comes back with all its tags: added under the first, then tagged with the rest
  const bringIn = (l: { text: string; tags: L.Tag[]; pushedCount: number }) => {
    const id = uid();
    upd({ items: l.tags.reduce((xs, tag) => L.addItem(xs, l.text, tag, id, l.pushedCount), day.items) });
  };
  const remove = (text: string) => upd({ items: day.items.filter((i) => L.norm(i.text) !== L.norm(text)) });
  const toggle = (i: L.Item) => upd({ items: L.hasTag(i, P.tag) ? L.removeTag(day.items, i.id, P.tag) : L.addOrTag(day.items, i.text, P.tag, uid()).items });
  const full = !L.canAdd(day.items);
  const last = phase === 2;
  const pending = draft.trim() !== '';
  // add the draft under this step's tag; the same text already listed gains the tag instead of a copy.
  // Only a full list keeps the draft and blocks. True if nothing blocks moving on.
  const commit = () => {
    if (!pending) return true;
    const r = L.addOrTag(day.items, draft, P.tag, uid());
    if (r.outcome === 'full') { setNote(t('name.full')); return false; }
    if (r.outcome === 'added' || r.outcome === 'tagged') upd({ items: r.items });
    setDraft('');
    setNote(r.outcome === 'tagged' ? fmt.noteTagged(fmt.tag(P.tag))
      : r.outcome === 'already' && r.item ? fmt.noteAlready(L.tagLabel(r.item.tags, r.item.pushedCount)) : null);
    return true;
  };
  // the draft never follows into another step's tag
  const go = (n: number) => { setPhase(n); setDraft(''); setNote(null); };
  const next = () => { if (!commit()) return; if (last) onNext(); else go(phase + 1); };
  const canFinish = L.canContinue(day.items) || (pending && L.addOrTag(day.items, draft, P.tag, '').outcome === 'added');
  return (
    <section className="card">
      <Steps n={3} at={phase} />
      <p className="eyebrow">{t('name.eyebrow')}</p>
      <h1>{t(P.title)}</h1>
      <p className="muted">{hint}</p>
      {offering && (
        <div className="choices">
          {lefts.map((l) => (
            <button key={l.text} className={`choice ${has(l.text) ? 'on' : ''}`} aria-pressed={has(l.text)} disabled={!has(l.text) && full}
              onClick={() => (has(l.text) ? remove(l.text) : bringIn(l))}>
              <span>{l.text}</span><Chip tags={l.tags} pushedCount={l.pushedCount} />
            </button>
          ))}
        </div>
      )}
      <form className="adder" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <input ref={input} aria-label={t(P.title)} value={draft} disabled={full && !pending} placeholder={t(full ? 'name.placeholderFull' : offering ? 'name.placeholderNew' : 'name.placeholder')} enterKeyHint="done"
          onChange={(e) => { setDraft(e.target.value); setNote(null); }} />
        <button className="secondary" disabled={!pending}>{t('name.add')}</button>
      </form>
      {note && <p className="muted small" role="status">{note}</p>}
      {phase === 0 && items.length > 0 && (
        <ul className="plain">
          {L.guidedOrder(items).map((i) => (
            <li key={i.id}><span>{i.text}</span><span className="row-end"><Chip tags={i.tags} pushedCount={i.pushedCount} /><button className="icon" aria-label={fmt.remove(i.text)} onClick={() => remove(i.text)}>×</button></span></li>
          ))}
        </ul>
      )}
      {phase > 0 && items.length > 0 && (
        <>
          <p className="muted small">{t('name.listedTap')}</p>
          <div className="choices" role="group" aria-label={t('name.listed')}>
            {L.guidedOrder(items).map((i) => {
              const on = L.hasTag(i, P.tag);
              return (
                <button key={i.id} className={`choice ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(i)}>
                  <span>{i.text}</span><Chip tags={i.tags} pushedCount={i.pushedCount} />
                </button>
              );
            })}
          </div>
        </>
      )}
      {last && L.belowSuggested(day.items) && items.length > 0 && <p className="muted gentle">{t('name.fewer')}</p>}
      <div className="actions sticky row">
        <button className="secondary" onClick={() => (phase ? go(phase - 1) : onBack())}>{t('back')}</button>
        <button className="primary" disabled={last && !canFinish} onClick={next}>
          {t(last ? 'twoQuestions' : phase === 0 && !items.length && !pending ? 'name.skip' : 'next')}
        </button>
      </div>
    </section>
  );
}
