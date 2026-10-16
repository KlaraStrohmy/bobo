import type { CSSProperties, ReactNode } from 'react';
import { Chicken } from './chicken';
import { Icon, type IconName } from './icons';

export type Answer = boolean | null;

/**
 * Ano / Ne pill control. Tapping the selected option clears the answer (emits `null`),
 * so there is no separate "unset" button.
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
  const opts: { v: boolean; text: string; cls: string }[] = [
    { v: true, text: 'Ano', cls: 'yes' },
    { v: false, text: 'Ne', cls: 'no' },
  ];
  const state = value === true ? 'is-yes' : value === false ? 'is-no' : 'is-none';
  return (
    <div className={`seg seg-${size} ${state}`} role="group" aria-label={label}>
      <span className="seg-thumb" aria-hidden>
        <Chicken className="seg-chicken" />
      </span>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.cls}
            type="button"
            aria-pressed={on}
            title={on ? `${o.text} – klepnutím zrušíš` : o.text}
            className={`seg-opt seg-${o.cls} ${on ? 'on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(on ? null : o.v)}
          >
            <span>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
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
