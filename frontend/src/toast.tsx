import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type Kind = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  text: string;
  kind: Kind;
}

const ICON: Record<Kind, IconName> = { ok: 'checkCircle', error: 'alert', info: 'info' };

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (text: string, kind: Kind = 'info') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, text, kind }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 5000 : 2800);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
            <Icon name={ICON[t.kind]} size={18} className="toast-icon" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
