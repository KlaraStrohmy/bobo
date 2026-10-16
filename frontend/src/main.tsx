import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  InteractionRequiredAuthError,
  InteractionStatus,
  PublicClientApplication,
  type RedirectRequest,
} from '@azure/msal-browser';
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react';
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

/**
 * Signs in with a plain redirect (no hidden-iframe silent attempt first). The silent attempt
 * times out when third-party cookies are blocked or the redirect URI is not registered, and
 * then the user only saw "timed_out" instead of the Microsoft sign-in page.
 */
function AuthGate({ request, children }: { request: RedirectRequest; children: ReactNode }) {
  const { instance, inProgress } = useMsal();
  const authenticated = useIsAuthenticated();
  useEffect(() => {
    if (!authenticated && inProgress === InteractionStatus.None) {
      instance.loginRedirect(request).catch(() => {});
    }
  }, [authenticated, inProgress, instance, request]);
  return authenticated ? <>{children}</> : <Splash text="Přihlašuji…" />;
}

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

  setTokenProvider(async () => {
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
    if (!account) {
      await pca.loginRedirect(loginRequest);
      throw new Error('Přesměrovávám na přihlášení…');
    }
    try {
      const res = await pca.acquireTokenSilent({ ...loginRequest, account });
      return res.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        await pca.acquireTokenRedirect({ ...loginRequest, account });
        throw new Error('Přesměrovávám na přihlášení…');
      }
      throw err;
    }
  });

  setLogoutHandler(async () => {
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
    await pca.logoutRedirect({ account, postLogoutRedirectUri: window.location.origin });
  });

  root.render(
    <StrictMode>
      <ConfigContext.Provider value={config}>
        <MsalProvider instance={pca}>
          <AuthGate request={loginRequest}>
            <App />
          </AuthGate>
        </MsalProvider>
      </ConfigContext.Provider>
    </StrictMode>,
  );
}

bootstrap().catch((err: unknown) => {
  root.render(<Splash error text={`Aplikaci se nepodařilo spustit: ${err instanceof Error ? err.message : String(err)}`} />);
});
