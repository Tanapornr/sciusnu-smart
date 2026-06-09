# SCiUSNU Smart — Unified Vercel Deployment

Single-repo deploy: React frontend + Express backend on one Vercel project.

## Project Structure

```
/
├── api/
│   └── index.cjs          ← Vercel serverless entry (loads backend/server.js)
├── backend/
│   ├── api/               ← Express route handlers
│   ├── lib/               ← Shared utilities
│   ├── server.js          ← Express app
│   └── package.json       ← "type": "commonjs" (keeps backend as CJS)
├── src/                   ← React frontend (TypeScript/Vite)
├── package.json           ← Root: merged deps, "type": "module" for frontend build
└── vercel.json            ← Routing: /api/* → serverless, everything else → SPA
```

## How it works

- **Frontend**: Vite builds `src/` → `dist/` (static files served by Vercel CDN)
- **Backend**: `api/index.cjs` is a Vercel Serverless Function that imports `backend/server.js`
- **Routing**: `vercel.json` sends `/api/*` to the serverless function; all other paths serve `index.html` (React Router)
- **Module systems**: Root is ESM (`"type": "module"`) for the Vite build; `backend/package.json` declares `"type": "commonjs"` so all `require()` calls inside `backend/` work correctly; `api/index.cjs` uses the `.cjs` extension to force CommonJS regardless of root type

## Environment Variables

Copy `.env.example` and add all variables in **Vercel Dashboard → Project → Settings → Environment Variables**.

Required:
- `JWT_SECRET` (≥32 chars)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- `SPREADSHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`
- `APPS_SCRIPT_URL` + `APPS_SCRIPT_SECRET`
- `MAIL_RELAY_URL` + `MAIL_RELAY_SECRET`
- `DRIVE_FOLDER_ID` + `UPLOAD_TOKEN_SECRET` + `SIGNATURE_KEY`
- `ADMIN_EMAILS` (comma-separated)
- `WEB_URL` (your Vercel deployment URL, e.g. `https://sciusnu-smart.vercel.app/`)

## Deploy

```bash
# Install Vercel CLI (once)
npm i -g vercel

# Deploy from this folder
vercel --prod
```

Or connect the GitHub repo to Vercel for automatic deploys.
