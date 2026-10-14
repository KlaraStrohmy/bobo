# Bobo — přihlašování na obědy

> **Pozn.:** sekce Architektura/Konfigurace/Datový model níže popisují původní FastAPI/Postgres variantu. Aktuální je Cloudflare Worker — viz poslední sekce „ZMĚNA 2026-10-14“. API kontrakt platí dál.

Uživatel oznamuje, jestli bude **daný den** obědvat. Může vyplnit dopředu (týden/měsíc),
nebo si zapnout denní připomínku (web push) v nastavenou hodinu, která se ho zeptá na zítřek.
Admin nastavuje, ve které dny týdne se vaří, jednorázově ruší/přidává dny a vidí přehled.

## Architektura

- `backend/` — FastAPI (Python 3.12, uv), SQLAlchemy 2 async + asyncpg, APScheduler (in-process,
  1 replika), pywebpush (VAPID), PyJWT (validace Entra tokenů přes JWKS).
- `frontend/` — Vite + React + TypeScript, `@azure/msal-browser` + `@azure/msal-react`,
  `vite-plugin-pwa` (strategie `injectManifest`, vlastní service worker kvůli push).
  UI česky, mobile-first.
- Jeden Docker image: build FE → `backend/static`, FastAPI servíruje `/api/*` a SPA (fallback na index.html).
- K8s: namespace `bobo`, Deployment (1 replika), Service `bobo:80` → 8000, HTTPRoute
  `bobo.analytics.strohmy.cz` na gateway `analytics-gateway` (ns `gateway`).
- Časová zóna všude `Europe/Prague`. Data jako `YYYY-MM-DD`, čas `HH:MM`.

## Konfigurace (env proměnné backendu)

| env | popis |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://bobo:***@postgres-strohmy2-analytics-test.postgres.database.azure.com:5432/bobo?ssl=require` |
| `AZURE_TENANT_ID` | tenant ID (secret) |
| `AZURE_CLIENT_ID` | client ID app registrace (SPA i API v jedné appce) |
| `AZURE_API_AUDIENCE` | volitelné, default `api://{AZURE_CLIENT_ID}`; akceptuj i samotné `AZURE_CLIENT_ID` |
| `ADMIN_EMAILS` | čárkami, default `klara.matoulkova@strohmy.cz,pavel.vojacek@strohmy.cz` (case-insensitive) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | VAPID klíče (base64url, private jako raw base64url nebo PEM) |
| `VAPID_SUBJECT` | `mailto:pavel.vojacek@strohmy.cz` |
| `PUSH_TOKEN_SECRET` | HMAC secret pro odpovědi z notifikace |
| `APP_BASE_URL` | `https://bobo.analytics.strohmy.cz` |
| `AUTH_DISABLED` | `true` jen pro lokální vývoj: uživatel z hlavičky `X-Dev-User` (email) |

Frontend dostane konfiguraci za běhu z `GET /api/config` (žádné build-time env), aby šel
jeden image do libovolného prostředí.

## Datový model (Postgres, DB `bobo`, schéma `public`; tabulky vytvoří backend při startu `create_all`)

- `users` — `id` text PK (Entra `oid`), `email` text unique, `name` text, `active` bool default true,
  `reminder_enabled` bool default false, `reminder_time` time default 15:00, `created_at`, `last_seen_at`.
- `responses` — `user_id` FK, `date` date, `attending` bool, `updated_at`, `source` text
  (`web` | `bulk` | `push`); PK (`user_id`, `date`). Žádný řádek = neodpověděl.
- `settings` — `key` text PK, `value` jsonb. Klíče:
  - `cooking_weekdays`: list ISO dnů (1=Po … 7=Ne), default `[2, 4, 5]` (út, čt, pá)
  - `cutoff`: `{"days_before": 1, "time": "16:00"}` — do kdy lze měnit odpověď na den D
    (D minus `days_before` dní v `time`). Po uzávěrce může měnit jen admin.
