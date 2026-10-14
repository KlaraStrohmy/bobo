import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import {
  addDays,
  dayOfMonth,
  formatDateTime,
  formatDayMonth,
  formatShort,
  relativeDayLabel,
  todayPrague,
  WEEKDAY_LABELS,
  weekdayLong,
  weekdayShort,
} from '../dates';
import { Avatar, Card, Segmented, Skeleton, Toggle, type Answer } from '../components';
import { Icon, type IconName } from '../icons';
import { useToast } from '../toast';
import type { AdminSettings, AdminUser, Override, Overview, SummaryDay, UserRef } from '../types';

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

export default function AdminPage() {
  const today = todayPrague();
  const [summary, setSummary] = useState<SummaryDay[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const toast = useToast();

  const loadSummary = useCallback(async () => {
    try {
      const res = await api<{ days: SummaryDay[] }>(`/admin/summary?from=${today}&to=${addDays(today, 13)}`);
      setSummary(res.days);
      setDate((cur) => cur ?? res.days.find((d) => d.cooking)?.date ?? today);
    } catch (e) {
      toast(errorMessage(e), 'error');
      setDate((cur) => cur ?? today);
    }
  }, [today, toast]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <h1 className="page-title">Přehled</h1>
        <p className="page-sub">Kdo jde na oběd, kdy se vaří a kdo appku používá.</p>
      </header>

      <DateStrip days={summary} selected={date} today={today} onSelect={setDate} />

      <div className="admin-grid">
        <div className="admin-col admin-col-main">
          {date ? <DayOverview date={date} today={today} onDateChange={setDate} onChanged={loadSummary} /> : <OverviewSkeleton />}
          <UsersCard />
        </div>
        <div className="admin-col admin-col-side">
          <SummaryChart days={summary} selected={date} onSelect={setDate} />
          <SettingsCard onSaved={loadSummary} />
          <OverridesCard onChanged={loadSummary} />
        </div>
      </div>
    </div>
  );
}

function summaryRows(days: SummaryDay[] | null): SummaryDay[] {
  return days?.filter((d) => d.cooking || d.note) ?? [];
}

function DateStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: SummaryDay[] | null;
  selected: string | null;
  today: string;
  onSelect: (d: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const rows = summaryRows(days);

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('.date-chip.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected, days]);

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div className="date-strip-wrap">
      <div className="date-strip" ref={strip} role="group" aria-label="Vařicí dny">
        {!days && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="sk-datechip" />)}
        {rows.map((d) => {
          const rel = relativeDayLabel(d.date, today);
          return (
            <button
              key={d.date}
              aria-pressed={d.date === selected}
              className={`date-chip ${d.date === selected ? 'on' : ''} ${d.cooking ? '' : 'is-cancelled'}`}
              onClick={() => onSelect(d.date)}
            >
              <span className="dc-dow">{rel ?? weekdayShort(d.date)}</span>
              <span className="dc-num">{dayOfMonth(d.date)}</span>
              <span className="dc-count">
                {d.cooking ? (
                  <>
                    <i className="dot dot-yes" />
                    {d.yes}
                  </>
                ) : (
                  'zrušeno'
                )}
              </span>
            </button>
          );
        })}
      </div>
      <label className="date-pick" title="Vybrat jiné datum">
        <span className="sr-only">Vybrat jiné datum</span>
        <input
          ref={picker}
          name="overview-date"
          type="date"
          value={selected ?? ''}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          onClick={openPicker}
        />
        <Icon name="calendar" size={20} />
      </label>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <section className="card" aria-busy="true">
      <Skeleton className="sk-title" style={{ width: '55%' }} />
      <div className="tiles">
        <Skeleton className="sk-tilebig" />
        <Skeleton className="sk-tilebig" />
        <Skeleton className="sk-tilebig" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="person-row">
          <Skeleton className="sk-avatar" />
          <Skeleton className="sk-line" style={{ width: '45%' }} />
        </div>
      ))}
    </section>
  );
}

