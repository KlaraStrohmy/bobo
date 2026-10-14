import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Callout } from './components';
import { Icon, type IconName } from './icons';
import {
  currentEnv,
  installState,
  onAppInstalled,
  promptInstall,
  subscribeInstall,
  type InstallEnv,
  type InstallKind,
} from './install';
import { useToast } from './toast';

interface Step {
  icon: IconName;
  title: ReactNode;
  text?: ReactNode;
}

interface Guide {
  title: string;
  lead: string;
  steps: Step[];
  note?: { kind: 'warn' | 'info'; text: ReactNode };
  /** Show the Obědy banner: the steps actually lead to an installed app (or out of a webview). */
  banner: boolean;
}

const OPEN_FROM_HOME: Step = { icon: 'smartphone', title: 'Otevři Bobo z plochy', text: 'Pak v Nastavení povol notifikace.' };
const ADD_TO_HOME: Step = { icon: 'plusSquare', title: 'Přidat na plochu', text: 'Najdeš v nabídce, případně po posunutí níž.' };

const IOS_LEAD = 'Na iPhonu fungují notifikace jen v nainstalované aplikaci.';
const LEAD = 'Otevře se jedním klepnutím jako aplikace a připomínky chodí spolehlivěji.';
const DESKTOP_LEAD = 'Poběží ve vlastním okně a připomínky chodí spolehlivěji.';
const NO_INSTALL_LEAD = 'Nainstalovaná aplikace běží ve vlastním okně, ale tenhle prohlížeč to neumí.';

