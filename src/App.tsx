import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from './logic';
import { load, refresh, save, type Store } from './storage';
import { track } from './analytics';
import { askPermission, askPermissionIfUnasked, cancelReminder, notify, readPermission, reminderMode, scheduleReminder } from './reminder';
import { now as clockNow, isLate, today } from './clock';
import { BLOCK_CHOICES, BLOCK_MIN, BREAK_LIMIT_MIN, SMALL_BLOCK_DEFAULT } from './method';
import { BRAND, TALK_URL, fmt, t } from './copy';

type Screen = 'welcome' | 'name' | 'ask' | 'pick' | 'block' | 'close' | 'closed' | 'about' | 'days';
// About and Your days open over the day's screen and go back to where they were opened from
const overlay = (s: Screen) => s === 'about' || s === 'days';
const uid = () => Math.random().toString(36).slice(2, 10);
// shown on About, one paragraph each: what stays on the device, what is counted (src/analytics.ts, worker/index.ts), Do Not Track, and the host's own visit count
const PRIVACY = [
  'What you write stays on this device and is never sent anywhere.',
  'We keep three anonymous tallies: days started, days finished, and history opened. Each is a plain count plus the country, with no name, number, cookie, or address attached.',
  'If your browser\u2019s Do Not Track setting is on, we keep no tallies at all.',
  'Our host, Cloudflare, counts page visits without cookies.',
];

function resumeScreen(d: L.Day): Screen {
  if (d.closed) return 'closed';
  if (d.block && d.block.endedAt == null) return 'block';
  if (d.block) return 'close';
  return 'welcome';
}
// the 120-day window goes through trimDays, so a done day that falls out still counts in the archive
const putDay = (s: Store, d: L.Day): Store => ({ ...s, ...L.putDay(s, d) });
// The late cutoffs live in LATE_CUTOFFS in src/method.ts: Welcome and Pick differ on purpose until PRODUCT QUESTION Q1 is decided.
const hrs = (m: number) => (m % 60 ? `${(m / 60).toFixed(1).replace(/\.0$/, '')}h` : `${m / 60}h`).replace('1.5h', '1½h').replace('2.5h', '2½h');

