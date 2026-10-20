import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ErrorState } from '../components';
import { formatDayMonth } from '../dates';
import { Icon } from '../icons';
import { Rain } from '../rain';
import { playBark, unlockAudio } from '../sounds';
import { useToast } from '../toast';
import type { DishVotes, Lactose, Me, Nutrition } from '../types';

/** Deterministic shuffle: same order for one person within a week, different between people. */
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Drag the dog's head to the right to give a vote, back to the left to take it back.
 * A tap on the track toggles too, and the arrow keys work.
 */
function DogSlider({
  on,
  locked,
  disabled,
  label,
  bark,
  onChange,
  onBlocked,
}: {
  on: boolean;
  /** No votes left: turning on is refused. */
  locked: boolean;
  disabled: boolean;
  label: string;
  /** The parent makes the dog bark (all votes used). */
  bark: boolean;
  onChange: (v: boolean) => void;
  onBlocked: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; moved: boolean; long: boolean } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [barkLocal, setBarkLocal] = useState(false);
  const barking = bark || barkLocal;
  // the bubble and the sound belong together: whenever the dog starts barking, it also says it out loud
  useEffect(() => {
    if (barking) playBark();
  }, [barking]);

  const clearPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  // holding the dog without moving makes it bark, and does not count as a tap
  const startPress = () => {
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      const d = drag.current;
      if (d && !d.moved) {
        d.long = true;
        setBarkLocal(true);
        window.setTimeout(() => setBarkLocal(false), 1600);
      }
    }, 550);
  };
  const pos = dragPos ?? (on ? 1 : 0);
  const shownOn = dragPos === null ? on : dragPos > 0.5;

  const posFrom = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return on ? 1 : 0;
    const r = el.getBoundingClientRect();
    const head = el.querySelector<HTMLElement>('.vsl-head')?.offsetWidth ?? 0;
    return Math.min(1, Math.max(0, (clientX - r.left - head / 2) / Math.max(1, r.width - head)));
  };
  const decide = (want: boolean) => {
    if (want === on) return;
    if (want && locked) onBlocked();
    else onChange(want);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    unlockAudio(); // browsers only allow sound after a gesture, so prepare it on the first touch
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false, long: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    startPress();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return;
    d.moved = true;
    clearPress();
    setDragPos(posFrom(e.clientX));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    clearPress();
    if (!d.long) decide(d.moved ? posFrom(e.clientX) > 0.5 : !on);
    setDragPos(null);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    unlockAudio();
    if (e.key === 'ArrowRight') decide(true);
    else if (e.key === 'ArrowLeft') decide(false);
    else if (e.key === 'Enter' || e.key === ' ') decide(!on);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={trackRef}
      className={`vsl ${shownOn ? 'is-on' : ''} ${dragPos !== null ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''} ${locked && !on ? 'is-locked' : ''}`}
      style={{ ['--pos' as string]: pos } as CSSProperties}
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      title={on ? 'Táhni doleva a vezmi hlas zpět' : locked ? 'Hlasy ti došly' : 'Táhni psa doprava a dej hlas'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        clearPress();
        setDragPos(null);
      }}
      onKeyDown={key}
    >
      <span className="vsl-hint vsl-hint-off" aria-hidden>
        <Icon name="chevronRight" size={16} strokeWidth={3} />
        <Icon name="chevronRight" size={16} strokeWidth={3} />
      </span>
      <span className="vsl-hint vsl-hint-on" aria-hidden>
        <Icon name="check" size={18} strokeWidth={3.2} />
      </span>
      <span className="vsl-head" aria-hidden>
        {barking && <span className="bark">Haf!</span>}
        <img src="/dog.png" alt="" width={90} height={131} draggable={false} />
      </span>
    </div>
  );
}

/** The dog barks (and paws fall) when this many votes are given. */
const BARK_AT_VOTES = 2;

const LACTOSE_LABEL: Record<Exclude<Lactose, 'no'>, string> = { yes: 'laktóza', trace: 'stopy laktózy' };

/** Protein / fat / carbs per portion, plus a lactose tag. A leading ~ marks calculated or guessed numbers. */
function Facts({ nutrition, lactose }: { nutrition: Nutrition; lactose: Lactose }) {
  const tilde = nutrition.estimated ? '~' : '';
  const items: { key: string; label: string; title: string; value: number }[] = [
    { key: 'p', label: 'B', title: 'bílkoviny', value: nutrition.protein },
    { key: 'f', label: 'T', title: 'tuky', value: nutrition.fat },
    { key: 'c', label: 'S', title: 'sacharidy', value: nutrition.carbs },
  ];
  return (
    <div className="dish-facts">
      {items.map((i) => (
        <span key={i.key} className={`fact fact-${i.key}`} title={`${i.title}: ${tilde}${i.value} g na porci`}>
          <b>{i.label}</b>
          {tilde}
          {i.value}
        </span>
      ))}
      {lactose !== 'no' && <span className={`fact fact-lactose is-${lactose}`}>{LACTOSE_LABEL[lactose]}</span>}
    </div>
  );
}

