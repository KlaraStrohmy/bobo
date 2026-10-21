import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  PublicClientApplication,
  type RedirectRequest,
} from '@azure/msal-browser';
import { registerSW } from 'virtual:pwa-register';
import { enableDevMode, fetchConfig, setLogoutHandler, setTokenProvider } from './api';
import { ConfigContext } from './config';
import App from './App';
import { captureInstallEvents } from './install';
import './fonts.css';
import './styles.css';

// Before anything async: Chromium may fire `beforeinstallprompt` right after load.
captureInstallEvents();
registerSW({ immediate: true });

const root = createRoot(document.getElementById('root')!);

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className={`splash ${error ? 'splash-error' : ''}`} role={error ? 'alert' : 'status'}>
      <div className="splash-logo">
        <img src="/favicon.svg" alt="" width={88} height={88} />
      </div>
      <div className="splash-word">bobo</div>
      <p className="splash-text">{text}</p>
      {!error && (
        <span className="splash-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

/** Thrown once a full-page sign-in redirect has started; the page is about to unload. */
class RedirectingError extends Error {
  constructor() {
    super('Přesměrovávám na přihlášení…');
  }
}

/**
 * Whether a failed silent token request can only be fixed by a full-page sign-in.
 * Besides interaction_required this covers the hidden-iframe renewal timing out (`timed_out`),
 * which happens once the 24h SPA refresh token expires and the iframe can't reach the
 * Entra session (e.g. third-party cookies blocked). Only a lost connection is worth a retry instead.
 */
function needsRedirect(err: unknown): boolean {
  return !(err instanceof BrowserAuthError && err.errorCode === BrowserAuthErrorCodes.noNetworkConnectivity);
}

async function bootstrap(): Promise<void> {
  root.render(<Splash text="Načítám…" />);
  const config = await fetchConfig();

  if (!config.clientId) {
    // Local development against a backend with AUTH_DISABLED: no MSAL, X-Dev-User header instead.
    enableDevMode();
    root.render(
      <StrictMode>
        <ConfigContext.Provider value={config}>
          <App />
        </ConfigContext.Provider>
      </StrictMode>,
    );
    return;
  }

  const pca = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await pca.initialize();

  const result = await pca.handleRedirectPromise();
  if (result?.account) {
    pca.setActiveAccount(result.account);
  } else if (!pca.getActiveAccount() && pca.getAllAccounts().length > 0) {
    pca.setActiveAccount(pca.getAllAccounts()[0]);
  }

  const loginRequest: RedirectRequest = { scopes: [config.apiScope] };

  const acquireToken = async (): Promise<string> => {
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
    if (!account) {
      await pca.loginRedirect(loginRequest);
      throw new RedirectingError();
    }
    try {
      const res = await pca.acquireTokenSilent({ ...loginRequest, account });
      return res.accessToken;
    } catch (err) {
      if (needsRedirect(err)) {
        await pca.acquireTokenRedirect({ ...loginRequest, account });
        throw new RedirectingError();
      }
      throw err;
    }
  };
  setTokenProvider(acquireToken);

  setLogoutHandler(async () => {
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
    await pca.logoutRedirect({ account, postLogoutRedirectUri: window.location.origin });
  });

  // Sign in (or renew) before rendering the app; a redirect leaves the splash up until the page unloads.
  root.render(<Splash text="Přihlašuji…" />);
  await acquireToken();

  root.render(
    <StrictMode>
      <ConfigContext.Provider value={config}>
        <App />
      </ConfigContext.Provider>
    </StrictMode>,
  );
}

bootstrap().catch((err: unknown) => {
  if (err instanceof RedirectingError) return;
  root.render(<Splash error text={`Aplikaci se nepodařilo spustit: ${err instanceof Error ? err.message : String(err)}`} />);
});
