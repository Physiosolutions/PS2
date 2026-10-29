# Physio Cloud — D1 + R2 + KV backend

Cloud storage for the PS2 portal. The site stays on Vercel; this Worker is the API.

| Piece | Cloudflare service | Free tier | Holds |
|---|---|---|---|
| Text / records | **D1** (SQLite) | 5 GB | every `localStorage` store mirrored as JSON |
| Photos / files | **R2** | 10 GB (no egress fees) | staff photos, logos, attachments |
| Config / cache | **KV** | 1 GB | small config values |

> KV is **not** used for records — its free tier allows only ~1,000 writes/day.

## Live deployment

| | |
|---|---|
| Worker URL | `https://physio-cloud.psfamily.workers.dev` |
| D1 | `physio-db` (5 tables, APAC) |
| KV | `CONFIG` |
| R2 | **pending** — activate R2 in the dashboard, then uncomment the binding and redeploy. Photo routes return 503 until then. |

---

## 1. Create the cloud resources

```bash
npm.cmd install -g wrangler        # or: npx.cmd wrangler ...
wrangler login

wrangler d1 create physio-db
wrangler r2 bucket create physio-photos
wrangler kv namespace create CONFIG
```

Copy the **database_id** and **KV id** printed above into `wrangler.toml`.

```bash
cd cloudflare
wrangler d1 execute physio-db --remote --file=./schema.sql
wrangler secret put BOOTSTRAP_SECRET     # choose a long random string
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://physio-cloud.psfamily.workers.dev`

If your Vercel preview domains change, update `ALLOWED_ORIGINS` in `wrangler.toml` and re-deploy.

---

## 2. Create the first admin account

```bash
curl -X POST https://physio-cloud.psfamily.workers.dev/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: YOUR_BOOTSTRAP_SECRET" \
  -d "{\"email\":\"psfamilymv@gmail.com\",\"name\":\"Admin\",\"password\":\"CHOOSE_A_STRONG_PASSWORD\"}"
```

Passwords are stored as **PBKDF2-SHA256** hashes — never plain text.

## 3. Import existing staff accounts (one time)

In the app's browser console (logged in, so the roster is loaded):

```js
PhysioCloud.seedFromRoster('YOUR_BOOTSTRAP_SECRET')
```

This hashes and uploads every staff account from `physioStaffDirectoryRepository`.

## 4. Turn on sync in the app

In the browser console (once per device):

```js
PhysioCloud.configure({ baseUrl: 'https://physio-cloud.psfamily.workers.dev' });
```

The page reloads. From then on:

- logging in also signs in to the Worker,
- `persistCoreStores()` pushes changed stores automatically (debounced),
- the first load of a session pulls cloud changes and reloads once.

Nothing is enabled until `baseUrl` is configured, so the site keeps working on localStorage in the meantime.

---

## API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | liveness |
| POST | `/auth/bootstrap` | bootstrap secret | first admin |
| POST | `/auth/seed` | bootstrap secret | bulk-create users |
| POST | `/auth/login` | – | returns bearer token |
| POST | `/auth/logout` | bearer | revoke session |
| GET | `/auth/me` | bearer | current user |
| GET | `/sync` | bearer | pull records |
| POST | `/sync` | bearer | push records (last-write-wins) |
| POST | `/photos` | bearer | upload to R2 |
| GET | `/photos/<key>` | public | serve photo |
| DELETE | `/photos/<key>` | bearer | delete photo |
| GET/PUT | `/config/<key>` | GET public / PUT bearer | KV config |

## Notes / limits

- A single record value is capped at **900 KB** (D1 row limit). Very large chat logs should be split or moved to R2 later.
- Photo URLs are public but use random keys; uploads/deletes require login.
- Per-role read scoping is **phase 2**. Today every authenticated user can read the same workspace data (same as the current app).
- `.vercelignore` keeps this folder out of the Vercel deployment.