function guideFor(env: InstallEnv): Guide {
  const k: InstallKind = env.kind;
  switch (k) {
    case 'ios-safari':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: true,
        steps: [
          { icon: 'share', title: 'Klepni na Sdílet', text: 'Ikona se šipkou v liště Safari (v iOS 26 pod tlačítkem ⋯).' },
          ADD_TO_HOME,
          OPEN_FROM_HOME,
        ],
      };
    case 'ios-chrome':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: true,
        steps: [
          { icon: 'share', title: 'Klepni na Sdílet', text: 'Ikona se šipkou vpravo v adresním řádku Chromu.' },
          ADD_TO_HOME,
          OPEN_FROM_HOME,
        ],
        note: { kind: 'info', text: 'Jde to i ze Safari — tam je postup nejspolehlivější.' },
      };
    case 'ios-firefox':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: true,
        steps: [
          { icon: 'menu', title: 'Otevři menu ☰', text: 'Vpravo dole ve Firefoxu.' },
          { icon: 'share', title: 'Sdílet', text: 'Otevře systémovou nabídku sdílení.' },
          ADD_TO_HOME,
          OPEN_FROM_HOME,
        ],
        note: { kind: 'info', text: 'Jde to i ze Safari — tam je postup nejspolehlivější.' },
      };
    case 'ios-edge':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: true,
        steps: [
          { icon: 'moreHorizontal', title: 'Otevři menu ⋯', text: 'Dole uprostřed v Edge.' },
          { icon: 'share', title: 'Sdílet', text: 'Otevře systémovou nabídku sdílení.' },
          ADD_TO_HOME,
          OPEN_FROM_HOME,
        ],
        note: { kind: 'info', text: 'Jde to i ze Safari — tam je postup nejspolehlivější.' },
      };
    case 'ios-other':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: true,
        steps: [{ icon: 'share', title: 'Najdi Sdílet', text: 'V nabídce prohlížeče.' }, ADD_TO_HOME, OPEN_FROM_HOME],
        note: { kind: 'info', text: 'Volbu nevidíš? Otevři tuhle stránku v Safari.' },
      };
    case 'ios-old':
      return {
        title: 'Přidej si Bobo na plochu',
        lead: IOS_LEAD,
        banner: false,
        steps: [
          { icon: 'share', title: 'V Safari klepni na Sdílet', text: 'Ikona se šipkou v liště Safari.' },
          ADD_TO_HOME,
          OPEN_FROM_HOME,
        ],
        note: { kind: 'warn', text: 'Notifikace potřebují iOS 16.4 nebo novější. Nejdřív aktualizuj iPhone.' },
      };
    case 'android-chrome':
      return {
        title: 'Nainstaluj si Bobo',
        lead: LEAD,
        banner: true,
        steps: env.edge
          ? [
              { icon: 'moreHorizontal', title: 'Otevři menu ⋯', text: 'Dole uprostřed v Edge.' },
              { icon: 'download', title: 'Přidat do telefonu', text: 'Pak potvrď Instalovat.' },
              OPEN_FROM_HOME,
            ]
          : [
              { icon: 'moreVertical', title: 'Otevři menu ⋮', text: 'Vpravo nahoře v Chromu.' },
              { icon: 'download', title: 'Instalovat aplikaci', text: 'Případně „Přidat na plochu“ → Instalovat.' },
              OPEN_FROM_HOME,
            ],
      };
    case 'android-samsung':
      return {
        title: 'Nainstaluj si Bobo',
        lead: LEAD,
        banner: true,
        steps: [
          { icon: 'menu', title: 'Otevři menu ☰', text: 'Vpravo dole v Samsung Internetu.' },
          { icon: 'plusSquare', title: 'Přidat stránku do → Plocha', text: 'Nebo klepni na ikonu stažení v adresním řádku.' },
          OPEN_FROM_HOME,
        ],
      };
    case 'android-firefox':
      return {
        title: 'Nainstaluj si Bobo',
        lead: LEAD,
        banner: true,
        steps: [
          { icon: 'moreVertical', title: 'Otevři menu ⋮', text: 'Vedle adresního řádku Firefoxu.' },
          { icon: 'download', title: 'Instalovat', text: 'Případně „Přidat na plochu“.' },
          OPEN_FROM_HOME,
        ],
      };
    case 'android-other':
      return {
        title: 'Nainstaluj si Bobo',
        lead: LEAD,
        banner: true,
        steps: [
          { icon: 'moreVertical', title: 'Otevři menu prohlížeče', text: 'Obvykle ⋮ nebo ☰.' },
          { icon: 'download', title: 'Instalovat / Přidat na plochu', text: 'Název se liší podle prohlížeče.' },
          OPEN_FROM_HOME,
        ],
        note: { kind: 'info', text: 'Nejspolehlivější je Chrome — pokud volbu nenajdeš, otevři stránku v něm.' },
      };
    case 'desktop-chromium':
      return {
        title: 'Nainstaluj si Bobo',
        lead: DESKTOP_LEAD,
        banner: true,
        steps: env.edge
          ? [
              { icon: 'appsPlus', title: 'Klikni na ikonu instalace', text: 'Vpravo v adresním řádku (čtverečky s +).' },
              { icon: 'download', title: 'Nainstalovat', text: 'Bez ikony: menu ⋯ → Aplikace → Nainstalovat tento web jako aplikaci.' },
            ]
          : [
              { icon: 'monitorDown', title: 'Klikni na ikonu instalace', text: 'Vpravo v adresním řádku (monitor se šipkou).' },
              { icon: 'download', title: 'Nainstalovat', text: 'Bez ikony: menu ⋮ → Uložit a sdílet → Nainstalovat stránku jako aplikaci.' },
            ],
      };
    case 'desktop-safari':
      return {
        title: 'Přidej si Bobo do Docku',
        lead: DESKTOP_LEAD,
        banner: true,
        steps: [
          { icon: 'dock', title: 'Soubor → Přidat do Docku', text: 'V menu nahoře, nebo přes tlačítko Sdílet.' },
          { icon: 'download', title: 'Potvrď Přidat', text: 'Bobo se pak otevírá jako samostatná aplikace.' },
        ],
      };
    case 'desktop-safari-old':
      return {
        title: 'Instalace aplikace',
        lead: NO_INSTALL_LEAD,
        banner: false,
        steps: [],
        note: {
          kind: 'info',
          text: 'Safari starší než 17 aplikace instalovat neumí. Aktualizuj macOS, použij Chrome či Edge, nebo nech Bobo otevřené v záložce.',
        },
      };
    case 'desktop-firefox':
      return {
        title: 'Instalace aplikace',
        lead: NO_INSTALL_LEAD,
        banner: false,
        steps: [],
        note: {
          kind: 'info',
          text: 'Firefox na počítači instalaci aplikací nepodporuje. Použij Chrome nebo Edge, nebo nech Bobo otevřené v připnuté záložce — notifikace chodí, dokud Firefox běží.',
        },
      };
    case 'desktop-other':
      return {
        title: 'Instalace aplikace',
        lead: NO_INSTALL_LEAD,
        banner: false,
        steps: [],
        note: { kind: 'info', text: 'V tomhle prohlížeči instalaci neumíme popsat. Nejlíp to jde v Chrome nebo Edge.' },
      };
    case 'inapp':
      return {
        title: 'Otevři Bobo v prohlížeči',
        lead: 'Jsi ve vestavěném prohlížeči jiné aplikace (Teams, Outlook…) — odsud se Bobo nainstalovat nedá.',
        banner: true,
        steps: [
          {
            icon: 'externalLink',
            title: 'Otevřít v prohlížeči',
            text: env.platform === 'ios' ? 'V menu ⋯ nebo Sdílet zvol „Otevřít v Safari“.' : 'V menu ⋮ zvol „Otevřít v prohlížeči“.',
          },
          { icon: 'copy', title: 'Nebo zkopíruj odkaz', text: 'A vlož ho do Safari, Chromu nebo Edge.' },
        ],
      };
  }
}

// --- state hook ------------------------------------------------------------------------

