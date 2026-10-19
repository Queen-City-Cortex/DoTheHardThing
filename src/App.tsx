import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as L from './logic';
import * as S from './state';
import { load, refresh, save, type Store } from './storage';
import { track } from './analytics';
import { askPermissionIfUnasked, notify, scheduleReminder } from './reminder';
import { now as clockNow } from './clock';
import { BRAND, t } from './copy';
import { Welcome } from './App/Welcome';
import { Name } from './App/Name';
import { Ask } from './App/Ask';
import { Pick } from './App/Pick';
import { BlockView } from './App/BlockView';
import { Close, Closed } from './App/Close';
import { Days } from './App/Days';
import { About } from './App/About';

// the screens live in src/App/; they are exported from here too, so `import { About } from './App'` keeps working
export { Welcome, Name, Ask, Pick, BlockView, Close, Closed, Days, About };

// the 120-day window goes through trimDays, so a done day that falls out still counts in the archive
const putDay = (s: Store, d: L.Day): Store => ({ ...s, ...L.putDay(s, d) });

// the screen state is one value (src/state.ts); every action reads the clock once, in send(), and the reducer gets it as `now`
// (the Pick late line is the one clock read at render time)
const step = (s: S.State, m: { action: S.Action; now: number }) => S.reduce(s, m.action, m.now);

export default function App() {
  const [store, setStore] = useState<Store>(() => load());
  // a block belongs to the day it started: an unfinished earlier day stays open until it is closed
  const [state, dispatch] = useReducer(step, null, () => S.init(store.days, clockNow()));
  const send = useCallback((action: S.Action) => dispatch({ action, now: clockNow() }), []);
  const day = S.dayOf(state);
  const { screen } = state;
  const under = S.base(state).screen;
  const history = store.days.filter((d) => d.date < day.date);
  const bad = useMemo(() => L.badDay(history, new Date(day.openedAt)), [store.days.length, day.date, day.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => { setStore((st) => putDay(st, day)); }, [day]);
  // move to the real today: keep the day being left (a finished day) in the store, then open today's record or a new one.
  // The reducer makes the move; this asks it the same question first, so the day is saved while it is still the open
  // day: after the move a merge would prefer the older stored copy
  const rollOver = useCallback((at: number) => {
    if (!L.shouldRollOver(day, under, at)) return;
    save(putDay(store, day), day.date);
    setStore((st) => putDay(st, day));
    dispatch({ action: { type: 'rollover', stored: store.days }, now: at });
  }, [day, under, store]);
  // the date can change while the app stays open (left open overnight, or backgrounded). A layout effect, so closing a
  // day carried past midnight (closeDay, then this) moves straight on to the real today before the browser paints Closed
  useLayoutEffect(() => {
    const check = () => rollOver(clockNow());
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const i = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', check);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', check); };
  }, [rollOver, screen]);
  useEffect(() => { setSaveFailed(!save(store, day.date)); }, [store, day.date]);
  // pull in what other tabs saved. This tab's open day stays as it is, unless another tab closed it meanwhile:
  // then that closed day is shown here too, instead of a stale copy (the reducer compares it with the open day)
  useEffect(() => {
    const pull = () => {
      setStore((s) => refresh(s, day.date));
      send({ type: 'otherTabClosed', theirs: load().days.find((d) => d.date === day.date) });
    };
    const visible = () => { if (document.visibilityState === 'visible') pull(); };
    window.addEventListener('focus', pull);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', pull); document.removeEventListener('visibilitychange', visible); };
  }, [day.date, send]);
  // after a screen change keyboard and screen-reader users land on the new screen's heading (the name steps focus their input instead),
  // so Tab and Enter work from the top of the screen. Not on the first load: nothing was navigated to.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (screen === 'name') return;
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [screen]);
  useEffect(() => { scheduleReminder(store.reminder); }, [store.reminder]);
  // anonymous counts only (see analytics.ts): reaching step 0, opening Your days. Each goes out once a day, and nothing from the day itself.
  useEffect(() => { if (screen === 'name') track('started'); else if (screen === 'days') track('opened_history'); }, [screen]);

  // timer: always recomputed from stored timestamps. The first tick on opening settles a block that ended while the app was closed.
  useEffect(() => { send({ type: 'tick' }); }, [send]);
  useEffect(() => {
    if (screen !== 'block') return;
    const tick = () => send({ type: 'tick' });
    const i = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', tick); };
  }, [screen, send]);
  // a block that reaches its target says so (only when settling completes it, never on End block)
  const last = useRef(state);
  useEffect(() => {
    if (S.completed(last.current, state)) notify(t('notify.title'), t('notify.body'));
    last.current = state;
  }, [state]);

  const open = (to: S.OverlayName) => send({ type: 'open', to });
  const back = () => send({ type: 'back' });
  const stepBack = () => send({ type: 'stepBack' });
  // counts read the store with the open day as it is right now, so a Yes or Not today shows at once
  const counted = L.putDay(store, day);
  const total = L.totalDone(counted.days, counted.archive);

  // one branch per screen: a screen added to State without one here is a compile error at never()
  const view = (s: S.State) => {
    switch (s.screen) {
      case 'welcome': return <Welcome bad={bad} onStart={() => send({ type: 'start' })} small={s.small} setSmall={(small) => send({ type: 'setSmall', small })} />;
      case 'name': return <Name day={s.day} history={history} today={s.day.date} opensAt={s.opensAt} upd={({ items }) => send({ type: 'editItems', items })} onBack={stepBack}
        onNext={() => send({ type: 'namingDone' })} />;
      case 'ask': return <Ask items={L.filled(s.day.items)} opensAt={s.opensAt} setItem={(id, field, value) => send({ type: 'answer', id, field, value })} onBack={stepBack} onDone={() => send({ type: 'askDone' })} />;
      case 'pick': return (
        <Pick day={s.day} small={s.small} upd={({ chosenId }) => send({ type: 'choose', id: chosenId })} onBack={stepBack} onStart={(min) => {
          askPermissionIfUnasked();
          send({ type: 'startBlock', min });
        }} />
      );
      case 'block': return <BlockView block={s.day.block} item={S.chosenItem(s.day)} now={s.now} act={(type) => send({ type })} />;
      case 'close': return <Close didIt={s.day.didIt} item={S.chosenItem(s.day)} total={total} onDays={() => open('days')}
        onAnswer={(didIt) => { send({ type: 'didIt', didIt }); if (didIt) track('finished'); }} onDone={() => send({ type: 'closeDay' })} />;
      // starting over replaces today's record whole; no other day is touched
      case 'closed': return <Closed didIt={s.day.didIt} onDays={() => open('days')} onStartOver={() => send({ type: 'startOver' })} />;
      case 'days': return <Days days={counted.days} archive={counted.archive} onBack={back} />;
      case 'about': return <About reminder={store.reminder} total={total} onDays={() => open('days')} setReminder={(r) => setStore((st) => ({ ...st, reminder: r }))} />;
      default: return S.never(s);
    }
  };

  return (
    <div className="app">
      <header className="top">
        <span className="brand">{BRAND}</span>
        {S.isOverlay(state) ? <button className="link" onClick={back}>{t('done')}</button> : <button className="link" onClick={() => open('about')}>{t('about')}</button>}
      </header>
      <main className="main">{view(state)}</main>
      {saveFailed && <p className="muted small save-note" role="status">{t('saveNote')}</p>}
    </div>
  );
}

