# Fairshare — a Splitwise clone built by Sprint Zero

This README documents the product that a full Sprint Zero run produced in this repo on 2026-06-11: **Fairshare**, a group expense splitter modelled on [Splitwise](https://www.splitwise.com/). Scope level MVP, project type web-app, stack node-react, data layer local (SQLite + self-issued JWT — no account, keys, or `.env` needed). The Sprint Zero kit itself is documented in `README.md`; this file is about the build.

## What was built

Fairshare is the smallest product that fully solves three jobs: track shared group expenses, always know who owes whom, and settle informally.

**Features (all working end to end):**

- **Auth** — email/password signup, login, logout; the session survives reloads and protected pages redirect to login when it's missing.
- **Groups** — create, rename, delete; add registered members by email, remove members (only at zero balance); list my groups.
- **Expenses** — description, amount, date, one payer, selected participants; split equally or by exact amounts; edit and delete, with "edited by [name] at [time]" recorded on every edit.
- **Balances** — net balance per member and pairwise who-owes-whom per group, plus an overall dashboard (total net, net per group, per-person rollup across groups). Balances are always derived from the ledger at read time, never stored.
- **Simplify debts** — a per-group toggle that collapses the pairwise list into the greedy minimum-cash-flow plan (repeatedly match the largest creditor with the largest debtor) — at most members − 1 payments, nets unchanged.
- **Settle up** — record a cash payment between two members, full or partial, with the amount pre-filled from the outstanding balance shown.
- **Activity feed** — newest-first list of expenses, edits, and settlements per group.

**Money rule:** every amount is an integer count of fils (100 fils = 1 AED) in storage, transport, and computation. The UI converts to AED decimals only at the display/input edge. Floats never touch money.

**The pieces:**

| Path | What it is |
|------|------------|
| `docs/` | The generated spec set: `scope.md`, `reference-brief.md`, `prd.md`, `decisions.md`, `user-stories.md`, `api-contract.md` (the contract all agents built to — 21 endpoints) |
| `server/` | Express + better-sqlite3 backend on port 3001: JWT auth, all 21 endpoints, ledger math, simplify algorithm, idempotent seed (see `server/README.md`) |
| `client/` | React + Vite frontend on port 5173: signup/login, dashboard, group page (members, expenses, balances, settle up, activity) |

It was built by the Sprint Zero pipeline: scoping → reference research → PRD → decisions log → user stories → API contract → tech-lead build brief → backend and frontend engineers in parallel → independent QA. QA finished green: 182/182 API integration assertions and 29/29 real-browser steps (full auth dance plus the complete core loop).

## Why this component

A Splitwise clone was chosen as the build target because it is the rare small app with real correctness stakes, which makes it a genuine stress test of a spec-driven, multi-agent build:

- **The hard part is logic, not screens.** Split math with integer remainders, derived balances that must always sum to zero, a real algorithm (greedy minimum cash flow), audit stamps, and cascade deletes — exactly the kind of detail that silently drifts when two agents build backend and frontend in parallel. It only works if the API contract is treated as law, which is the thesis of Sprint Zero.
- **Money makes precision non-negotiable.** Storing fils as integers and proving splits sum exactly (10000 ÷ 3 → 3334/3333/3333) is a crisp, testable correctness bar.
- **The reference is universally known**, so scope cuts are legible: anyone can read `docs/decisions.md` and immediately understand what was kept and what was dropped.
- **The configuration** (node-react + local data layer, MVP level) follows the brief's "smallest product that fully solves" mandate and the kit's zero-setup default: clone, install, run — no external accounts.

## How to run it

Prerequisites: Node.js 18+ (verified on Node 24) and npm. Works on Windows, macOS, and Linux.

Terminal 1 — backend:

```
cd server
npm install
node seed.js
node index.js
```

Terminal 2 — frontend:

```
cd client
npm install
npm run dev
```

Then open **http://localhost:5173** and log in as the seeded demo user:

```
email:    sara@flat12.ae
password: demo1234
```

Omar (`omar@flat12.ae`) and Lina (`lina@flat12.ae`) use the same password — open a second browser profile to see two members of the same group interact.

Notes: there is no `.env`; the database is a single gitignored file at `server/data.db`. Re-running `node seed.js` resets the demo cast at any time (it's idempotent); deleting `data.db` and reseeding gives a fully fresh start.

## How to test it

**What QA already verified** (independent of the engineers): every endpoint against `docs/api-contract.md`; the auth dance (signup → session persists on reload → logout → login → protected redirect → API 401); membership scoping (non-members get 404, so groups don't leak); the split math including the remainder rule and exact-split mismatch rejection; balances summing to zero at every checkpoint; the simplify plan's row bound and unchanged nets; settlement full/partial/overpay behaviour; and the activity feed's exact summary strings — 182 API assertions plus a 29-step browser run, all passing.

**Quick API smoke test** (servers running; on Windows PowerShell use `curl.exe`):

```
curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d "{\"email\":\"sara@flat12.ae\",\"password\":\"demo1234\"}"
```

Copy the `access_token` from the response, then:

```
curl -s http://localhost:3001/balances/overall -H "Authorization: Bearer <token>"
```

Amounts come back in integer fils. The seeded "Flat 12" group contains an AED 100.00 three-way equal split — fetch `GET /groups/1/expenses` and you'll see the 3334/3333/3333 shares.

**Manual browser script** (5 minutes): sign up a fresh user → create a group → add `sara@flat12.ae` by email (then try a bogus email and a duplicate add to see the rejections) → add an expense of AED 100 split equally → check the balances section → switch the split to exact amounts and watch the "left to assign" indicator block a mismatch → flip "Simplify debts" → click "Settle up" on a pair and accept the pre-filled amount → confirm the pair reads settled and the activity feed lists everything newest-first.

**Honest caveat:** QA's test scripts were deliberately throwaway (Sprint Zero leaves the build clean), so there is no committed automated suite to re-run — making one permanent is the top engineering improvement below.

## Assumptions made

Captured in `docs/scope.md` and `docs/prd.md` as the build's source of truth:

- **MVP level and the default configuration** (web-app, node-react, local data layer) were inferred — the brief specified features and data model but no level or stack, so the kit's documented defaults applied.
- **Single currency**: AED, stored as integer fils, per the brief's "integer minor units (fils)". No multi-currency.
- **"Session based" auth** is satisfied by a self-issued JWT the client holds for its session (localStorage), dropped on logout. There is no server-side session store and deliberately no logout endpoint. The JWT secret defaults to a baked-in dev value so nothing needs configuring.
- **Flat permissions**: any group member can rename or delete the group, manage members, and edit or delete any expense or settlement. The activity feed's audit line is the accountability mechanism, not roles.
- **Equal-split remainders** go one fil each to the earliest-selected participants, deterministically, so splits always sum to the total.
- **Member removal** is blocked unless that member's net balance is exactly zero; removed members still render by name on historical entries.
- **The activity feed is derived** from existing rows (no activity table, matching the briefed data model): each expense's creation, its latest edit only, and each settlement. Deleted expenses vanish from the feed.
- **Settle-up pre-fill** follows whatever the balance view currently displays (the simplified plan when the toggle is on, raw pairwise otherwise); any positive amount is accepted and overpayment legitimately flips the pair's direction.
- **A payer need not be a participant** in the expense they paid for.

One spec correction worth knowing: the contract's prose formula for pairwise balances originally had its settlement terms inverted; the backend engineer flagged it during the build, the contract was fixed, and the resolution is logged in `docs/decisions.md`.

## Improvements and optimizations recommended

**Product (ranked in `docs/decisions.md` under "What we'd add next"):**

1. Percentage and share-based splits — a small arithmetic layer on the existing split form.
2. Inviting non-registered people by email — removes the "everyone must sign up first" wall.
3. A real activity table — full edit history, deletion entries in the feed, and undelete.
4. Email reminders for outstanding balances.
5. Expense categories with a simple monthly breakdown.

**Engineering:**

- **Commit a permanent test suite.** Recreate QA's coverage as a checked-in `npm test`: API assertions (node:test + fetch) and a Playwright spec for the auth dance and core loop, wired into CI. This is the highest-value gap.
- **Harden sessions for anything beyond a demo**: move the JWT from localStorage to an httpOnly secure cookie (or add refresh-token rotation), require a real `JWT_SECRET` outside dev, and add basic rate limiting on the auth endpoints.
- **Concurrency control**: expense edits are last-write-wins; an `updated_at` precondition (reject stale writes with 409) would surface conflicts instead of silently overwriting. Confirm multi-row writes (expense + splits) stay wrapped in a single SQLite transaction, and enable WAL mode for concurrent readers.
- **Scale the read path when groups grow**: balances are recomputed from the full ledger on every read — correct by construction and fine at demo scale, but large groups would want SQL-level aggregation (SUM over splits/settlements) plus pagination on the expenses and activity endpoints.
- **Re-run at Prod scope** for input-validation polish, error boundaries, loading states, and an error-path test per loop — the Sprint Zero `Prod` level exists exactly for this.
- **Deployment**: add a Dockerfile (or swap the data layer to the kit's `supabase` option) to demo across devices with hosted Postgres and real auth infrastructure.
