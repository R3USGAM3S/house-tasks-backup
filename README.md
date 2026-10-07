# House Tasks

Shared household task board: React (Vite) frontend + Express API. Completions are stored in **Turso** (libSQL / SQLite-compatible).

## Local development

```bash
# Frontend (proxies /api → localhost:3001)
npm ci
npm run dev

# API (separate terminal). Needs Turso env vars — pull from Vercel:
vercel env pull .env.local --scope neduai
# Or copy server/.env.example → server/.env and fill TURSO_* + JWT_SECRET etc.
cd server && npm ci && npm start
```

Open http://localhost:5173. Built app + API together: `npm run build && npm start` then http://localhost:3001.

## Deploy targets

| Host | Database | Notes |
| --- | --- | --- |
| **Vercel** (recommended) | Turso Marketplace (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) | Serverless Express under `/api`, static UI from `dist/`. See below. |
| **Plesk Node.js** | Same Turso DB (set env in Plesk), or see older local-file notes in `DEPLOY.md` | Long-lived `node server/index.js`. Full steps in `DEPLOY.md`. |

### Vercel + Turso

1. Link the GitHub repo to the Vercel project; connect a Turso resource (Marketplace).
2. Set `JWT_SECRET`, `HOUSE_CODE`, `ADMIN_PASSWORD`, `PUBLIC_URL` (Turso vars are injected automatically).
3. Deploy: push to `main` or `vercel --scope neduai deploy --prod --yes`.

`vercel.json` installs root + `server/` deps, builds the Vite app, rewrites `/api/*` to the serverless function and SPA routes to `index.html`.

Never commit `.env`, `.env.local`, or database files.