function DayOverview({
  date,
  today,
  onDateChange,
  onChanged,
}: {
  date: string;
  today: string;
  onDateChange: (d: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Overview>(`/admin/overview?date=${date}`));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [date, toast]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const change = async (user: UserRef, attending: Answer) => {
    setBusyUser(user.id);
    try {
      await api(`/admin/responses/${encodeURIComponent(user.id)}/${date}`, { method: 'PUT', body: { attending } });
      toast(`${user.name || user.email}: ${attending === null ? 'smazáno' : attending ? 'ano' : 'ne'}`, 'ok');
      await load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusyUser(null);
    }
  };

  const groups: { key: 'yes' | 'no' | 'none'; label: string; value: Answer }[] = [
    { key: 'yes', label: 'Ano', value: true },
    { key: 'no', label: 'Ne', value: false },
    { key: 'none', label: 'Neodpověděl', value: null },
  ];
  const tiles: { key: 'yes' | 'no' | 'none'; label: string; icon: IconName }[] = [
    { key: 'yes', label: 'Ano', icon: 'check' },
    { key: 'no', label: 'Ne', icon: 'x' },
    { key: 'none', label: 'Neodpověděl', icon: 'help' },
  ];
  const total = data ? data.counts.yes + data.counts.no + data.counts.none : 0;
  const rel = relativeDayLabel(date, today);

  return (
    <Card
      className="overview"
      title={
        <>
          {cap(weekdayLong(date))} {formatDayMonth(date)}
          {rel && <span className="tag tag-today">{rel}</span>}
        </>
      }
      subtitle={data ? `Celkem lidí: ${total}` : '\u00a0'}
      actions={
        <div className="icon-group">
          <button className="icon-btn" aria-label="Předchozí den" onClick={() => onDateChange(addDays(date, -1))}>
            <Icon name="chevronLeft" size={20} />
          </button>
          <button className="icon-btn" aria-label="Další den" onClick={() => onDateChange(addDays(date, 1))}>
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      }
    >
      {!data && (
        <>
          <div className="tiles">
            <Skeleton className="sk-tilebig" />
            <Skeleton className="sk-tilebig" />
            <Skeleton className="sk-tilebig" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="person-row">
              <Skeleton className="sk-avatar" />
              <Skeleton className="sk-line" style={{ width: '45%' }} />
            </div>
          ))}
        </>
      )}
      {data && (
        <>
          {!data.cooking && (
            <div className="banner banner-cancelled">
              <Icon name="calendarX" size={18} />
              <span>
                <strong>Tento den se nevaří</strong>
                {data.note && <> · {data.note}</>}
              </span>
            </div>
          )}
          {data.cooking && data.note && (
            <div className="banner banner-note">
              <Icon name="sparkle" size={16} />
              <span>{data.note}</span>
            </div>
          )}
          <div className={`tiles ${data.cooking ? '' : 'is-dim'}`}>
            {tiles.map((t) => (
              <div key={t.key} className={`tile tile-${t.key}`}>
                <span className="tile-icon">
                  <Icon name={t.icon} size={16} strokeWidth={2.6} />
                </span>
                <strong className="tile-num">{data.counts[t.key]}</strong>
                <span className="tile-label">{t.label}</span>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="stackbar" aria-hidden>
              <span className="sb-yes" style={{ flexGrow: data.counts.yes }} />
              <span className="sb-no" style={{ flexGrow: data.counts.no }} />
              <span className="sb-none" style={{ flexGrow: data.counts.none }} />
            </div>
          )}
          <div className="people-groups">
            {groups.map((g) => (
              <div key={g.key} className={`people people-${g.key}`}>
                <h3>
                  <i className={`dot dot-${g.key}`} />
                  {g.label}
                  <span className="people-count">{data[g.key].length}</span>
                </h3>
                {data[g.key].length === 0 ? (
                  <p className="people-empty">nikdo</p>
                ) : (
                  <ul>
                    {data[g.key].map((u) => (
                      <li key={u.id} className="person-row">
                        <Avatar name={u.name || u.email} seed={u.id} size="sm" />
                        <span className="person" title={u.email}>
                          {u.name || u.email}
                        </span>
                        <Segmented
                          size="sm"
                          value={g.value}
                          disabled={busyUser === u.id || !data.cooking}
                          onChange={(v) => change(u, v)}
                          label={u.name || u.email}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function SummaryChart({ days, selected, onSelect }: { days: SummaryDay[] | null; selected: string | null; onSelect: (d: string) => void }) {
  const rows = summaryRows(days);
  const max = Math.max(1, ...rows.map((d) => d.yes + d.no + d.none));
  return (
    <Card title="Příští 2 týdny" icon="chart" subtitle="Klepnutím vybereš den">
      {!days && <Skeleton className="sk-chart" />}
      {days && rows.length === 0 && <p className="muted">V příštích dvou týdnech se nevaří.</p>}
      {rows.length > 0 && (
        <>
          <div className="chart">
            {rows.map((d) => {
              const label = d.cooking
                ? `${formatShort(d.date)}: ${d.yes} ano, ${d.no} ne, ${d.none} bez odpovědi`
                : `${formatShort(d.date)}: zrušeno${d.note ? ` (${d.note})` : ''}`;
              return (
                <button
                  key={d.date}
                  className={`col ${d.date === selected ? 'on' : ''} ${d.cooking ? '' : 'is-cancelled'}`}
                  onClick={() => onSelect(d.date)}
                  aria-label={label}
                  aria-current={d.date === selected ? 'date' : undefined}
                  title={label}
                >
                  <span className="col-val">{d.cooking ? d.yes : '–'}</span>
                  <span className="col-bar">
                    {d.cooking ? (
                      <>
                        <span className="sb-none" style={{ height: `${(d.none / max) * 100}%` }} />
                        <span className="sb-no" style={{ height: `${(d.no / max) * 100}%` }} />
                        <span className="sb-yes" style={{ height: `${(d.yes / max) * 100}%` }} />
                      </>
                    ) : (
                      <Icon name="x" size={14} strokeWidth={2.6} className="col-x" />
                    )}
                  </span>
                  <span className="col-dow">{weekdayShort(d.date)}</span>
                  <span className="col-day">{dayOfMonth(d.date)}.</span>
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span>
              <i className="dot dot-yes" />
              Ano
            </span>
            <span>
              <i className="dot dot-no" />
              Ne
            </span>
            <span>
              <i className="dot dot-none" />
              Bez odpovědi
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<AdminSettings>('/admin/settings').then(setS, (e) => toast(errorMessage(e), 'error'));
  }, [toast]);

  const toggleDay = (wd: number) =>
    setS(
      (cur) =>
        cur && {
          ...cur,
          cookingWeekdays: cur.cookingWeekdays.includes(wd)
            ? cur.cookingWeekdays.filter((x) => x !== wd)
            : [...cur.cookingWeekdays, wd].sort((a, b) => a - b),
        },
    );

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      setS(await api<AdminSettings>('/admin/settings', { method: 'PUT', body: s }));
      toast('Nastavení uloženo', 'ok');
      onSaved();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Kdy se vaří" icon="chefHat">
      {!s && <Skeleton className="sk-block" />}
      {s && (
        <>
          <div className="weekdays" role="group" aria-label="Dny vaření">
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={label} className={`weekday ${s.cookingWeekdays.includes(i + 1) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  name={`weekday-${i + 1}`}
                  checked={s.cookingWeekdays.includes(i + 1)}
                  onChange={() => toggleDay(i + 1)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="cutoff-row">
            <span className="field-label">Uzávěrka</span>
            <div className="cutoff-fields">
              <input
                type="number"
                min={0}
                max={14}
                className="narrow"
                name="cutoff-days"
                aria-label="Počet dní předem"
                value={s.cutoff.daysBefore}
                onChange={(e) => setS({ ...s, cutoff: { ...s.cutoff, daysBefore: Math.max(0, Number(e.target.value) || 0) } })}
              />
              <span>
                {s.cutoff.daysBefore === 1 ? 'den' : s.cutoff.daysBefore >= 2 && s.cutoff.daysBefore <= 4 ? 'dny' : 'dní'} předem v
              </span>
              <input
                type="time"
                name="cutoff-time"
                aria-label="Čas uzávěrky"
                value={s.cutoff.time}
                onChange={(e) => setS({ ...s, cutoff: { ...s.cutoff, time: e.target.value } })}
              />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              <Icon name="check" size={17} strokeWidth={2.6} />
              Uložit
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function OverridesCard({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const today = todayPrague();
  const [list, setList] = useState<Override[] | null>(null);
  const [date, setDate] = useState(addDays(today, 1));
  const [cooking, setCooking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ overrides: Override[] }>(`/admin/overrides?from=${today}&to=${addDays(today, 365)}`);
      setList([...res.overrides].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [today, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await api(`/admin/overrides/${date}`, { method: 'PUT', body: { cooking, note: note.trim() || null } });
      toast(`${formatShort(date)}: ${cooking ? 'přidán den navíc' : 'zrušeno'}`, 'ok');
      setNote('');
      await load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o: Override) => {
    setBusy(true);
    try {
      await api(`/admin/overrides/${o.date}`, { method: 'DELETE' });
      toast(`Výjimka ${formatShort(o.date)} smazána`, 'ok');
      await load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Jednorázové výjimky" icon="calendar">
      <div className="override-form">
        <label className="field">
          <span className="field-label">Datum</span>
          <input type="date" name="override-date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Co se děje</span>
          <div className="choice" role="radiogroup" aria-label="Typ výjimky">
            <button
              type="button"
              className={!cooking ? 'on is-cancel' : ''}
              aria-checked={!cooking}
              role="radio"
              onClick={() => setCooking(false)}
            >
              <Icon name="calendarX" size={16} />
              Zrušit
            </button>
            <button
              type="button"
              className={cooking ? 'on is-extra' : ''}
              aria-checked={cooking}
              role="radio"
              onClick={() => setCooking(true)}
            >
              <Icon name="sparkle" size={16} />
              Vařit navíc
            </button>
          </div>
        </div>
        <label className="field field-wide">
          <span className="field-label">Poznámka</span>
          <input type="text" name="override-note" placeholder="např. firemní akce" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn btn-primary field-wide" disabled={busy || !date} onClick={save}>
          Uložit výjimku
        </button>
      </div>
      {list && list.length === 0 && <p className="muted small list-empty">Žádné nadcházející výjimky.</p>}
      {list && list.length > 0 && (
        <ul className="list">
          {list.map((o) => (
            <li key={o.date} className="list-row">
              <span className={`ov-badge ${o.cooking ? 'is-extra' : 'is-cancel'}`}>
                <span className="ov-day">{dayOfMonth(o.date)}</span>
                <span className="ov-dow">{weekdayShort(o.date)}</span>
              </span>
              <div className="list-text">
                <strong>
                  {formatShort(o.date)}{' '}
                  <span className={`tag ${o.cooking ? 'tag-extra' : 'tag-cancel'}`}>{o.cooking ? 'vaří se navíc' : 'zrušeno'}</span>
                </strong>
                {o.note && <span className="muted small">{o.note}</span>}
              </div>
              <button
                className="icon-btn icon-btn-danger"
                aria-label={`Smazat výjimku ${formatShort(o.date)}`}
                disabled={busy}
                onClick={() => remove(o)}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UsersCard() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);

  useEffect(() => {
    api<{ users: AdminUser[] }>('/admin/users').then(
      (r) => setUsers([...r.users].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'cs'))),
      (e) => toast(errorMessage(e), 'error'),
    );
  }, [toast]);

  const setActive = async (u: AdminUser, active: boolean) => {
    setUsers((us) => us?.map((x) => (x.id === u.id ? { ...x, active } : x)) ?? us);
    try {
      const updated = await api<AdminUser>(`/admin/users/${encodeURIComponent(u.id)}`, { method: 'PUT', body: { active } });
      setUsers((us) => us?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) ?? us);
    } catch (e) {
      setUsers((us) => us?.map((x) => (x.id === u.id ? u : x)) ?? us);
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Card title="Lidé" icon="users" subtitle={users ? `${users.filter((u) => u.active).length} aktivních z ${users.length}` : undefined}>
      {!users &&
        [0, 1, 2].map((i) => (
          <div key={i} className="person-row">
            <Skeleton className="sk-avatar" />
            <Skeleton className="sk-line" style={{ width: '55%' }} />
          </div>
        ))}
      {users && (
        <ul className="list">
          {users.map((u) => (
            <li key={u.id} className={`list-row ${u.active ? '' : 'inactive'}`}>
              <Avatar name={u.name || u.email} seed={u.id} />
              <div className="list-text">
                <strong>{u.name || u.email}</strong>
                <span className="muted small">
                  {u.email}
                  {u.reminderEnabled && (
                    <span className="meta-ico" title="Má zapnutou připomínku">
                      {' · '}
                      <Icon name="bell" size={12} /> připomínka
                    </span>
                  )}
                  {u.lastSeenAt && ` · naposledy ${formatDateTime(u.lastSeenAt)}`}
                </span>
              </div>
              <Toggle label={u.active ? 'aktivní' : 'neaktivní'} checked={u.active} onChange={(v) => setActive(u, v)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
