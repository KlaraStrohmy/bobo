import { logout } from './api';
import { unsubscribe } from './push';

/** Sign out: stop reminders on this device first so they don't keep arriving for the signed-out user. */
export async function signOut(): Promise<void> {
  await unsubscribe().catch(() => undefined);
  await logout();
}
