import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { signOut } from './account';
import { canLogout, errorMessage } from './api';
import { Avatar } from './components';
import { Icon } from './icons';
import { useToast } from './toast';
import type { Me } from './types';

/** Avatar button in the top bar that opens a small account menu (settings, sign out). */
export function AccountMenu({ me, onSettings }: { me: Me; onSettings: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const name = me.name || me.email;

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const doSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="acct" ref={wrapRef}>
      <button
        ref={btnRef}
        className="who-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Účet: ${name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Avatar name={name} seed={me.id} size="sm" />
      </button>
      {open && (
        <div className="acct-menu" id={menuId} ref={menuRef} onKeyDown={onMenuKey}>
          <div className="acct-head">
            <Avatar name={name} seed={me.id} size="md" />
            <div className="acct-text">
              <span className="acct-name">{name}</span>
              <span className="acct-email">{me.email}</span>
            </div>
          </div>
          <div className="acct-items" role="menu" aria-label="Účet">
            <button
              role="menuitem"
              className="acct-item"
              onClick={() => {
                close(false);
                onSettings();
              }}
            >
              <Icon name="sliders" size={18} />
              Nastavení
            </button>
            {canLogout() && (
              <button role="menuitem" className="acct-item acct-item-danger" disabled={busy} onClick={doSignOut}>
                <Icon name="logout" size={18} />
                {busy ? 'Odhlašuji…' : 'Odhlásit se'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