export default function App() {
  const [store, setStore] = useState<Store>(() => load());
  // a block belongs to the day it started: an unfinished earlier day stays open until it is closed
  const [day, setDay] = useState<L.Day>(() => L.activeDay(store.days, clockNow()).day ?? L.newDay(today(), clockNow()));
  const [screen, setScreen] = useState<Screen>(() => resumeScreen(day));
  // the screens under an open overlay, so Done goes back one step (About -> Your days -> Done -> About)
  const [stack, setStack] = useState<Screen[]>([]);
  const [now, setNow] = useState(clockNow());
  const history = store.days.filter((d) => d.date < day.date);
  const bad = useMemo(() => L.badDay(history, new Date(day.openedAt)), [store.days.length, day.date, day.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [small, setSmall] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => { setStore((st) => putDay(st, day)); }, [day]);
  // move to the real today: keep `from` (the finished day) in the store, then open today's record or a new one
  const rollOver = useCallback((from: L.Day) => {
    const date = today();
    const next = store.days.find((d) => d.date === date) ?? L.newDay(date, clockNow());
    // save `from` while it is still the open day: after this a merge would prefer the older stored copy
    save(putDay(store, from), from.date);
    setStore((st) => putDay(st, from));
    setDay(next);
    setSmall(false);
    if (overlay(screen)) setStack([resumeScreen(next)]); else setScreen(resumeScreen(next));
  }, [store, screen]);
  // the date can change while the app stays open (left open overnight, or backgrounded)
  useEffect(() => {
    const check = () => { if (L.shouldRollOver(day, screen, clockNow())) rollOver(day); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const i = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', check);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', check); };
  }, [day, screen, rollOver]);
  useEffect(() => { setSaveFailed(!save(store, day.date)); }, [store, day.date]);
  // pull in what other tabs saved. This tab's open day stays as it is, unless another tab closed it meanwhile:
  // then that closed day is shown here too, instead of a stale copy
  useEffect(() => {
    const pull = () => {
      setStore((s) => refresh(s, day.date));
      const theirs = load().days.find((d) => d.date === day.date);
      if (!theirs || !L.supersedes(theirs, day)) return;
      setDay(theirs);
      if (overlay(screen)) setStack(['closed']); else setScreen('closed');
    };
    const visible = () => { if (document.visibilityState === 'visible') pull(); };
    window.addEventListener('focus', pull);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', pull); document.removeEventListener('visibilitychange', visible); };
  }, [day, screen]);
  // after a screen change keyboard and screen-reader users land on the new screen's heading (the name steps focus their input instead),
  // so Tab and Enter work from the top of the screen. Not on the first load: nothing was navigated to.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (screen === 'name') return;
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [screen]);
  // leaving the overlays forgets where they were opened from
  useEffect(() => { if (!overlay(screen)) setStack([]); }, [screen]);
  useEffect(() => { scheduleReminder(store.reminder); }, [store.reminder]);
  // anonymous counts only (see analytics.ts): reaching step 0, opening Your days. Each goes out once a day, and nothing from the day itself.
  useEffect(() => { if (screen === 'name') track('started'); else if (screen === 'days') track('opened_history'); }, [screen]);

  // timer: always recomputed from stored timestamps
  useEffect(() => {
    if (screen !== 'block') return;
    const tick = () => setNow(clockNow());
    const i = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', tick); };
  }, [screen]);
  useEffect(() => {
    if (!day.block || day.block.endedAt != null) return;
    const s = L.settle(day.block, now);
    if (s !== day.block) {
      setDay((d) => ({ ...d, block: s, gotBlock: L.autoGotBlock(s, now, d.gotBlock) }));
      if (s.endReason === 'complete') notify('Your block is done', 'Whenever you are ready, close the day.');
      setScreen('close');
    }
  }, [now, day.block]);
  // a stopped or broken block (or none at all) never leaves us on the block screen
  useEffect(() => {
    const s = L.screenForBlock(screen, day.block);
    if (s !== screen) setScreen(s);
  }, [screen, day.block]);

  // before a block starts, drop a choice that is no longer in the pick list
  const withItems = (d: L.Day, items: L.Item[]): L.Day => ({ ...d, items, chosenId: d.block ? d.chosenId : L.validChoice(items, d.chosenId) });
  const upd = (p: Partial<L.Day>) => setDay((d) => { const n = { ...d, ...p }; return p.items ? withItems(n, p.items) : n; });
  const setItem = (id: string, p: Partial<L.Item>) => setDay((d) => withItems(d, d.items.map((i) => (i.id === id ? { ...i, ...p } : i))));
  const chosen = day.items.find((i) => i.id === day.chosenId);
  const open = (s: Screen) => { setStack([...stack, screen]); setScreen(s); };
  const back = () => { setScreen(stack[stack.length - 1] ?? resumeScreen(day)); setStack(stack.slice(0, -1)); };
  // counts read the store with the open day as it is right now, so a Yes or Not today shows at once
  const counted = L.putDay(store, day);
  const total = L.totalDone(counted.days, counted.archive);

  return (
    <div className="app">
      <header className="top">
        <span className="brand">{BRAND}</span>
        {overlay(screen) ? <button className="link" onClick={back}>Done</button> : <button className="link" onClick={() => open('about')}>About</button>}
      </header>
      <main className="main">
        {screen === 'welcome' && <Welcome bad={bad} onStart={() => setScreen('name')} small={small} setSmall={setSmall} />}
        {screen === 'name' && <Name day={day} history={history} today={day.date} upd={upd} onBack={() => setScreen('welcome')}
          onNext={() => { setDay((d) => withItems(d, L.guidedOrder(L.filled(d.items)))); setScreen('ask'); }} />}
        {screen === 'ask' && <Ask items={L.filled(day.items)} setItem={setItem} onBack={() => setScreen('name')} onDone={() => setScreen('pick')} />}
        {screen === 'pick' && (
          <Pick day={day} small={small} upd={upd} onBack={() => setScreen('ask')} onStart={async (min) => {
            askPermissionIfUnasked();
            const t = clockNow(); setNow(t); upd({ block: L.startBlock(min, t, small), gotBlock: null }); setScreen('block');
          }} />
        )}
        {screen === 'block' && day.block && <BlockView block={day.block} item={chosen} now={now} set={(b) => { const t = clockNow(); setNow(t); setDay((d) => ({ ...d, block: b, gotBlock: L.autoGotBlock(b, t, d.gotBlock) })); }} />}
        {screen === 'close' && <Close didIt={day.didIt} item={chosen} total={total} onDays={() => open('days')}
          onAnswer={(didIt) => { upd({ didIt, doneText: didIt ? chosen?.text ?? null : null }); if (didIt) track('finished'); }} onDone={() => {
            // closing a day carried past midnight moves straight on to the real today
            const closed = { ...day, closed: true };
            if (L.shouldRollOver(closed, 'closed', clockNow())) rollOver(closed); else { setDay(closed); setScreen('closed'); }
          }} />}
        {/* starting over replaces today's record whole; no other day is touched */}
        {screen === 'closed' && <Closed didIt={day.didIt} onDays={() => open('days')} onStartOver={() => { setDay(L.newDay(today(), clockNow())); setSmall(false); setScreen('welcome'); }} />}
        {screen === 'days' && <Days days={counted.days} archive={counted.archive} onBack={back} />}
        {screen === 'about' && <About reminder={store.reminder} total={total} onDays={() => open('days')} setReminder={(r) => setStore((s) => ({ ...s, reminder: r }))} />}
      </main>
      {saveFailed && <p className="muted small save-note" role="status">Progress will not be saved on this device.</p>}
    </div>
  );
}

