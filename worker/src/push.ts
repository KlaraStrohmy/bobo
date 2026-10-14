/** Push delivery to a user's subscriptions, pruning gone ones (port of bobo.services.push). */
import type { Env } from './env';
import { sendWebPush, type PushTarget, type VapidKeys } from './webpush';

const GONE_STATUSES = new Set([404, 410]);

export interface PushDeps {
  /** Outbound fetch (injectable for tests); defaults to the global fetch. */
  fetch?: typeof fetch;
}

export function vapidKeys(env: Env): VapidKeys | null {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

/** Push `payload` to every subscription of a user; returns the number delivered. */
export async function sendToUser(env: Env, userId: string, payload: object, deps: PushDeps = {}): Promise<number> {
  const keys = vapidKeys(env);
  if (!keys) {
    console.warn('VAPID keys not configured, skipping push');
    return 0;
  }
  const { results: subs } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1 ORDER BY id',
  )
    .bind(userId)
    .all<PushTarget & { id: number }>();
  const data = JSON.stringify(payload);
  let sent = 0;
  const gone: number[] = [];
  for (const sub of subs) {
    let status: number;
    try {
      status = await sendWebPush(sub, data, keys, deps.fetch ?? fetch);
    } catch (err) {
      console.error(`unexpected push error for user ${userId}:`, err);
      continue;
    }
    if (status >= 200 && status < 300) {
      sent += 1;
    } else {
      console.warn(`push to ${sub.endpoint.slice(0, 60)} failed: HTTP ${status}`);
      if (GONE_STATUSES.has(status)) gone.push(sub.id);
    }
  }
  if (gone.length) {
    await env.DB.batch(gone.map((id) => env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(id)));
  }
  return sent;
}