- `day_overrides` — `date` PK, `cooking` bool, `note` text, `created_by`, `created_at`.
  `cooking=false` = jednorázové zrušení, `cooking=true` = jednorázový extra den.
- `push_subscriptions` — `id` serial, `user_id` FK, `endpoint` text unique, `p256dh`, `auth`,
  `user_agent`, `created_at`.
- `reminder_log` — `user_id`, `date` (den, na který se ptalo), `sent_at`; PK (`user_id`, `date`).

Den D je „vaří se“: override existuje → `override.cooking`, jinak `isoweekday(D) in cooking_weekdays`.

## API (vše pod `/api`, JSON; kromě `/api/config`, `/api/health`, `/api/push/answer` vyžaduje
`Authorization: Bearer <access token>`)

Uživatel se zakládá/aktualizuje (upsert podle `oid`, email z `preferred_username`/`upn`/`email`, `name`)
při každém autentizovaném requestu (`last_seen_at`).

### Veřejné
- `GET /api/health` → `{"status":"ok"}`
- `GET /api/config` → `{"tenantId","clientId","apiScope":"api://<clientId>/access_as_user","vapidPublicKey"}`
- `POST /api/push/answer` body `{"token": str, "attending": bool}` → `{"ok":true,"date":"YYYY-MM-DD"}`.
  Token = `base64url(user_id|date|exp) + "." + HMAC-SHA256`, platnost do uzávěrky dne. Respektuje uzávěrku (409 po ní).

### Uživatel
- `GET /api/me` → `{"id","email","name","isAdmin","reminderEnabled","reminderTime":"HH:MM","pushSubscribed":bool}`
- `PUT /api/me/preferences` body `{"reminderEnabled": bool, "reminderTime": "HH:MM"}` → jako `/api/me`
- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 92 dní) →
  `{"days":[{"date","cooking":bool,"note":str|null,"attending":bool|null,"locked":bool,"cutoffAt":ISO datetime}]}`
- `PUT /api/responses/{date}` body `{"attending": bool | null}` (null = smazat odpověď) → day objekt jako v kalendáři.
  400 když se ten den nevaří, 409 když je po uzávěrce.
- `POST /api/responses/bulk` body `{"from","to","attending": bool|null, "onlyEmpty": bool}` →
  `{"updated": int, "skipped": int}`; aplikuje jen na dny, kdy se vaří a nejsou zamčené
  (`onlyEmpty=true` nepřepíše existující odpovědi).
- `GET /api/push/vapid-public-key` → `{"key"}`
- `POST /api/push/subscribe` body = `PushSubscription.toJSON()` (`{"endpoint","keys":{"p256dh","auth"}}`) → `{"ok":true}`
- `DELETE /api/push/subscribe` body `{"endpoint"}` → `{"ok":true}`
- `POST /api/push/test` → pošle testovací notifikaci sobě → `{"sent": int}`

### Admin (403 pro ne-adminy)
- `GET /api/admin/settings` → `{"cookingWeekdays":[2,4,5],"cutoff":{"daysBefore":1,"time":"16:00"}}`
- `PUT /api/admin/settings` stejný tvar → stejný tvar
- `GET /api/admin/overrides?from&to` → `{"overrides":[{"date","cooking","note"}]}`
- `PUT /api/admin/overrides/{date}` body `{"cooking": bool, "note": str|null}` → override
- `DELETE /api/admin/overrides/{date}` → `{"ok":true}`
- `GET /api/admin/overview?date=YYYY-MM-DD` →
  `{"date","cooking","note","counts":{"yes","no","none"},"yes":[User],"no":[User],"none":[User]}`
  kde `User = {"id","email","name"}`; `none` = aktivní uživatelé bez odpovědi.
- `GET /api/admin/summary?from&to` → `{"days":[{"date","cooking","note","yes","no","none"}]}` (počty)
- `GET /api/admin/users` → `{"users":[{"id","email","name","active","reminderEnabled","lastSeenAt"}]}`
- `PUT /api/admin/users/{id}` body `{"active": bool}` → user (neaktivní se nepočítají do „neodpověděl“ a nedostávají připomínky)
- `PUT /api/admin/responses/{userId}/{date}` body `{"attending": bool|null}` — admin může upravit komukoli i po uzávěrce.

