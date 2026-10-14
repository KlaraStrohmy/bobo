/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// registerType "autoUpdate": activate a new worker right away.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api(\/|$)/] }));

interface PushPayload {
  title?: string;
  body?: string;
  date?: string;
  token?: string;
  url?: string;
}

interface NotificationData {
  date?: string;
  token?: string;
  url: string;
}

const ICON = '/icon-192.png';

// `actions` is supported by Chromium/Firefox but missing from TypeScript's lib typings.
type NotificationOptionsWithActions = NotificationOptions & { actions?: { action: string; title: string }[] };

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const data: NotificationData = {
    date: payload.date,
    token: payload.token,
    url: payload.url || (payload.date ? `/?date=${payload.date}` : '/'),
  };
  const options: NotificationOptionsWithActions = {
    body: payload.body ?? '',
    icon: ICON,
    badge: ICON,
    tag: payload.date ? `bobo-${payload.date}` : 'bobo',
    data,
    actions: payload.token
      ? [
          { action: 'yes', title: 'Ano' },
          { action: 'no', title: 'Ne' },
        ]
      : [],
  };
  event.waitUntil(self.registration.showNotification(payload.title ?? 'Bobo', options));
});

async function answer(data: NotificationData, attending: boolean): Promise<void> {
  const tag = data.date ? `bobo-${data.date}` : 'bobo';
  try {
    const res = await fetch('/api/push/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.token, attending }),
    });
    if (!res.ok) {
      const reason = res.status === 409 ? 'uzávěrka už proběhla' : `chyba serveru (${res.status})`;
      throw new Error(reason);
    }
    const body = (await res.json().catch(() => ({}))) as { date?: string };
    const date = formatDate(body.date ?? data.date);
    await self.registration.showNotification(`Zapsáno: ${attending ? 'obědváš' : 'neobědváš'} ${date}`, {
      icon: ICON,
      badge: ICON,
      tag,
      data: { url: data.url },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'neznámá chyba';
    await self.registration.showNotification('Odpověď se nepodařilo uložit', {
      body: `${reason[0].toUpperCase()}${reason.slice(1)}. Klepni a vyplň to v aplikaci.`,
      icon: ICON,
      badge: ICON,
      tag,
      data: { url: data.url },
    });
  }
}

async function openUrl(url: string): Promise<void> {
  const target = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin) {
      const focused = await client.focus();
      await focused.navigate(target).catch(() => undefined);
      return;
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification.data ?? { url: '/' }) as NotificationData;
  notification.close();
  if ((event.action === 'yes' || event.action === 'no') && data.token) {
    event.waitUntil(answer(data, event.action === 'yes'));
  } else {
    event.waitUntil(openUrl(data.url || '/'));
  }
});
