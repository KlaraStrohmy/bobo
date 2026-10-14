import { useEffect, useState } from 'react';
import { api, DEFAULT_DEV_USER, DEV_USER_KEY, errorMessage, getDevUser, isDevMode } from '../api';
import { useConfig } from '../config';
import { Avatar, Callout, Toggle } from '../components';
import { Icon, type IconName } from '../icons';
import { currentSubscription, isIos, isStandalone, pushSupported, subscribe, unsubscribe } from '../push';
import { useToast } from '../toast';
import type { Me } from '../types';

type SubState = 'unknown' | 'none' | 'subscribed' | 'unsupported';

const SUB_VIEW: Record<SubState, { icon: IconName; tone: string; title: string }> = {
  subscribed: { icon: 'bell', tone: 'ok', title: 'Notifikace jsou zapnuté' },
  none: { icon: 'bellOff', tone: 'off', title: 'Notifikace jsou vypnuté' },
  unsupported: { icon: 'alert', tone: 'warn', title: 'Notifikace nejsou podporované' },
  unknown: { icon: 'bell', tone: 'off', title: 'Zjišťuji stav…' },
};

export default function SettingsPage({ me, onMeChange }: { me: Me; onMeChange: (m: Me) => void }) {
  const toast = useToast();
  const { vapidPublicKey } = useConfig();
  const [time, setTime] = useState(me.reminderTime);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<SubState>('unknown');
  const [pushBusy, setPushBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const iosNeedsInstall = isIos() && !isStandalone();

  useEffect(() => setTime(me.reminderTime), [me.reminderTime]);

  const refreshSub = async () => {
    if (!pushSupported()) {
      setSub('unsupported');
      return;
    }
    try {
      setSub((await currentSubscription()) ? 'subscribed' : 'none');
    } catch {
      setSub('none');
    }
  };

  useEffect(() => {
    void refreshSub();
  }, []);

  const savePrefs = async (reminderEnabled: boolean, reminderTime: string) => {
    if (!/^\d{2}:\d{2}$/.test(reminderTime)) {
      toast('Zadej čas ve formátu HH:MM', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Me>('/me/preferences', { method: 'PUT', body: { reminderEnabled, reminderTime } });
      onMeChange(updated);
      toast(reminderEnabled ? `Připomínka nastavena na ${updated.reminderTime}` : 'Připomínka vypnuta', 'ok');
    } catch (e) {
      toast(errorMessage(e), 'error');
      setTime(me.reminderTime);
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    try {
      await subscribe(vapidPublicKey);
      toast('Notifikace na tomto zařízení zapnuty', 'ok');
      onMeChange({ ...me, pushSubscribed: true });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      if ('Notification' in window) setPermission(Notification.permission);
      await refreshSub();
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      await unsubscribe();
      toast('Notifikace na tomto zařízení vypnuty', 'ok');
      api<Me>('/me').then(onMeChange, () => undefined);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      await refreshSub();
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    try {
      const res = await api<{ sent: number }>('/push/test', { method: 'POST' });
      toast(res.sent ? `Odesláno na ${res.sent} zařízení` : 'Nemáš žádné zařízení s notifikacemi', res.sent ? 'ok' : 'error');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setPushBusy(false);
    }
  };

  const view = SUB_VIEW[sub];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Nastavení</h1>
        <p className="page-sub">Připomínky a notifikace pro tohle zařízení.</p>
      </header>

      <section className="card profile">
        <Avatar name={me.name || me.email} seed={me.id} size="lg" />
        <div className="profile-text">
          <strong>{me.name || me.email}</strong>
          <span className="muted">{me.email}</span>
        </div>
        {me.isAdmin && <span className="badge badge-accent">admin</span>}
      </section>

      <h2 className="group-label">Denní připomínka</h2>
      <section className="card group">
        <div className="row">
          <span className="row-icon tone-accent">
            <Icon name="bell" size={18} />
          </span>
          <div className="row-text">
            <span className="row-title">Připomínat oběd</span>
            <span className="row-sub">Den předem, když se vaří a ještě nemáš odpověď.</span>
          </div>
          <Toggle label="Připomínat oběd" hideLabel checked={me.reminderEnabled} disabled={saving} onChange={(v) => savePrefs(v, time)} />
        </div>
        <div className={`row ${me.reminderEnabled ? '' : 'row-dim'}`}>
          <span className="row-icon tone-saffron">
            <Icon name="clock" size={18} />
          </span>
          <label className="row-text" htmlFor="reminder-time">
            <span className="row-title">Čas připomínky</span>
            <span className="row-sub">Kdy ti přijde notifikace.</span>
          </label>
          <input
            id="reminder-time"
            className="time-input"
            type="time"
            value={time}
            step={60}
            disabled={saving}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => time !== me.reminderTime && savePrefs(me.reminderEnabled, time)}
          />
        </div>
      </section>
      {me.reminderEnabled && sub === 'none' && (
        <Callout>Připomínka je zapnutá, ale toto zařízení nemá povolené notifikace — nic ti sem nepřijde.</Callout>
      )}

      <h2 className="group-label">Notifikace na tomto zařízení</h2>
      <section className="card group">
        <div className="row row-status">
          <span className={`status-badge tone-${view.tone}`}>
            <Icon name={view.icon} size={22} />
          </span>
          <div className="row-text">
            <span className="row-title">{view.title}</span>
            <span className="row-sub">
              {me.pushSubscribed && sub !== 'subscribed'
                ? 'Na jiném zařízení je máš zapnuté.'
                : sub === 'subscribed'
                  ? 'Připomínky ti budou chodit sem.'
                  : 'Povol je, ať ti připomínka dorazí.'}
            </span>
          </div>
        </div>
        {(permission === 'denied' || (sub === 'unsupported' && !iosNeedsInstall)) && (
          <div className="row row-block">
            {permission === 'denied' && (
              <Callout>Notifikace jsou v prohlížeči zablokované. Povol je v nastavení webu/prohlížeče a zkus to znovu.</Callout>
            )}
            {sub === 'unsupported' && !iosNeedsInstall && <Callout>Tento prohlížeč web push notifikace nepodporuje.</Callout>}
          </div>
        )}
        <div className="row row-block">
          <div className="btn-row">
            {sub !== 'subscribed' ? (
              <button className="btn btn-primary" disabled={pushBusy || sub === 'unsupported'} onClick={enablePush}>
                <Icon name="bell" size={17} />
                Povolit notifikace
              </button>
            ) : (
              <button className="btn" disabled={pushBusy} onClick={disablePush}>
                <Icon name="bellOff" size={17} />
                Vypnout notifikace
              </button>
            )}
            <button className="btn btn-ghost" disabled={pushBusy || !me.pushSubscribed} onClick={testPush}>
              <Icon name="send" size={16} />
              Poslat test
            </button>
          </div>
        </div>
      </section>

      {iosNeedsInstall && <IosInstallCard />}

      {isDevMode() && (
        <>
          <h2 className="group-label">Vývoj</h2>
          <section className="card group">
            <DevUserSwitch />
          </section>
        </>
      )}

      <p className="footnote">bobo · přihlašování na obědy</p>
    </div>
  );
}

function IosInstallCard() {
  const steps: { icon: IconName; title: string; text: string }[] = [
    { icon: 'share', title: 'Klepni na Sdílet', text: 'Ikona se šipkou dole v Safari.' },
    { icon: 'plusSquare', title: 'Přidat na plochu', text: 'Najdeš ji v nabídce níž.' },
    { icon: 'smartphone', title: 'Otevři Bobo z plochy', text: 'Pak tady povol notifikace.' },
  ];
  return (
    <section className="card ios-card" aria-label="Instalace na iPhone">
      <div className="ios-head">
        <img src="/favicon.svg" alt="" width={44} height={44} />
        <div>
          <h2>Přidej si Bobo na plochu</h2>
          <p>Na iPhonu fungují notifikace jen v nainstalované aplikaci.</p>
        </div>
      </div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="step-icon">
              <Icon name={s.icon} size={20} />
              <span className="step-num">{i + 1}</span>
            </span>
            <span className="step-text">
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DevUserSwitch() {
  const [value, setValue] = useState(getDevUser());
  return (
    <form
      className="row dev-switch"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          localStorage.setItem(DEV_USER_KEY, value.trim() || DEFAULT_DEV_USER);
        } catch {
          /* ignore */
        }
        window.location.reload();
      }}
    >
      <span className="row-icon tone-ink">
        <Icon name="user" size={18} />
      </span>
      <label className="field grow">
        <span className="field-label">Dev uživatel</span>
        <input type="email" name="dev-user" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn" type="submit">
        Přepnout
      </button>
    </form>
  );
}
