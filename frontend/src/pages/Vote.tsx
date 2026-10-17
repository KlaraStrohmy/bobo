import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { ErrorState } from '../components';
import { formatDayMonth } from '../dates';
import { Icon } from '../icons';
import { useToast } from '../toast';
import type { DishVotes, Me } from '../types';

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

export default function VotePage({ me, onBack }: { me: Me; onBack: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<DishVotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      setData(await api<DishVotes>(`/votes/${id}`, { method: 'PUT', body: { voted } }));
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

      <ul className="dishes">
        {order.map((id) => {
          const d = byId.get(id)!;
          const mine = data.myVotes.includes(id);
          const disabled = busy !== null || (!mine && left <= 0);
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
                {d.votes !== null && (
                  <span className="dish-count" aria-label={`Hlasů: ${d.votes}`}>
                    <span className="dish-bar" aria-hidden>
                      <i style={{ width: `${share}%` }} />
                    </span>
                    {d.votes}
                  </span>
                )}
              </div>
              <button
                type="button"
                className={`dish-vote ${mine ? 'on' : ''}`}
                aria-pressed={mine}
                disabled={disabled}
                title={mine ? 'Vzít hlas zpět' : left <= 0 ? 'Hlasy ti došly' : 'Dát hlas'}
                onClick={() => void toggle(id, !mine)}
              >
                <img className="dish-dog" src="/dog.png" alt="" width={46} height={70} />
                <span className="sr-only">{mine ? 'Můj hlas' : 'Chci'}</span>
                {mine && (
                  <span className="dish-tick" aria-hidden>
                    <Icon name="check" size={13} strokeWidth={3.2} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="vote-note">Počty hlasů uvidíš, jakmile hlasuješ sám.</p>
    </div>
  );
}
