import type { AppConfig } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail || `HTTP ${status}`);
  }
}

type TokenProvider = () => Promise<string>;

let tokenProvider: TokenProvider | null = null;
let devMode = false;

export const DEV_USER_KEY = 'devUser';
export const DEFAULT_DEV_USER = 'pavel.vojacek@strohmy.cz';

export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn;
}

let logoutHandler: (() => Promise<void>) | null = null;

export function setLogoutHandler(fn: () => Promise<void>): void {
  logoutHandler = fn;
}

/** Whether signing out is possible (false in dev mode without MSAL). */
export function canLogout(): boolean {
  return logoutHandler !== null;
}

export async function logout(): Promise<void> {
  await logoutHandler?.();
}

export function enableDevMode(): void {
  devMode = true;
}

export function isDevMode(): boolean {
  return devMode;
}

export function getDevUser(): string {
  try {
    return localStorage.getItem(DEV_USER_KEY) || DEFAULT_DEV_USER;
  } catch {
    return DEFAULT_DEV_USER;
  }
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new ApiError(res.status, 'Nepodařilo se načíst konfiguraci');
  return res.json();
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
    if (body?.detail) return JSON.stringify(body.detail);
  } catch {
    /* not JSON */
  }
  return res.statusText;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (devMode) {
    headers['X-Dev-User'] = getDevUser();
  } else if (tokenProvider) {
    headers.Authorization = `Bearer ${await tokenProvider()}`;
  }
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await errorDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Human-friendly Czech message for an error thrown by `api`. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Uzávěrka už proběhla.';
    if (err.status === 400) return `Neplatný požadavek: ${err.detail}`;
    if (err.status === 401) return 'Nejsi přihlášený.';
    if (err.status === 403) return 'Na tohle nemáš oprávnění.';
    return `Chyba serveru (${err.status}): ${err.detail}`;
  }
  if (err instanceof Error) return err.message;
  return 'Neznámá chyba';
}
