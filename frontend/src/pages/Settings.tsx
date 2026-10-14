import { useEffect, useState } from 'react';
import { signOut } from '../account';
import { api, ApiError, canLogout, DEFAULT_DEV_USER, DEV_USER_KEY, errorMessage, getDevUser, isDevMode } from '../api';
import { useConfig } from '../config';
import { Avatar, Callout, Toggle } from '../components';
import { Icon, type IconName } from '../icons';
import { InstallGuide, useInstall } from '../installGuide';
import { currentSubscription, pushSupported, subscribe, unsubscribe } from '../push';
import { useToast } from '../toast';
import type { Me } from '../types';

type SubState = 'unknown' | 'none' | 'subscribed' | 'unsupported';

const SUB_VIEW: Record<SubState, { icon: IconName; tone: string; title: string }> = {
  subscribed: { icon: 'bell', tone: 'ok', title: 'Notifikace jsou zapnuté' },
  none: { icon: 'bellOff', tone: 'off', title: 'Notifikace jsou vypnuté' },
  unsupported: { icon: 'alert', tone: 'warn', title: 'Notifikace nejsou podporované' },
  unknown: { icon: 'bell', tone: 'off', title: 'Zjišťuji stav…' },
};

/** "16:00" → "15:59"; null for a deadline with no valid time before it. */
function minuteBefore(hhmm: string): string | null {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m - 1;
  if (!Number.isFinite(total) || total < 0) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

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
  const [timeError, setTimeError] = useState<string | null>(null);
  const install = useInstall();
  const iosNeedsInstall = install.env.platform === 'ios' && !install.installed;

  // Older backends may not send these yet: treat missing as "no restriction".
  const deadline = me.reminderDeadline ?? null;
  const possible = me.remindersPossible !== false;
  const maxTime = deadline ? minuteBefore(deadline) : null;
  const savedTooLate = me.reminderEnabled && possible && deadline !== null && me.reminderTime >= deadline;

  useEffect(() => setTime(me.reminderTime), [me.reminderTime]);

  const validateTime = (t: string): string | null => {
    if (!/^\d{2}:\d{2}$/.test(t)) return 'Zadej čas ve formátu HH:MM.';
    if (deadline && t >= deadline) {
      return maxTime
        ? `Připomínka musí být před uzávěrkou (${deadline}) — nejpozději v ${maxTime}.`
        : `Připomínka musí být před uzávěrkou (${deadline}).`;
    }
    return null;
  };

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

  /** `checkTime`: validate against the deadline (always when enabling or editing the time). */
  const savePrefs = async (reminderEnabled: boolean, reminderTime: string, checkTime = reminderEnabled) => {
    const invalid = checkTime ? validateTime(reminderTime) : null;
    if (invalid) {
      setTimeError(invalid);
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Me>('/me/preferences', { method: 'PUT', body: { reminderEnabled, reminderTime } });
      onMeChange(updated);
      setTimeError(null);
      toast(reminderEnabled ? `Připomínka nastavena na ${updated.reminderTime}` : 'Připomínka vypnuta', 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        // Keep the typed value so it can be corrected; the server says why it's wrong.
        setTimeError(e.detail || 'Tenhle čas nejde nastavit.');
      } else {
        toast(errorMessage(e), 'error');
        setTime(me.reminderTime);
      }
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

  const installSection = (
    <>
      <h2 className="group-label">Aplikace</h2>
      <InstallGuide />
    </>
  );

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
        <div className={`row ${possible || me.reminderEnabled ? '' : 'row-dim'}`}>
          <span className="row-icon tone-accent">
            <Icon name="bell" size={18} />
          </span>
          <div className="row-text">
            <span className="row-title">Připomínat oběd</span>
            <span className="row-sub">Notifikace den před obědem.</span>
          </div>
          <Toggle
            label="Připomínat oběd"
            name="reminder-enabled"
            hideLabel
            checked={me.reminderEnabled}
            // Never trap an enabled reminder: switching it off stays possible.
            disabled={saving || (!possible && !me.reminderEnabled)}
            onChange={(v) => savePrefs(v, time)}
          />
        </div>
        <div className={`row ${me.reminderEnabled && possible ? '' : 'row-dim'}`}>
          <span className="row-icon tone-saffron">
            <Icon name="clock" size={18} />
          </span>
          <label className="row-text" htmlFor="reminder-time">
            <span className="row-title">Čas připomínky</span>
            <span className="row-sub">
              {possible && maxTime ? `Nejpozději v ${maxTime}.` : 'Kdy ti přijde notifikace.'}
            </span>
          </label>
          <input
            id="reminder-time"
            className={`time-input ${timeError ? 'is-invalid' : ''}`}
            type="time"
            value={time}
            step={60}
            max={maxTime ?? undefined}
            disabled={saving || !possible}
            aria-invalid={timeError ? true : undefined}
            aria-describedby={timeError ? 'reminder-time-error' : undefined}
            onChange={(e) => {
              setTime(e.target.value);
              if (timeError) setTimeError(null);
            }}
            onBlur={() => time !== me.reminderTime && savePrefs(me.reminderEnabled, time, true)}
          />
        </div>
        {timeError && (
          <div className="row row-block row-error">
            <p className="field-error" id="reminder-time-error" role="alert">
              <Icon name="alert" size={16} />
              {timeError}
            </p>
          </div>
        )}
        {!possible && (
          <div className="row row-block">
            <Callout kind="info">
              Připomínky teď nefungují — uzávěrka přihlášek je víc než den předem, takže by připomínka den předem přišla až po ní.
            </Callout>
          </div>
        )}
      </section>
      {savedTooLate && (
        <Callout>
          Připomínka v {me.reminderTime} nepřijde — uzávěrka je v {deadline}. Nastav dřívější čas.
        </Callout>
      )}
      {me.reminderEnabled && sub === 'none' && (
        <Callout>Připomínka je zapnutá, ale toto zařízení nemá povolené notifikace — nic ti sem nepřijde.</Callout>
      )}
      {possible && (
        <p className="group-hint">
          Připomínka se ptá na zítřek, pokud se zítra vaří a ještě jsi neodpověděl. Odpovědět jde přímo z notifikace do
          uzávěrky{deadline ? ` (${deadline})` : ''}.
          {install.env.platform === 'desktop' && (
            <> Na počítači musí běžet prohlížeč (stačí na pozadí). Na telefonu s nainstalovanou aplikací notifikace přijdou vždy.</>
          )}
          {iosNeedsInstall && (
            <>
              {' '}
              Na iPhonu přijdou jen do nainstalované aplikace — <a href="#install">postup instalace</a>.
            </>
          )}
        </p>
      )}

      {iosNeedsInstall && installSection}

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

      {!iosNeedsInstall && installSection}

      {canLogout() && <AccountCard me={me} />}

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

function AccountCard({ me }: { me: Me }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="group-label">Účet</h2>
      <section className="card group">
        <div className="account-row">
          <Avatar name={me.name || me.email} seed={me.id} size="md" />
          <div className="account-text">
            <div className="account-name">{me.name || me.email}</div>
            <div className="account-email">{me.email}</div>
          </div>
        </div>
        <button className="btn btn-block btn-signout" disabled={busy} onClick={onSignOut}>
          <Icon name="logout" size={17} />
          {busy ? 'Odhlašuji…' : 'Odhlásit se'}
        </button>
      </section>
    </>
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
