// PWA install detection: installed state, platform/browser environment, and the
// `beforeinstallprompt` event captured as early as possible (see main.tsx).

/** Which install instructions apply to the current browser. */
export type InstallKind =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-firefox'
  | 'ios-edge'
  | 'ios-other' // another iOS browser: Add to Home Screen only via its share sheet, Safari is safer
  | 'ios-old' // iOS < 16.4: only Safari can add, and web push isn't available at all
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'desktop-chromium' // Chrome, Edge, Brave, Opera… — installable from the address bar
  | 'desktop-safari' // Safari 17+: File → Add to Dock
  | 'desktop-safari-old'
  | 'desktop-firefox' // not installable
  | 'desktop-other'
  | 'inapp'; // webview inside Teams, Outlook, Facebook… — open in a real browser first

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallEnv {
  kind: InstallKind;
  platform: InstallPlatform;
  /** Edge on desktop/Android (for wording only). */
  edge: boolean;
}

interface UaBrand {
  brand: string;
}
interface UaData {
  brands?: UaBrand[];
  mobile?: boolean;
  platform?: string;
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Teams\/|Outlook-(iOS|Android)|MicroMessenger|Line\/|Snapchat|Twitter|GSA\//;

function iosVersion(ua: string): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

/**
 * Pure environment detection from the user agent. The UA string is the primary signal;
 * `userAgentData` (Chromium only) is used just to tell Edge from Chrome.
 */
export function detectEnv(ua: string, maxTouchPoints = 0, uaData?: UaData): InstallEnv {
  const ipadAsMac = /Macintosh/.test(ua) && maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadAsMac;
  const android = /Android/.test(ua);
  const platform: InstallPlatform = ios ? 'ios' : android ? 'android' : 'desktop';
  const edge = /Edg(A|iOS)?\//.test(ua) || !!uaData?.brands?.some((b) => b.brand === 'Microsoft Edge');

  if (IN_APP.test(ua)) return { kind: 'inapp', platform, edge };

  if (ios) {
    // iPadOS in desktop mode carries no iOS version; any such iPad is recent enough.
    const v = ipadAsMac ? null : iosVersion(ua);
    const modern = v === null || v >= 16.04;
    if (/CriOS\//.test(ua)) return { kind: modern ? 'ios-chrome' : 'ios-old', platform, edge };
    if (/FxiOS\//.test(ua)) return { kind: modern ? 'ios-firefox' : 'ios-old', platform, edge };
    if (/EdgiOS\//.test(ua)) return { kind: modern ? 'ios-edge' : 'ios-old', platform, edge: true };
    // A WKWebView in some app has no "Safari/" token (an installed web app doesn't either,
    // which is why callers check isInstalled() first).
    if (!/Safari\//.test(ua)) return { kind: 'inapp', platform, edge };
    if (/OPiOS|YaBrowser|DuckDuckGo|Brave/.test(ua)) return { kind: modern ? 'ios-other' : 'ios-old', platform, edge };
    return { kind: modern ? 'ios-safari' : 'ios-old', platform, edge };
  }

  if (android) {
    if (/; wv\)/.test(ua)) return { kind: 'inapp', platform, edge };
    if (/SamsungBrowser\//.test(ua)) return { kind: 'android-samsung', platform, edge };
    if (/Firefox\//.test(ua)) return { kind: 'android-firefox', platform, edge };
    if (/Chrome\//.test(ua) && !/OPR\/|UCBrowser|MiuiBrowser|HuaweiBrowser/.test(ua)) {
      return { kind: 'android-chrome', platform, edge };
    }
    return { kind: 'android-other', platform, edge };
  }

  if (/Firefox\//.test(ua) && !/Seamonkey/.test(ua)) return { kind: 'desktop-firefox', platform, edge };
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return { kind: 'desktop-chromium', platform, edge };
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) {
    const v = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return { kind: v >= 17 ? 'desktop-safari' : 'desktop-safari-old', platform, edge };
  }
  return { kind: 'desktop-other', platform, edge };
}

export function currentEnv(): InstallEnv {
  const nav = navigator as Navigator & { userAgentData?: UaData };
  return detectEnv(nav.userAgent, nav.maxTouchPoints ?? 0, nav.userAgentData);
}

const INSTALLED_QUERIES = ['(display-mode: standalone)', '(display-mode: window-controls-overlay)', '(display-mode: fullscreen)'];

/** Whether the app runs as an installed PWA (home screen / dock / app window). */
export function isInstalled(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return INSTALLED_QUERIES.some((q) => window.matchMedia(q).matches);
}

export function isIos(): boolean {
  return currentEnv().platform === 'ios';
}

// --- beforeinstallprompt / appinstalled ------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const installedListeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Call once before the first render so an early `beforeinstallprompt` isn't lost. */
export function captureInstallEvents(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away; we offer our own button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedFlag = true;
    emit();
    for (const l of installedListeners) l();
  });
  for (const q of INSTALLED_QUERIES) {
    window.matchMedia(q).addEventListener?.('change', emit);
  }
}

export interface InstallState {
  installed: boolean;
  /** A native install dialog is available (Chromium fired `beforeinstallprompt`). */
  canPrompt: boolean;
}

export function installState(): InstallState {
  return { installed: installedFlag || isInstalled(), canPrompt: deferred !== null };
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Fires when the browser reports the app was just installed. */
export function onAppInstalled(fn: () => void): () => void {
  installedListeners.add(fn);
  return () => {
    installedListeners.delete(fn);
  };
}

/** Shows the native install dialog; resolves to true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null; // the event is single-use
  emit();
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome === 'accepted';
}
