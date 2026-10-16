import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Chicken } from './chicken';
import { Icon, type IconName } from './icons';

export type Answer = boolean | null;

/**
 * Ano / Ne control: a big roast chicken on a track. Drag (or tap) it to the left for Ano,
 * to the right for Ne, back to the middle to clear the answer. Arrow keys work too.
 */
export function Segmented({
  value,
  onChange,
  disabled,
  size = 'md',
  label,
}: {
  value: Answer;
  onChange: (v: Answer) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; moved: boolean } | null>(null);
  // live position while dragging: 0 = Ano (left), 1 = Ne (right)
  const [dragPos, setDragPos] = useState<number | null>(null);

  const restPos = value === true ? 0 : value === false ? 1 : 0.5;
  const pos = dragPos ?? restPos;
  const shown: Answer = dragPos === null ? value : answerAt(dragPos);
  const state = shown === true ? 'is-yes' : shown === false ? 'is-no' : 'is-none';
  const text = shown === true ? 'Ano' : shown === false ? 'Ne' : 'Bez odpovědi';

  const commit = (v: Answer) => {
    if (v !== value) onChange(v);
  };

  const posFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return restPos;
    const r = el.getBoundingClientRect();
    const bird = el.querySelector<HTMLElement>('.chk-bird')?.offsetWidth ?? 0;
    const span = Math.max(1, r.width - bird);
    return Math.min(1, Math.max(0, (clientX - r.left - bird / 2) / span));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return;
    d.moved = true;
    setDragPos(posFromEvent(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      commit(answerAt(posFromEvent(e.clientX)));
    } else {
      // a tap: left half = Ano, right half = Ne; tapping the current side clears it
      const tapped = posFromEvent(e.clientX) < 0.5;
      commit(value === tapped ? null : tapped);
    }
    setDragPos(null);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragPos(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let v: Answer | undefined;
    if (e.key === 'ArrowLeft') v = value === false ? null : true;
    else if (e.key === 'ArrowRight') v = value === true ? null : false;
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') v = null;
    if (v === undefined) return;
    e.preventDefault();
    commit(v);
  };

  return (
    <div
      ref={trackRef}
      className={`chk chk-${size} ${state} ${dragPos !== null ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      style={{ ['--pos' as string]: pos } as CSSProperties}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={value === true ? 0 : value === false ? 2 : 1}
      aria-valuetext={value === true ? 'Ano' : value === false ? 'Ne' : 'Bez odpovědi'}
      aria-disabled={disabled || undefined}
      title={disabled ? undefined : 'Kuře doleva = Ano, doprava = Ne'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <span className="chk-end chk-end-yes" aria-hidden>
        Ano
      </span>
      <span className="chk-end chk-end-no" aria-hidden>
        Ne
      </span>
      <span className="chk-answer" aria-hidden>
        {text}
      </span>
      <span className="chk-bird" aria-hidden>
        <Chicken className="chk-chicken" />
      </span>
    </div>
  );
}

function answerAt(pos: number): Answer {
  if (pos < 0.34) return true;
  if (pos > 0.66) return false;
  return null;
}

/** iOS-style switch; the visible label is optional (pass `hideLabel` and it stays for screen readers). */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hideLabel,
  name,
}: {
  name?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hideLabel?: boolean;
}) {
  return (
    <label className={`switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" role="switch" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      <span className={hideLabel ? 'sr-only' : 'switch-label'}>{label}</span>
    </label>
  );
}

export function Card({
  title,
  icon,
  children,
  actions,
  className = '',
  subtitle,
}: {
  title?: ReactNode;
  icon?: IconName;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {icon && (
            <span className="card-icon">
              <Icon name={icon} size={18} />
            </span>
          )}
          <div className="card-titles">
            {title && <h2>{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Callout({ kind = 'warn', icon, children }: { kind?: 'warn' | 'info'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`}>
      <Icon name={icon ?? (kind === 'warn' ? 'alert' : 'info')} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="card error-card" role="alert">
      <span className="error-icon">
        <Icon name="alert" size={22} />
      </span>
      <p>{text}</p>
      <button className="btn" onClick={onRetry}>
        <Icon name="refresh" size={16} />
        Zkusit znovu
      </button>
    </div>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden />;
}

/** First name for a greeting: "Pavel Vojáček" → "Pavel", "pavel.vojacek" → "Pavel". */
export function firstName(nameOrEmail: string): string {
  const base = nameOrEmail.split('@')[0].trim();
  const first = base.split(/[\s._-]+/)[0] ?? '';
  return first ? first.charAt(0).toLocaleUpperCase('cs') + first.slice(1) : '';
}

/** Two-letter initials: "Pavel Vojáček" → "PV", "klara.matoulkova@x" → "KM". */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split('@')[0].trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return letters.toLocaleUpperCase('cs');
}

/** Stable hue bucket (0–5) for an avatar, derived from the user's id/email. */
function avatarTone(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 6;
}

export function Avatar({ name, seed, size = 'md' }: { name: string; seed: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar-${size} tone-${avatarTone(seed)}`} aria-hidden>
      {initials(name)}
    </span>
  );
}
