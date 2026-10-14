/** Worker bindings, vars and secrets (see wrangler.jsonc). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  ADMIN_EMAILS: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  /** Secret: base64url raw P-256 private scalar `d` (32 bytes). */
  VAPID_PRIVATE_KEY?: string;
  /** Secret: HMAC key for notification answer tokens. */
  PUSH_TOKEN_SECRET?: string;
  /** "true" only for local development: identity comes from `X-Dev-User`. */
  AUTH_DISABLED?: string;
}
