Creat# Fairshare API (server)

The Express backend for Fairshare, a Splitwise-style group expense splitter. Sprint Zero build: node-react stack, **local data layer** — SQLite on disk plus a self-issued JWT. **No account, no keys, and no `.env` are needed**; it runs straight after install.

## Run it

```
cd server
npm install
node seed.js
node index.js
```

The API listens on **http://localhost:3001** (CORS allows the Vite frontend on http://localhost:5173).

The seed prints the demo credentials when it finishes:

```
Demo login: sara@flat12.ae / demo1234
```

(Omar `omar@flat12.ae` and Lina `lina@flat12.ae` use the same password.) The seed is idempotent — run it again any time to reset the demo cast. To wipe everything, delete `server/data.db` and reseed.

## What's inside

- `index.js` — Express app, CORS, routers, error handling. Port 3001.
- `db.js` — SQLite connection (`server/data.db`, gitignored); creates the schema on every start.
- `middleware/` — JWT verification (`auth.js`) and group-membership scoping (`membership.js`; non-members always get 404).
- `routes/` — one file per resource: `auth`, `groups` (incl. members), `expenses`, `settlements`, `balances` (group + overall dashboard), `activity`.
- `lib/balances.js` — the ledger math: nets, raw pairwise debts, and the greedy minimum-cash-flow simplify plan. Balances are always derived at read time, never stored.
- `seed.js` — schema + demo users, groups, expenses, and a settlement.

## Conventions

- The API implements `docs/api-contract.md` exactly — 21 endpoints.
- Money is **integer fils** end to end (`amount_fils` / `net_fils`); 100 fils = 1 AED. No floats anywhere.
- Auth: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`. Send `Authorization: Bearer <token>` on protected routes. There is no logout endpoint — the client drops its token.
- Errors always look like `{ "error": "code", "message": "..." }`.
- Optional env vars (never required): `JWT_SECRET` (defaults to the baked-in dev secret), `PORT` (3001), `DB_PATH` (`server/data.db`).
