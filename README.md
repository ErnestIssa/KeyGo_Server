# KeyGo API (MVP)

Express + MongoDB API for **vehicle relocation only** (not passenger transport).

## Run locally

```bash
npm install
npm start
```

- **`npm start`** runs **`tsx src/server.ts`** (no `dist/` build required).
- Optional: **`npm run build`** then **`node dist/server.js`** if you want compiled JS.
- For development with hot reload: **`npm run dev`**.

The server uses **`process.env.PORT || 3000`**, listens on **`0.0.0.0`**, and logs **`Server running on port …`** plus **`MongoDB connected`** when the database is ready.

## Environment

| Variable | Notes |
|----------|--------|
| `MONGO_URI` or `MONGODB_URI` | **Required in production** (e.g. Render). Optional in local dev — falls back to `mongodb://127.0.0.1:27017/keygo` with a console warning. |
| `PORT` | Set automatically on **Render**. Default **3000** locally. |
| `NODE_ENV` | Set to **`production`** on Render. |
| `CORS_ORIGIN` | Your frontend origin(s), comma-separated. If unset in production, CORS reflects the request Origin and a warning is logged. |

Copy `.env.example` to `.env` for local development.

## Render (Web Service)

1. **Build command:** `npm install` (no `tsc` step required)  
2. **Start command:** `npm start` (runs `tsx src/server.ts`)  
3. **Environment:** `MONGO_URI`, `NODE_ENV=production`, `CORS_ORIGIN` (your static site / frontend URL).

Health check: `GET /health`

## API (summary)

- `POST /api/users/register` — `{ email, password, name, role: "owner" | "driver" }`
- `POST /api/users/login`
- `POST /api/users/demo-login` — `{ role: "owner" | "driver" }` (password `demo123`)
- `GET /api/users/profile` — Bearer JWT
- Trips under `/api/trips` — create (owner), list available (driver), accept, complete (owner).
