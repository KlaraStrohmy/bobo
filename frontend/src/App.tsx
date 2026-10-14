import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, getDevUser, isDevMode } from './api';
import { ToastProvider } from './toast';
import { Avatar, ErrorState } from './components';
import { Icon, type IconName } from './icons';
import type { Me } from './types';
import LunchesPage, { LunchesSkeleton } from './pages/Lunches';
import SettingsPage from './pages/Settings';
import AdminPage from './pages/Admin';

type Tab = 'lunches' | 'settings' | 'admin';

const PATHS: Record<Tab, string> = { lunches: '/', settings: '/nastaveni', admin: '/admin' };
const LABELS: Record<Tab, string> = { lunches: 'Obědy', settings: 'Nastavení', admin: 'Přehled' };
const ICONS: Record<Tab, IconName> = { lunches: 'utensils', settings: 'sliders', admin: 'chart' };

function tabFromPath(path: string): Tab {
  if (path.startsWith('/nastaveni')) return 'settings';
  if (path.startsWith('/admin')) return 'admin';
  return 'lunches';
}

export function BrandMark({ size = 32 }: { size?: number }) {
  return <img className="brand-mark" src="/favicon.svg" alt="" width={size} height={size} />;
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(() => {
    api<Me>('/me')
      .then((m) => {
        setMe(m);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(loadMe, [loadMe]);

  useEffect(() => {
    const onPop = () => setTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (t: Tab) => {
    if (t === tab) return;
    window.history.pushState(null, '', PATHS[t]);
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const tabs: Tab[] = me?.isAdmin ? ['lunches', 'settings', 'admin'] : ['lunches', 'settings'];
  const active: Tab = tab === 'admin' && me && !me.isAdmin ? 'lunches' : tab;

  return (
    <ToastProvider>
      <div className="app">
        <a className="skip-link" href="#main">
          Přeskočit na obsah
        </a>
        <header className="topbar">
          <div className="topbar-inner">
            <a
              className="brand"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                go('lunches');
              }}
            >
              <BrandMark />
              <span className="brand-name">bobo</span>
              <span className="brand-tag">obědy</span>
            </a>
            <nav className="nav-top" aria-label="Hlavní navigace">
              {tabs.map((t) => (
                <button
                  key={t}
                  className={t === active ? 'active' : ''}
                  aria-current={t === active ? 'page' : undefined}
                  onClick={() => go(t)}
                >
                  <Icon name={ICONS[t]} size={18} />
                  {LABELS[t]}
                </button>
              ))}
            </nav>
            <div className="who" title={me?.email}>
              {isDevMode() && <span className="badge badge-dev">DEV · {getDevUser().split('@')[0]}</span>}
              {me && (
                <button className="who-btn" onClick={() => go('settings')} aria-label={`Účet: ${me.name || me.email}`}>
                  <Avatar name={me.name || me.email} seed={me.id} size="sm" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="content" id="main">
          {error && <ErrorState text={error} onRetry={loadMe} />}
          {!error && !me && <LunchesSkeleton />}
          {me && (
            <div className="view" key={active}>
              {active === 'lunches' && <LunchesPage me={me} />}
              {active === 'settings' && <SettingsPage me={me} onMeChange={setMe} />}
              {active === 'admin' && <AdminPage />}
            </div>
          )}
        </main>

        <nav className="tabbar" aria-label="Hlavní navigace">
          <div className="tabbar-inner" style={{ ['--tabs' as string]: tabs.length }}>
            {tabs.map((t) => (
              <button
                key={t}
                className={t === active ? 'active' : ''}
                aria-current={t === active ? 'page' : undefined}
                onClick={() => go(t)}
              >
                <span className="tab-icon">
                  <Icon name={ICONS[t]} size={22} strokeWidth={t === active ? 2.2 : 1.9} />
                </span>
                <span className="tab-label">{LABELS[t]}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