## Připomínky (scheduler)

Job každou minutu (`Europe/Prague`): pro aktivní uživatele s `reminder_enabled` a `reminder_time == teď (HH:MM)`:
cílový den = nejbližší další den, kdy se vaří (zítra, pokud se zítra vaří; jinak nic — ptáme se jen den předem).
Pokud zítra se vaří, uživatel na zítřek nemá odpověď, není po uzávěrce a není záznam v `reminder_log` → pošli push
na všechny jeho subscriptions a zapiš log. Subscriptions s odpovědí 404/410 smaž.

Push payload (JSON): `{"title":"Oběd zítra?","body":"Středa 15. 10. — budeš obědvat?","date","token","url":"/?date=YYYY-MM-DD"}`.
Service worker zobrazí notifikaci s akcemi `yes` („Ano“) a `no` („Ne“); kliknutí na akci pošle
`POST /api/push/answer` s tokenem (bez MSAL), klik na tělo otevře `url`. Po odeslání odpovědi
SW zobrazí krátké potvrzení (notifikace „Zapsáno: ano/ne“).

## Frontend — obrazovky

1. **Přihlášení** — MSAL redirect login, žádné další UI.
2. **Moje obědy** (default) — seznam/kalendář následujících ~5 týdnů; u každého dne, kdy se vaří,
   přepínač Ano / Ne / (nevyplněno), zamčené dny šedě. Dny, kdy se nevaří, vynechat nebo zobrazit tlumeně
   s poznámkou (zrušeno). Hromadné akce: „Celý příští týden ano/ne“, „Celý měsíc ano“, „Jen nevyplněné“.
3. **Nastavení** — připomínka zap/vyp + čas; tlačítko „Povolit notifikace“ (Notification.requestPermission
   + pushManager.subscribe + POST subscribe), testovací notifikace. Na iOS návod „Přidat na plochu“
   (push funguje jen v nainstalované PWA).
4. **Admin** (jen `isAdmin`) — přehled dne (výběr data, default nejbližší vařicí den): počty + seznamy
   Ano / Ne / Neodpověděl; souhrn na 2 týdny; nastavení dnů v týdnu a uzávěrky; jednorázové zrušení/přidání dne
   s poznámkou; správa uživatelů (aktivní/neaktivní).

PWA: manifest (name „Bobo – obědy“, short_name „Bobo“, theme color, ikony 192/512 + maskable),
`display: standalone`, start_url `/`.

---

## ZMĚNA 2026-10-14: hosting na Cloudflare (mimo Azure)

Hlavní uživatelka nemá VPN → appka musí být veřejně na internetu, mimo Azure. Z Azure zůstává jen Entra.

- `worker/` — Cloudflare Worker (TypeScript, Hono) nahrazuje `backend/` (Python). API kontrakt výše platí beze změny.
- DB: Cloudflare D1 (SQLite), migrace v `worker/migrations/`.
- Scheduler: Cron Trigger `* * * * *` (handler `scheduled`).
- Statika: Workers Static Assets z `worker/public` (build frontendu), SPA fallback, `/api/*` jde do Workeru.
- Entra app „Bobo“: clientId a tenant ID jsou wrangler secrety (ne v gitu),
  scope `api://<clientId>/access_as_user`, access token v2 (aud = clientId GUID, iss = `https://login.microsoftonline.com/{tenant}/v2.0`).
- Secrets (wrangler secret): `VAPID_PRIVATE_KEY`, `PUSH_TOKEN_SECRET`; `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`; vars: `VAPID_PUBLIC_KEY`, `ADMIN_EMAILS`, `VAPID_SUBJECT`.
- `backend/`, `k8s/`, `Dockerfile`, `scripts/` (Azure/AKS) se ruší.