export function useInstall() {
  const installed = useSyncExternalStore(subscribeInstall, () => installState().installed);
  const canPrompt = useSyncExternalStore(subscribeInstall, () => installState().canPrompt);
  const env = useMemo(currentEnv, []);
  return { installed, canPrompt, env };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Webviews often lack the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="step-icon">
            <Icon name={s.icon} size={20} />
            <span className="step-num">{i + 1}</span>
          </span>
          <span className="step-text">
            <strong>{s.title}</strong>
            {s.text && <span>{s.text}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function InstallButton({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const onClick = async () => {
    try {
      await promptInstall();
    } catch {
      toast('Instalaci se nepodařilo spustit.', 'error');
    }
  };
  return (
    <button className={`btn btn-primary ${compact ? 'btn-sm' : ''}`} onClick={onClick}>
      <Icon name="download" size={compact ? 16 : 17} />
      {compact ? 'Instalovat' : 'Nainstalovat aplikaci'}
    </button>
  );
}

function CopyLink() {
  const toast = useToast();
  const url = window.location.origin + '/';
  return (
    <div className="copy-link">
      <input type="text" name="app-link" readOnly value={url} aria-label="Odkaz na Bobo" onFocus={(e) => e.currentTarget.select()} />
      <button
        className="btn"
        onClick={async () => toast((await copyText(url)) ? 'Odkaz zkopírován' : 'Zkopíruj odkaz ručně', 'ok')}
      >
        <Icon name="copy" size={16} />
        Kopírovat
      </button>
    </div>
  );
}

function GuideBody({ guide, env, canPrompt }: { guide: Guide; env: InstallEnv; canPrompt: boolean }) {
  return (
    <>
      {canPrompt ? (
        <>
          <div className="install-cta">
            <InstallButton />
          </div>
          {guide.steps.length > 0 && (
            <details className="install-manual">
              <summary>
                Postup ručně <Icon name="chevronDown" size={16} />
              </summary>
              <Steps steps={guide.steps} />
            </details>
          )}
        </>
      ) : (
        guide.steps.length > 0 && <Steps steps={guide.steps} />
      )}
      {env.kind === 'inapp' && <CopyLink />}
      {guide.note && (
        <div className="install-note">
          <Callout kind={guide.note.kind}>{guide.note.text}</Callout>
        </div>
      )}
    </>
  );
}

/** Full install guide for Nastavení; a one-line status when already installed. */
export function InstallGuide() {
  const { installed, canPrompt, env } = useInstall();
  const guide = guideFor(env);

  if (installed) {
    return (
      <section className="card group" id="install">
        <div className="row">
          <span className="row-icon tone-ok">
            <Icon name="checkCircle" size={18} />
          </span>
          <div className="row-text">
            <span className="row-title">Aplikace je nainstalovaná</span>
            <span className="row-sub">Běžíš v nainstalované aplikaci — notifikace jsou nejspolehlivější.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card install-card" id="install" aria-labelledby="install-title">
      <div className="install-head">
        <img src="/favicon.svg" alt="" width={44} height={44} />
        <div>
          <h2 id="install-title">{guide.title}</h2>
          <p>{guide.lead}</p>
        </div>
      </div>
      <GuideBody guide={guide} env={env} canPrompt={canPrompt} />
    </section>
  );
}

const DISMISS_KEY = 'installBannerDismissedAt';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/** Compact, dismissible install prompt for the top of Obědy. */
export function InstallBanner() {
  const { installed, canPrompt, env } = useInstall();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [open, setOpen] = useState(false);
  const guide = guideFor(env);

  if (installed || hidden || !(guide.banner || canPrompt)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode: hide for this session only */
    }
    setHidden(true);
  };

  const sub =
    env.kind === 'inapp'
      ? 'Odsud se nainstalovat nedá.'
      : env.platform === 'ios'
        ? 'Na iPhonu ti jen tak přijdou notifikace.'
        : 'Připomínky pak chodí spolehlivěji.';

  const title = env.kind === 'inapp' ? 'Otevři v prohlížeči' : 'Nainstaluj Bobo';

  return (
    <section className="card install-banner" aria-label="Instalace aplikace">
      <div className="install-banner-row">
        <img src="/favicon.svg" alt="" width={36} height={36} />
        {canPrompt ? (
          <div className="install-banner-text">
            <strong>{title}</strong>
            <span>{sub}</span>
          </div>
        ) : (
          <button className="install-banner-text" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <strong>
              {title}
              <Icon name="chevronDown" size={16} strokeWidth={2.4} className={open ? 'flip' : ''} />
            </strong>
            <span>{sub}</span>
          </button>
        )}
        <div className="install-banner-actions">
          {canPrompt && <InstallButton compact />}
          <button className="icon-btn icon-btn-sm" aria-label="Skrýt na 14 dní" title="Skrýt" onClick={dismiss}>
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
      {open && !canPrompt && (
        <div className="install-banner-body">
          <GuideBody guide={guide} env={env} canPrompt={false} />
        </div>
      )}
    </section>
  );
}

/** Toasts when the browser reports a successful install; render once inside ToastProvider. */
export function InstallWatcher() {
  const toast = useToast();
  useEffect(() => onAppInstalled(() => toast('Aplikace je nainstalovaná', 'ok')), [toast]);
  return null;
}
