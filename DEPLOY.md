# House Tasks – deployment

House Tasks is one Node.js app: Express (`server/`) serves `/api`, and the Vite build (`dist/`) is the UI. Data lives in **Turso** (cloud SQLite via `@libsql/client`). Required env vars are listed in `server/.env.example`.

## Option A — Vercel + Turso (recommended)

Fits the serverless model: static frontend on the CDN, API as a Vercel Function, database remote.

1. Create/link the Vercel project to this GitHub repo (`tutors-fi/house-tasks`).
2. Install **Turso** from the Vercel Marketplace and connect a database to the project (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` are injected).
3. Set also: `JWT_SECRET`, `HOUSE_CODE`, `ADMIN_PASSWORD`, `PUBLIC_URL` (e.g. `https://your-app.vercel.app`) for Production / Preview / Development as needed.
4. Deploy with Git integration (push to `main`) or:

```bash
vercel --scope neduai deploy --prod --yes
```

`vercel.json` runs `npm ci` (root + `server/`), `npm run build`, serves `dist/`, and rewrites `/api/*` to `api/index.js`.

Local check against the same Turso DB:

```bash
vercel env pull .env.local --scope neduai
cd server && npm ci && npm start
```

Do not commit `.env` / `.env.local`. Env changes apply only after a new deployment.

## Option B — Plesk + Node.js

Same code path: long-running `node server/index.js`, still using Turso (set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Plesk Node.js env, plus the other secrets). There is no local `house-tasks.db` file anymore.

### Requirements

- Node.js 20.12 or newer (Plesk Node.js extension)
- Domain or subdomain with SSL (Let's Encrypt)

### 1. Code on the server

Clone or pull the repo into the domain folder, then:

```
npm ci
npm run build
cd server
npm ci
```

`npm run build` creates `dist/`, which the server serves to browsers (and Vercel uses as `outputDirectory`).

### 2. Node.js app settings in Plesk

| Setting | Value |
| --- | --- |
| Application Root | repo root |
| Document Root | repo `dist/` |
| Application Startup File | `server/index.js` |
| Application Mode | production |

### 3. Environment variables

Set these in Plesk Node.js settings, or copy `server/.env.example` to `server/.env`. Never commit `.env`.

| Variable | Purpose | Example |
| --- | --- | --- |
| `JWT_SECRET` | Sign login tokens. Long random string. | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `HOUSE_CODE` | Shared code for new resident sign-up. ≥ 12 characters. | |
| `ADMIN_PASSWORD` | Admin page (`/admin`) password. Empty disables admin. | |
| `PUBLIC_URL` | Public URL for QR codes on the admin page. | `https://tasks.example.com` |
| `TURSO_DATABASE_URL` | Turso database URL | from Vercel/Turso dashboard |
| `TURSO_AUTH_TOKEN` | Turso auth token | from Vercel/Turso dashboard |

`PORT` is set by Plesk; you do not need to set it.

### 4. HTTPS

Enable Let's Encrypt and redirect HTTP → HTTPS. Login tokens must not travel over cleartext.

### 5. Start and test

Restart App, then check:

- `https://<host>/` shows the login page
- `https://<host>/admin` asks for the admin password

Startup logs a warning if `ADMIN_PASSWORD` is missing or `HOUSE_CODE` is under 12 characters.

### Update

```
git pull
npm ci
npm run build
cd server
npm ci
```

Then restart the app. Task list updates from `server/taskList.js` on startup (and via admin “Reload task list”).

### Automatic deploy from GitHub

1. Add the repo in Plesk Git with automatic deployment from `main`.
2. Add Plesk’s webhook URL in GitHub → Settings → Webhooks.
3. Additional deployment actions:

```
npm ci
npm run build
cd server && npm ci && cd ..
mkdir -p tmp && touch tmp/restart.txt
```

Whatever lands on `main` goes live. Test features on branches first.

## Security (both hosts)

- Passwords stored as bcrypt hashes (min 8 characters).
- Login, register, and admin login: 10 failures / 15 minutes per IP.
- Admin token lasts 2 hours; user token lasts 8 hours.