export default function VotePage({ me, onBack }: { me: Me; onBack: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<DishVotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [barkId, setBarkId] = useState<string | null>(null);
  const [paws, setPaws] = useState(false);
  const endPaws = useCallback(() => setPaws(false), []);

  const load = useCallback(async () => {
    try {
      setData(await api<DishVotes>('/votes'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const order = useMemo(() => (data ? shuffled(data.dishes.map((d) => d.id), `${me.id}:${data.week}`) : []), [data?.week, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: string, voted: boolean) => {
    setBusy(id);
    try {
      const next = await api<DishVotes>(`/votes/${id}`, { method: 'PUT', body: { voted } });
      setData(next);
      if (voted && next.myVotes.length === BARK_AT_VOTES) {
        // the second vote is in: the dog barks and paws fall
        setBarkId(id);
        setPaws(true);
        window.setTimeout(() => setBarkId((cur) => (cur === id ? null : cur)), 1700);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast('Hlasy ti došly, nejdřív jeden vrať.', 'error');
      else toast(errorMessage(e), 'error');
      void load();
    } finally {
      setBusy(null);
    }
  };

  if (error && !data) return <ErrorState text={error} onRetry={() => void load()} />;
  if (!data) return <div className="page vote-page" aria-busy="true" />;

  const used = data.myVotes.length;
  const left = data.maxVotes - used;
  const byId = new Map(data.dishes.map((d) => [d.id, d]));
  const top = Math.max(0, ...data.dishes.map((d) => d.votes ?? 0));

  return (
    <div className="page vote-page">
      {paws && <Rain emojis={['🐾']} count={22} onDone={endPaws} />}
      <button type="button" className="vote-back" onClick={onBack}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.6} />
        Obědy
      </button>

      <header className="vote-head">
        <img src="/ramen.png" alt="" width={72} height={79} />
        <div>
          <h1>Hlasuj!</h1>
          <p>
            Co chceš jíst týden od <b>{formatDayMonth(data.week)}</b>? Máš <b>{data.maxVotes}</b>{' '}
            {data.maxVotes === 1 ? 'hlas' : data.maxVotes < 5 ? 'hlasy' : 'hlasů'}.
          </p>
        </div>
      </header>

      <div className="vote-meter" role="status" aria-live="polite">
        <span className="vote-pips" aria-hidden>
          {Array.from({ length: data.maxVotes }, (_, i) => (
            <i key={i} className={i < used ? 'on' : ''} />
          ))}
        </span>
        {left > 0 ? `Zbývá ti ${left} z ${data.maxVotes}` : 'Všechny hlasy máš rozdané'}
      </div>

      <div className="vote-friday">
        <span aria-hidden>🌯</span>
        <span>
          <b>Každý pátek burrito.</b> O pátku se nehlasuje.
        </span>
      </div>

      <p className="vote-legend">
        <b>Všechna jídla jsou bez lepku a sóji.</b> <b>B</b> bílkoviny, <b>T</b> tuky, <b>S</b> sacharidy v gramech na porci; <b>~</b> je odhad nebo
        výpočet, ne údaj z receptu.
      </p>

      <ul className="dishes">
        {order.map((id) => {
          const d = byId.get(id)!;
          const mine = data.myVotes.includes(id);
          const share = d.votes !== null && top > 0 ? Math.round((d.votes / top) * 100) : 0;
          return (
            <li key={id} className={`dish ${mine ? 'is-mine' : ''}`}>
              <div className="dish-body">
                {d.url ? (
                  <a className="dish-name" href={d.url} target="_blank" rel="noopener noreferrer">
                    {d.name}
                    <Icon name="externalLink" size={13} strokeWidth={2.4} />
                  </a>
                ) : (
                  <span className="dish-name">{d.name}</span>
                )}
                <Facts nutrition={d.nutrition} lactose={d.lactose} />
                {d.votes !== null && (
                  <span className="dish-count" aria-label={`Hlasů: ${d.votes}`}>
                    <span className="dish-bar" aria-hidden>
                      <i style={{ width: `${share}%` }} />
                    </span>
                    {d.votes}
                  </span>
                )}
              </div>
              <DogSlider
                on={mine}
                locked={left <= 0}
                disabled={busy !== null}
                label={`Hlas pro ${d.name}`}
                bark={barkId === id}
                onChange={(voted) => void toggle(id, voted)}
                onBlocked={() => toast('Hlasy ti došly, nejdřív jeden vrať.', 'error')}
              />
            </li>
          );
        })}
      </ul>
      <p className="vote-note">Počty hlasů uvidíš, jakmile hlasuješ sám.</p>
      <p className="vote-credit">
        Štěkání: Amada44,{' '}
        <a href="https://commons.wikimedia.org/wiki/File:Barking_of_a_dog_2.ogg" target="_blank" rel="noopener noreferrer">
          Wikimedia Commons
        </a>
        , <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>
      </p>
    </div>
  );
}
