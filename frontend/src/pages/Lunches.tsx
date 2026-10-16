import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import {
  addDays,
  dayOfMonth,
  endOfMonth,
  formatCutoff,
  formatDayMonth,
  isoWeekNumber,
  mondayOf,
  todayPrague,
  TZ,
  weekdayLong,
  weekdayShort,
} from '../dates';
import { ErrorState, firstName, Segmented, Skeleton, type Answer } from '../components';
import { Icon } from '../icons';
import { InstallBanner } from '../installGuide';
import { useToast } from '../toast';
import type { Day, Me } from '../types';

const WEEKS = 5;

interface Week {
  monday: string;
  days: Day[];
}

function weekTitle(monday: string, thisMonday: string): string {
  if (monday === thisMonday) return 'Tento týden';
  if (monday === addDays(thisMonday, 7)) return 'Příští týden';
  return `${isoWeekNumber(monday)}. týden`;
}

function weekRange(monday: string): string {
  const friday = addDays(monday, 4);
  const end = formatDayMonth(friday);
  return monday.slice(5, 7) === friday.slice(5, 7) ? `${dayOfMonth(monday)}.–${end}` : `${formatDayMonth(monday)} – ${end}`;
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour < 10) return 'Dobré ráno';
  if (hour < 18) return 'Dobrý den';
  return 'Dobrý večer';
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

