// Web push helpers for the Settings screen.
import { api } from './api';

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    window.setTimeout(() => reject(new Error('Service worker není aktivní (zkus stránku obnovit).')), 10000),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

export async function subscribe(vapidPublicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error('Tento prohlížeč notifikace nepodporuje.');
  if (!vapidPublicKey) throw new Error('Server nemá nastavený VAPID klíč.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifikace nejsou povolené (zkontroluj nastavení prohlížeče).');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

export async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe();
  await api('/push/subscribe', { method: 'DELETE', body: { endpoint } });
}
