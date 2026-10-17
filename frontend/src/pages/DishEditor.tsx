import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { Icon } from '../icons';
import { useToast } from '../toast';
import type { DayDish, DishVotes } from '../types';

const CUSTOM = '__custom';

/**
 * Admin decides what is cooked on a day. The voting results are only a hint: the list is sorted
 * by votes, but nothing is picked automatically.
 */
export default function DishEditor({ date, dish, onSaved }: { date: string; dish: DayDish | null; onSaved: (d: DayDish | null) => void }) {
  const toast = useToast();
  const [votes, setVotes] = useState<DishVotes | null>(null);
  const [choice, setChoice] = useState<string>(dish ? (dish.dishId ?? CUSTOM) : '');
  const [name, setName] = useState(dish && !dish.dishId ? dish.name : '');
  const [url, setUrl] = useState(dish && !dish.dishId ? (dish.url ?? '') : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<DishVotes>('/votes').then(setVotes, () => setVotes(null));
  }, []);

  const sorted = votes ? [...votes.dishes].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, 'cs')) : [];
  const top = sorted[0] && (sorted[0].votes ?? 0) > 0 ? sorted[0] : null;

  const save = async (body: { dishId: string | null; name: string | null; url: string | null }) => {
    setSaving(true);
    try {
      const res = await api<{ date: string; dish: DayDish | null }>(`/admin/dishes/${date}`, { method: 'PUT', body });
      onSaved(res.dish);
      toast(res.dish ? `Jídlo uloženo: ${res.dish.name}` : 'Jídlo smazáno', 'ok');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    if (choice === '') return save({ dishId: null, name: null, url: null });
    if (choice === CUSTOM) return save({ dishId: null, name: name.trim(), url: url.trim() || null });
    return save({ dishId: choice, name: null, url: null });
  };

  return (
    <div className="dish-editor">
      <label className="field">
        <span className="field-label">Co se vaří</span>
        <select name="day-dish" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">— zatím nevybráno —</option>
          {sorted.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.votes !== null ? ` (${d.votes} ${d.votes === 1 ? 'hlas' : d.votes >= 2 && d.votes <= 4 ? 'hlasy' : 'hlasů'})` : ''}
            </option>
          ))}
          <option value={CUSTOM}>Jiné jídlo (napíšu sama)…</option>
        </select>
      </label>
      {choice === CUSTOM && (
        <>
          <label className="field">
            <span className="field-label">Název jídla</span>
            <input type="text" name="dish-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="např. svíčková" />
          </label>
          <label className="field">
            <span className="field-label">Odkaz na recept (nepovinné)</span>
            <input type="text" name="dish-url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
        </>
      )}
      {top && choice === '' && (
        <p className="muted small dish-hint">
          <Icon name="sparkle" size={13} /> Nejvíc hlasů má <b>{top.name}</b> ({top.votes}). Rozhodnutí je na tobě.
        </p>
      )}
      <button className="btn btn-primary" disabled={saving || (choice === CUSTOM && !name.trim()) || (choice === '' && !dish)} onClick={() => void submit()}>
        {choice === '' ? 'Smazat jídlo' : 'Uložit jídlo'}
      </button>
    </div>
  );
}