export default function LunchesPage({ me }: { me: Me }) {
  const toast = useToast();
  const today = todayPrague();
  const thisMonday = mondayOf(today);
  const from = today;
  const to = addDays(thisMonday, WEEKS * 7 - 1);

  const [days, setDays] = useState<Day[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const highlight = useMemo(() => new URLSearchParams(window.location.search).get('date'), []);
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ days: Day[] }>(`/calendar?from=${from}&to=${to}`);
      setDays(res.days);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when the app comes back to the foreground (e.g. after answering from a notification).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (!days || !highlight || scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(() => {
      document.getElementById(`day-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [days, highlight]);

  const weeks = useMemo<Week[]>(() => {
    if (!days) return [];
    const byWeek = new Map<string, Day[]>();
    for (const d of days) {
      if (!d.cooking && !d.isOverride) continue; // regular non-cooking day
      const m = mondayOf(d.date);
      if (!byWeek.has(m)) byWeek.set(m, []);
      byWeek.get(m)!.push(d);
    }
    return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, ds]) => ({ monday, days: ds }));
  }, [days]);

  const cookingDays = useMemo(() => days?.filter((d) => d.cooking) ?? [], [days]);
  const answered = cookingDays.filter((d) => d.attending !== null).length;
  const next = cookingDays[0] ?? null;

  const setAnswer = async (date: string, attending: Answer) => {
    const prev = days?.find((d) => d.date === date);
    if (!prev) return;
    setDays((ds) => ds?.map((d) => (d.date === date ? { ...d, attending } : d)) ?? ds);
    try {
      const updated = await api<Day>(`/responses/${date}`, { method: 'PUT', body: { attending } });
      setDays((ds) => ds?.map((d) => (d.date === date ? updated : d)) ?? ds);
    } catch (e) {
      setDays((ds) => ds?.map((d) => (d.date === date ? prev : d)) ?? ds);
      toast(errorMessage(e), 'error');
      void load();
    }
  };

  const bulk = async (bFrom: string, bTo: string, attending: boolean, onlyEmpty: boolean, label: string) => {
    if (!days) return;
    const snapshot = days;
    const applies = (d: Day) => d.date >= bFrom && d.date <= bTo && d.cooking && !d.locked && (!onlyEmpty || d.attending === null);
    setDays(days.map((d) => (applies(d) ? { ...d, attending } : d)));
    setBusy(true);
    try {
      const res = await api<{ updated: number; skipped: number }>('/responses/bulk', {
        method: 'POST',
        body: { from: bFrom, to: bTo, attending, onlyEmpty },
      });
      toast(`${label}: upraveno ${res.updated}${res.skipped ? `, přeskočeno ${res.skipped}` : ''}`, 'ok');
      await load();
    } catch (e) {
      setDays(snapshot);
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const nextMonday = addDays(thisMonday, 7);
  const nextSunday = addDays(nextMonday, 6);
  const name = firstName(me.name || me.email);

  if (loadError && !days) return <ErrorState text={loadError} onRetry={() => void load()} />;
  if (!days) return <LunchesSkeleton />;

  return (
    <div className="page">
      <InstallBanner />
      <Hero
        greet={`${greeting()}${name ? `, ${name}` : ''}`}
        next={next}
        today={today}
        answered={answered}
        total={cookingDays.length}
        onAnswer={setAnswer}
      />

      {loadError && <ErrorState text={loadError} onRetry={() => void load()} />}

      <section className="quick" aria-label="Rychlé vyplnění">
        <h2 className="section-label">Rychle vyplnit</h2>
        <div className="chips" role="toolbar">
          <button className="chip chip-yes" disabled={busy} onClick={() => bulk(nextMonday, nextSunday, true, false, 'Příští týden ano')}>
            <span className="chip-dot" aria-hidden>
              <Icon name="check" size={13} strokeWidth={3} />
            </span>
            Příští týden <b>ano</b>
          </button>
          <button className="chip chip-no" disabled={busy} onClick={() => bulk(nextMonday, nextSunday, false, false, 'Příští týden ne')}>
            <span className="chip-dot" aria-hidden>
              <Icon name="x" size={13} strokeWidth={3} />
            </span>
            Příští týden <b>ne</b>
          </button>
          <button className="chip chip-month" disabled={busy} onClick={() => bulk(today, endOfMonth(today), true, true, 'Celý měsíc ano')}>
            <span className="chip-dot" aria-hidden>
              <Icon name="calendarCheck" size={13} strokeWidth={2.6} />
            </span>
            Celý měsíc <b>ano</b>
            <small>jen prázdné</small>
          </button>
        </div>
      </section>

      {weeks.length === 0 && (
        <div className="empty">
          <span className="empty-icon">
            <Icon name="chefHat" size={30} strokeWidth={1.6} />
          </span>
          <p>V nejbližších týdnech se nevaří.</p>
        </div>
      )}

      {weeks.map((w) => {
        const cooking = w.days.filter((d) => d.cooking);
        const done = cooking.filter((d) => d.attending !== null).length;
        return (
          <section key={w.monday} className="week" aria-labelledby={`wk-${w.monday}`}>
            <header className="week-head">
              <h2 id={`wk-${w.monday}`}>{weekTitle(w.monday, thisMonday)}</h2>
              <span className="week-range">{weekRange(w.monday)}</span>
              {cooking.length > 0 && (
                <span className={`week-count ${done === cooking.length ? 'is-done' : ''}`}>
                  {done === cooking.length && <Icon name="check" size={13} strokeWidth={3} />}
                  {done}/{cooking.length}
                </span>
              )}
            </header>
            <ul className="days">
              {w.days.map((d) => (
                <DayCard key={d.date} day={d} today={today} highlight={d.date === highlight} onAnswer={setAnswer} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Hero({
  greet,
  next,
  today,
  answered,
  total,
  onAnswer,
}: {
  greet: string;
  next: Day | null;
  today: string;
  answered: number;
  total: number;
  onAnswer: (date: string, a: Answer) => void;
}) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  let headline = 'Teď se nevaří';
  if (next) {
    headline = next.date === today ? 'Dnes se vaří' : next.date === addDays(today, 1) ? 'Zítra se vaří' : 'Příště se vaří';
  }
  return (
    <section className="hero" aria-label="Nejbližší oběd">
      <svg className="hero-art" viewBox="0 0 160 150" aria-hidden>
        <g stroke="#2b1f3f" strokeWidth="4" opacity="0.4" fill="none">
          <path d="M52 30c-8-8 8-14 0-24" />
          <path d="M80 26c-8-8 8-14 0-24" />
          <path d="M108 30c-8-8 8-14 0-24" />
        </g>
        <g stroke="#2b1f3f" strokeWidth="5">
          <path d="M34 84C34 52 58 38 80 38s46 14 46 46z" fill="#fff4dc" />
          <path d="M80 38v12M62 42l4 10M98 42l-4 10" fill="none" strokeWidth="3" opacity="0.35" />
          <path d="M16 84h128c0 34-26 54-64 54S16 118 16 84z" fill="#ff7d66" />
          <rect x="10" y="78" width="140" height="14" rx="7" fill="#ff7d66" />
        </g>
        <circle cx="62" cy="68" r="4.5" fill="#2b1f3f" />
        <circle cx="98" cy="68" r="4.5" fill="#2b1f3f" />
        <ellipse cx="50" cy="76" rx="7" ry="4.5" fill="#ff7d66" opacity="0.55" />
        <ellipse cx="110" cy="76" rx="7" ry="4.5" fill="#ff7d66" opacity="0.55" />
        <path d="M72 74q8 9 16 0" fill="none" stroke="#2b1f3f" strokeWidth="3.5" strokeLinecap="round" />
        <g fill="#fff4dc">
          <circle cx="50" cy="112" r="3" />
          <circle cx="64" cy="118" r="3" />
          <circle cx="80" cy="120" r="3" />
          <circle cx="96" cy="118" r="3" />
          <circle cx="110" cy="112" r="3" />
        </g>
      </svg>
      <p className="hero-greet">{greet}</p>
      <h1 className="hero-title">
        {headline}
        {next && (
          <span className="hero-date">
            {weekdayLong(next.date)} {formatDayMonth(next.date)}
          </span>
        )}
      </h1>
      {next ? (
        <div className="hero-row">
          <HeroStatus day={next} today={today} />
          {!next.locked && (
            <Segmented value={next.attending} onChange={(v) => onAnswer(next.date, v)} label={`Oběd ${weekdayLong(next.date)}`} />
          )}
        </div>
      ) : (
        <p className="hero-status">V nejbližších týdnech není žádný den s vařením.</p>
      )}
      {total > 0 && (
        <div className="hero-progress">
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answered}
            aria-label="Vyplněné dny"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-text">
            Vyplněno <b>{answered}</b> z {total} dní
          </span>
        </div>
      )}
    </section>
  );
}

function HeroStatus({ day, today }: { day: Day; today: string }) {
  if (day.attending === true)
    return (
      <p className="hero-status">
        <span className="status-dot is-yes">
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
        Máš přihlášený oběd
      </p>
    );
  if (day.attending === false)
    return (
      <p className="hero-status">
        <span className="status-dot is-no">
          <Icon name="x" size={14} strokeWidth={3} />
        </span>
        Tentokrát bez tebe
      </p>
    );
  return (
    <p className="hero-status">
      <span className="status-dot is-none">
        <Icon name={day.locked ? 'lock' : 'clock'} size={14} strokeWidth={2.6} />
      </span>
      {day.locked ? 'Bez odpovědi · uzávěrka proběhla' : <>Čeká na odpověď · do {formatCutoff(day.cutoffAt, today)}</>}
    </p>
  );
}

function DayCard({
  day: d,
  today,
  highlight,
  onAnswer,
}: {
  day: Day;
  today: string;
  highlight: boolean;
  onAnswer: (date: string, a: Answer) => void;
}) {
  const state = !d.cooking ? 'cancelled' : d.attending === true ? 'yes' : d.attending === false ? 'no' : 'none';
  return (
    <li
      id={`day-${d.date}`}
      className={[
        'day',
        `day-${state}`,
        d.locked ? 'day-locked' : '',
        highlight ? 'day-highlight' : '',
        d.date === today ? 'day-today' : '',
      ].join(' ')}
    >
      <div className="day-tile" aria-hidden>
        <span className="day-dow">{weekdayShort(d.date)}</span>
        <span className="day-num">{dayOfMonth(d.date)}</span>
      </div>
      <div className="day-body">
        <div className="day-title">
          <span>{cap(weekdayLong(d.date))}</span>
          <span className="day-dm">{formatDayMonth(d.date)}</span>
          {d.date === today && <span className="tag tag-today">dnes</span>}
          {d.cooking && d.isOverride && (
            <span className="tag tag-extra">
              <Icon name="sparkle" size={11} strokeWidth={2.4} />
              navíc
            </span>
          )}
        </div>
        {!d.cooking ? (
          <div className="day-meta">{d.note ? d.note : 'Tento den se nevaří'}</div>
        ) : d.locked ? (
          <>
            <div className="day-meta">
              <Icon name="lock" size={13} />
              Uzavřeno
            </div>
            {d.note && <div className="day-note">{d.note}</div>}
          </>
        ) : (
          <>
            <div className="day-meta">
              <Icon name="clock" size={13} />
              <span>do {formatCutoff(d.cutoffAt, today)}</span>
            </div>
            {d.note && <div className="day-note">{d.note}</div>}
          </>
        )}
      </div>
      {d.cooking ? (
        <Segmented
          value={d.attending}
          disabled={d.locked}
          onChange={(v) => onAnswer(d.date, v)}
          label={`Oběd ${weekdayLong(d.date)} ${formatDayMonth(d.date)}`}
        />
      ) : (
        <span className="ribbon">Zrušeno</span>
      )}
    </li>
  );
}

export function LunchesSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Načítám">
      <div className="hero hero-skeleton">
        <Skeleton className="sk-line" style={{ width: '40%' }} />
        <Skeleton className="sk-title" style={{ width: '75%' }} />
        <Skeleton className="sk-line" style={{ width: '55%' }} />
        <Skeleton className="sk-bar" />
      </div>
      <div className="chips">
        <Skeleton className="sk-chip" />
        <Skeleton className="sk-chip" />
        <Skeleton className="sk-chip" />
      </div>
      <div className="week">
        <Skeleton className="sk-line" style={{ width: '35%', height: 18 }} />
        <ul className="days">
          {[0, 1, 2].map((i) => (
            <li key={i} className="day day-skeleton">
              <Skeleton className="sk-tile" />
              <div className="day-body">
                <Skeleton className="sk-line" style={{ width: '60%' }} />
                <Skeleton className="sk-line" style={{ width: '40%' }} />
              </div>
              <Skeleton className="sk-seg" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
