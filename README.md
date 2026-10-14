# Bobo – přihlašování na obědy

Uživatel oznamuje, jestli bude daný den obědvat (dopředu nebo přes denní web-push připomínku).
Admin nastavuje dny vaření, ruší/přidává dny a vidí přehled. Podrobnosti: [docs/SPEC.md](docs/SPEC.md).

Stack: Cloudflare Worker `worker/` (TypeScript, Hono, D1, Cron Trigger, Static Assets) +
`frontend/` (Vite, React, MSAL, PWA). Frontend se builduje do `worker/public` a Worker ho servíruje
(SPA fallback), `/api/*` obsluhuje Worker. Z Azure zůstává jen Entra ID (přihlášení).

## Lokální vývoj

```bash
cd frontend && npm ci && cd ../worker && npm ci
cp .dev.vars.example .dev.vars   # AUTH_DISABLED=true, dev VAPID klíče, prázdné AZURE_CLIENT_ID
npm run db:migrate:local         # lokální D1 v .wrangler/
npm run dev                      # build frontendu + wrangler dev na http://localhost:8787
```

Bez přihlášení: SPA běží v dev režimu a posílá hlavičku `X-Dev-User` (e-mail).
Pro hot reload frontendu pusť navíc `npm run dev` ve `frontend/` (http://localhost:5173, `/api` proxy na 8787).

```bash
npm test            # vitest v workerd (skutečná D1 přes miniflare)
npm run typecheck
# cron lokálně: npx wrangler dev --test-scheduled, pak
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

## Nasazení (Cloudflare)

Vše ve `worker/`:

```bash
npx wrangler login
npx wrangler d1 create bobo        # vypsané database_id dej do wrangler.jsonc místo TODO_D1_ID

npm run gen:vapid                  # vypíše VAPID_PUBLIC_KEY a VAPID_PRIVATE_KEY
# VAPID_PUBLIC_KEY vlož do wrangler.jsonc -> vars.VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY    # hodnota z gen:vapid (raw d, base64url)
openssl rand -base64 32 | npx wrangler secret put PUSH_TOKEN_SECRET

npm run deploy                     # build frontendu, D1 migrace (--remote), wrangler deploy
```

Poznámky:

- `VAPID_PUBLIC_KEY` a `VAPID_PRIVATE_KEY` musí být ze stejného páru (Worker skládá klíč z obou).
  Změna klíčů znamená, že se uživatelé musí znovu přihlásit k notifikacím.
- `secret put` u úplně prvního nasazení vytvoří Worker, pokud ještě neexistuje; jinak ho spusť až po `npm run deploy`
  (do té doby push a odpovědi z notifikací nefungují).
- Cron (`* * * * *`) posílá připomínky; časy se počítají v `Europe/Prague`.

## Entra ID – redirect URI

App registrace „Bobo“ je jedna pro SPA i API, bez client secretu. Tenant a client ID nejsou v gitu,
Worker je dostává jako secrety:

```bash
npx wrangler secret put AZURE_TENANT_ID
npx wrangler secret put AZURE_CLIENT_ID
```


Po prvním deployi přidej URL Workeru jako SPA redirect URI (stávající URI zůstanou):

```bash
APP=<objectId app registrace>
URL=https://bobo.<subdomain>.workers.dev
URIS=$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/applications/$APP?\$select=spa" \
  --query spa.redirectUris -o json | jq -c --arg u "$URL" '. + [$u] | unique')
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$APP" \
  --headers Content-Type=application/json --body "{\"spa\":{\"redirectUris\":$URIS}}"
```

## iOS

Push na iOS funguje jen u PWA přidané na plochu (Safari → Sdílet → Přidat na plochu) a otevřené z ikony.