function Steps({ n, at }: { n: number; at: number }) {
  return <div className="steps" role="img" aria-label={`Step ${at + 1} of ${n}`}>{Array.from({ length: n }, (_, i) => <i key={i} className={i === at ? 'on' : i < at ? 'done' : ''} />)}</div>;
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
  if (bad.firstVisit && !bad.bad) return <FirstWelcome onStart={onStart} />;
  return (
    <section className="card">
      <p className="eyebrow">{eyebrow}</p>
      {bad.bad ? (
        <>
          <h1 className="hero">{t('bad.hero')}</h1>
          <p className="muted">{t(bad.missedDays > 0 ? 'bad.missed' : 'bad.late')} {t('bad.everybody')}</p>
          <blockquote>&ldquo;{t('bad.vonnegut')}&rdquo;<cite>{t('bad.vonnegut.cite')}</cite></blockquote>
          <p className="muted">{t('bad.notAlone')}</p>
          {hourLine}
          <label className="toggle"><input type="checkbox" checked={small} onChange={(e) => setSmall(e.target.checked)} /> <span>{t('bad.shorter')}</span></label>
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

const PHASES: { tag: L.Tag; title: string; hint: string }[] = [
  { tag: 'pushed', title: 'What have you been putting off?', hint: 'The thing you keep moving to tomorrow. Write it plainly.' },
  { tag: 'risky', title: 'What could get you rejected, or start a conflict?', hint: 'Most important usually means most uncomfortable, very often with some chance of rejection or conflict.' },
  { tag: 'anxious', title: 'What else is making you anxious?', hint: 'Whatever else makes you most anxious or uncomfortable.' },
];

function Chip({ tags, pushedCount }: { tags: L.Tag[]; pushedCount: number }) {
  return <span className={`tag ${L.primaryTag(tags)}`}>{L.tagLabel(tags, pushedCount)}</span>;
}

function Name({ day, history, today, upd, onBack, onNext }: { day: L.Day; history: L.Day[]; today: string; upd: (p: Partial<L.Day>) => void; onBack: () => void; onNext: () => void }) {
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
  const hint = offering ? 'From yesterday, still open. Tap what still matters. The rest stays behind, and nothing comes along unless you choose it.' : P.hint;
  const has = (t: string) => items.some((i) => L.norm(i.text) === L.norm(t));
  // a leftover comes back with all its tags: added under the first, then tagged with the rest
  const bringIn = (l: { text: string; tags: L.Tag[]; pushedCount: number }) => {
    const id = uid();
    upd({ items: l.tags.reduce((xs, t) => L.addItem(xs, l.text, t, id, l.pushedCount), day.items) });
  };
  const remove = (t: string) => upd({ items: day.items.filter((i) => L.norm(i.text) !== L.norm(t)) });
  const toggle = (i: L.Item) => upd({ items: L.hasTag(i, P.tag) ? L.removeTag(day.items, i.id, P.tag) : L.addOrTag(day.items, i.text, P.tag, uid()).items });
  const full = !L.canAdd(day.items);
  const last = phase === 2;
  const pending = draft.trim() !== '';
  // add the draft under this step's tag; the same text already listed gains the tag instead of a copy.
  // Only a full list keeps the draft and blocks. True if nothing blocks moving on.
  const commit = () => {
    if (!pending) return true;
    const r = L.addOrTag(day.items, draft, P.tag, uid());
    if (r.outcome === 'full') { setNote('Five is the limit.'); return false; }
    if (r.outcome === 'added' || r.outcome === 'tagged') upd({ items: r.items });
    setDraft('');
    setNote(r.outcome === 'tagged' ? `That one's already on your list. Marked ${P.tag} too.`
      : r.outcome === 'already' && r.item ? `That one's already on your list as ${L.tagLabel(r.item.tags, r.item.pushedCount)}.` : null);
    return true;
  };
  // the draft never follows into another step's tag
  const go = (n: number) => { setPhase(n); setDraft(''); setNote(null); };
  const next = () => { if (!commit()) return; if (last) onNext(); else go(phase + 1); };
  const canFinish = L.canContinue(day.items) || (pending && L.addOrTag(day.items, draft, P.tag, '').outcome === 'added');
  return (
    <section className="card">
      <Steps n={3} at={phase} />
      <p className="eyebrow">Name the discomfort</p>
      <h1>{P.title}</h1>
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
        <input ref={input} aria-label={P.title} value={draft} disabled={full && !pending} placeholder={full ? 'Five is the limit' : offering ? 'Or write something new' : 'Write it plainly'} enterKeyHint="done"
          onChange={(e) => { setDraft(e.target.value); setNote(null); }} />
        <button className="secondary" disabled={!pending}>Add</button>
      </form>
      {note && <p className="muted small" role="status">{note}</p>}
      {phase === 0 && items.length > 0 && (
        <ul className="plain">
          {L.guidedOrder(items).map((i) => (
            <li key={i.id}><span>{i.text}</span><span className="row-end"><Chip tags={i.tags} pushedCount={i.pushedCount} /><button className="icon" aria-label={`Remove ${i.text}`} onClick={() => remove(i.text)}>×</button></span></li>
          ))}
        </ul>
      )}
      {phase > 0 && items.length > 0 && (
        <>
          <p className="muted small">Already on your list. Tap one if it fits here too.</p>
          <div className="choices" role="group" aria-label="Already on your list">
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
      {last && L.belowSuggested(day.items) && items.length > 0 && <p className="muted gentle">Three to five usually helps, but fewer is fine if that's honest.</p>}
      <div className="actions sticky row">
        <button className="secondary" onClick={() => (phase ? go(phase - 1) : onBack())}>Back</button>
        <button className="primary" disabled={last && !canFinish} onClick={next}>
          {last ? 'Two questions' : phase === 0 && !items.length && !pending ? 'Skip' : 'Next'}
        </button>
      </div>
    </section>
  );
}

function Ask({ items, setItem, onBack, onDone }: { items: L.Item[]; setItem: (id: string, p: Partial<L.Item>) => void; onBack: () => void; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { // the next item's heading takes focus (the first item's is focused by the screen change)
    if (!mounted.current) { mounted.current = true; return; }
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [idx]);
  const t = items[idx];
  if (!t) return null;
  const yn = (f: 'satisfied' | 'leverage', q: string) => (
    <div className="q"><p>{q}</p>
      <div className="yn">
        <button className={t[f] === true ? 'on' : ''} onClick={() => setItem(t.id, { [f]: true })}>Yes</button>
        <button className={t[f] === false ? 'on' : ''} onClick={() => setItem(t.id, { [f]: false })}>No</button>
      </div></div>
  );
  const last = idx === items.length - 1;
  return (
    <section className="card">
      <Steps n={items.length} at={idx} />
      <p className="eyebrow">Two questions</p>
      <h1 className="item-title">{t.text} <Chip tags={t.tags} pushedCount={t.pushedCount} /></h1>
      {yn('satisfied', 'If this were the only thing I accomplished today, would I be satisfied with my day?')}
      {yn('leverage', 'Will moving this forward make all the other to-dos unimportant or easier to knock off later?')}
      <div className="actions sticky row">
        <button className="secondary" onClick={() => (idx ? setIdx(idx - 1) : onBack())}>Back</button>
        <button className="primary" disabled={!L.answered(t)} onClick={() => (last ? onDone() : setIdx(idx + 1))}>{last ? 'Pick one' : 'Next'}</button>
      </div>
    </section>
  );
}

export function Pick({ day, small, upd, onBack, onStart }: { day: L.Day; small: boolean; upd: (p: Partial<L.Day>) => void; onBack: () => void; onStart: (min: number) => void }) {
  const list = L.pickOrder(day.items);
  const [min, setMin] = useState<number>(small ? SMALL_BLOCK_DEFAULT : BLOCK_MIN);
  const late = isLate(clockNow(), 'pickWarning');
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

function BlockView({ block, item, now, set }: { block: L.Block; item?: L.Item; now: number; set: (b: L.Block) => void }) {
  const paused = block.pausedAt != null;
  const away = paused ? now - block.pausedAt! : 0;
  const canPause = L.canPause(block);
  return (
    <section className="card center">
      <p className="eyebrow">Your one thing</p>
      <h1 className="item-title">{item?.text ?? 'The one thing'}</h1>
      <div className={`block ${paused ? 'paused' : ''}`} role="timer" aria-live="off" style={{ ['--p' as string]: L.progress(block, now) }}>
        <div className="light" aria-hidden="true" />
        <span className="time">{L.formatMs(L.remainingMs(block, now))}</span>
        <span className="left">{paused ? 'holding' : 'left in the block'}</span>
      </div>
      {paused ? (
        <p className="muted small">Stepped away {Math.floor(away / 60000)} min. Back within {BREAK_LIMIT_MIN} to keep it one block. You get one pause per block.</p>
      ) : (
        <p className="muted small">{block.drifts.length ? 'You came back. No need to spiral.' : 'No email, no social. Just this.'}{canPause && ' One short pause if you must, then back.'}</p>
      )}
      <div className="actions">
        {paused ? <button className="primary big" onClick={() => set(L.resume(block, clockNow()))}>I'm back</button>
          : <button className="primary big" onClick={() => set(L.drift(block, clockNow()))}>Gently come back to your one to-do</button>}
        {canPause && <button className="secondary" onClick={() => set(L.pause(block, clockNow()))}>Step away briefly</button>}
        {!paused && !canPause && <p className="muted small">Your one pause is used.</p>}
        <button className="link" onClick={() => set(L.stop(block, clockNow()))}>End block</button>
      </div>
    </section>
  );
}

// a count line with its number set apart (`<strong>23</strong> days you've done\u2026`); a line without a number stays plain
function Tally({ line }: { line: string }) {
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
function Days({ days, archive, onBack }: { days: L.Day[]; archive: L.Archive; onBack: () => void }) {
  const total = L.totalDone(days, archive);
  const ym = today().slice(0, 7);
  const entries = L.thisMonthEntries(days, ym);
  const earlier = L.earlierMonths(days, archive, ym);
  // a month from another year says which year
  const month = (m: string) => (m.slice(0, 4) === ym.slice(0, 4) ? L.monthLabel(m) : `${L.monthLabel(m)} ${m.slice(0, 4)}`);
  return (
    <section className="card">
      <p className="eyebrow">Your days</p>
      <h1>Days you did your one thing</h1>
      {total === 0 ? (
        <p className="muted">Nothing here yet. The first day you answer Yes will appear on this page, with its date and the one thing you did.</p>
      ) : (
        <>
          <p className="muted">Only the days you did it are listed. Other days add nothing and need nothing.</p>
          <Tally line={`${L.daysWord(total)} since you started`} />
          {entries.length > 0 && (
            <>
              <p className="label">{L.monthLabel(ym)} &middot; {L.daysWord(L.monthDone(days, archive, ym))}</p>
              <ul className="dates" aria-label={L.monthLabel(ym)}>
                {entries.map((e) => <li key={e.date}><span className="d">{L.dayLabel(e.date)}</span><span className="t">{e.text}</span></li>)}
              </ul>
            </>
          )}
          {earlier.length > 0 && (
            <>
              <p className="label">Earlier</p>
              <ul className="months" aria-label="Earlier">
                {earlier.map((m) => <li key={m.ym}><span>{month(m.ym)}</span><span>{L.daysWord(m.count)}</span></li>)}
              </ul>
            </>
          )}
        </>
      )}
      <div className="actions"><button className="secondary" onClick={onBack}>Back</button></div>
    </section>
  );
}

function About({ reminder, total, onDays, setReminder }: { reminder: string | null; total: number; onDays: () => void; setReminder: (r: string | null) => void }) {
  const mode = reminderMode();
  // read on every render; permission can change in browser settings while the app is open, so refresh on focus
  const permission = readPermission();
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const status = L.reminderStatus(mode, permission, reminder);
  const off = () => { setReminder(null); cancelReminder(); };
  return (
    <section className="card">
      <h1>About</h1>
      <p className="muted">Tim Ferriss's morning method for efficacy, doing the right thing, rather than efficiency: his eight steps, condensed to three. Name what's uncomfortable, pick one thing, protect one block.</p>
      <blockquote>Being busy is a form of laziness.<cite>Tim Ferriss</cite></blockquote>
      <blockquote>{t('guise')}<cite>{t('cite.tim')}</cite></blockquote>
      <p className="muted">Method by Tim Ferriss. <a href={TALK_URL} target="_blank" rel="noreferrer">{t('talk.link')}</a>.</p>
      <p className="muted small">An independent app based on Tim Ferriss's method. Not affiliated with or endorsed by him.</p>
      {/* the count only once there is one: never a zero */}
      <button className="row-link" aria-label="Your days" onClick={onDays}><span>Your days</span><span>{total > 0 ? `${total} ›` : '›'}</span></button>
      <hr className="rule" />
      <p className="eyebrow">Morning reminder</p>
      {mode !== 'unsupported' && (
        <div className="adder">
          <input type="time" aria-label="Reminder time" value={status.active && reminder ? reminder : ''} disabled={permission === 'denied'} onChange={async (e) => {
            const v = e.target.value || null;
            if (!v) { off(); return; }
            const p = readPermission() === 'default' ? await askPermission() : readPermission();
            setTick((t) => t + 1);
            // only a granted permission saves a time; anything else leaves the reminder unset
            if (p === 'granted') setReminder(v);
          }} />
          {status.active && <button className="secondary" onClick={off}>Off</button>}
        </div>
      )}
      <p className="muted small" role="status">{status.message}</p>
      <div id="privacy">{PRIVACY.map((t) => <p key={t} className="muted small">{t}</p>)}</div>
      <p className="muted small">Free and works offline.</p>
    </section>
  );
}
