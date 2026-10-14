import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  InteractionRequiredAuthError,
  InteractionType,
  PublicClientApplication,
  type RedirectRequest,
} from '@azure/msal-browser';
import { MsalAuthenticationTemplate, MsalProvider } from '@azure/msal-react';
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
          <MsalAuthenticationTemplate
            interactionType={InteractionType.Redirect}
            authenticationRequest={loginRequest}
            loadingComponent={() => <Splash text="Přihlašuji…" />}
            errorComponent={({ error }) => <Splash error text={`Přihlášení selhalo: ${error?.message ?? ''}`} />}
          >
            <App />
          </MsalAuthenticationTemplate>
        </MsalProvider>
      </ConfigContext.Provider>
    </StrictMode>,
  );
}

bootstrap().catch((err: unknown) => {
  root.render(<Splash error text={`Aplikaci se nepodařilo spustit: ${err instanceof Error ? err.message : String(err)}`} />);
});
