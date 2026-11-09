# Atelier — Real-Time Online Painting Auctions

A full-stack, real-time art auction platform inspired by premium online auction houses such as
[Artrise Art](https://artriseart.com/): staggered-close online sales, live bidding with
proxy (maximum) bids, anti-sniping soft close, server-synchronised countdowns, and a
Cloudinary image pipeline with deep-zoom inspection.

**Documentation:** [User & admin guide](docs/USER_GUIDE.md) ·
[Project walkthrough](docs/PROJECT_WALKTHROUGH.md) ·
[Setup & GitHub guide](SETUP.md) ·
[Architecture PDF — HLD, ER, schema, flowcharts](docs/Atelier-Architecture.pdf)
(regenerate from `docs/architecture/architecture.html` with any Chromium browser's
`--headless --print-to-pdf`).

```
.
├── server/   Express + TypeScript + Socket.io + Prisma (PostgreSQL)
├── client/   React + Vite + TypeScript + Tailwind + TanStack Query + Framer Motion
└── docker-compose.yml   PostgreSQL 16
```

---

## Quick start

Requirements: Node 20+, Docker (or any PostgreSQL 14+).

```bash
npm install                      # installs both workspaces
cp server/.env.example server/.env
npm run db:up                    # starts Postgres on :5432
npm run db:migrate               # creates the schema (prisma migrate dev)
npm run db:seed                  # demo catalogue, users and bid history
npm run dev                      # server :4000 + client :5173
```

Open http://localhost:5173.

| Account | Email | Password |
|---|---|---|
| Admin | `admin@atelier.test` | `Admin@12345` |
| Bidders | `asha@` / `rohan@` / `clara@` / `omar@atelier.test` | `Bidder@123` |

> Seeded auction times are **relative to when you seed**. One live sale starts closing ~6 minutes
> after seeding (so you can watch soft-close and hammer-down), another after ~45 minutes. Re-run
> `npm run db:seed` any time to reset the clock.

To see real-time bidding, open two browsers (e.g. a normal and a private window), log in as two
bidders and bid on the same lot.

---

## Architecture

### Bidding engine — `server/src/services/bidding.ts`

Bid placement is a single interactive Prisma transaction with layered safeguards:

1. **`SERIALIZABLE` isolation.**
2. **Row-level lock** — `SELECT … FROM "Lot" WHERE id = $1 FOR UPDATE`. Concurrent bids on one
   lot queue on the row lock; bids on different lots never contend.
3. **`@@unique([lotId, amount])`** on `Bid` — two bids at the same amount cannot both be recorded.
4. **Optimistic version check** — `UPDATE … WHERE version = $n`; any mismatch aborts.
5. **Retry with jittered backoff** on serialization failures / deadlocks (`P2034`, `40001`, `40P01`),
   up to 5 attempts, then a clean `409 BID_CONTENTION`.

Inside the lock the engine validates status, timing and the increment ladder, then runs **proxy
resolution**: competing maximum bids are executed one increment above each other, exactly as an
auctioneer executes absentee bids (earlier instruction wins ties). All generated bids are persisted
in order and only **after commit** are events broadcast — clients never see uncommitted state.

**Soft close:** a bid within `SOFT_CLOSE_WINDOW_SECONDS` of the close pushes `endsAt` to
`now + SOFT_CLOSE_EXTENSION_SECONDS`.

Verify it under load (server running, DB seeded):

```bash
npm run test:concurrency -w server            # 40 simultaneous identical bids on one live lot
```

It asserts exactly one bid is accepted at the contested amount and that `currentBid`,
`highestBidderId` and `bidCount` match the bid rows.

### Lifecycle scheduler — `server/src/services/scheduler.ts`

A 1-second tick opens due lots (`UPDATE … RETURNING`) and hammers down expired ones inside a
row-locked transaction that re-checks `endsAt` (a last-second bid may have extended it). Lots are
`SOLD` when the reserve is met, otherwise `PASSED`. Every transition is conditional, so running
multiple server instances is safe.

### Real-time — Socket.io

| Room | Events |
|---|---|
| `lot:<id>` | `lot:bid`, `lot:update`, `lot:closed` |
| `auction:<id>` | same, for every lot in the catalogue |
| `user:<id>` (private) | `user:outbid`, `user:won` |
| `lobby` | `auction:update` |

The client joins rooms with ref counting (`client/src/lib/socket.ts`) and a single bridge
(`useRealtimeBridge`) patches every TanStack Query cache entry containing the lot, so cards,
catalogue grids, lot pages and the account page update from one event. Out-of-order events are
discarded by `version`.

**Clock sync:** countdowns never trust the device clock. The client runs an NTP-style exchange
(`time:sync`) and uses the lowest-RTT sample's offset, re-syncing every minute.

> For horizontal scaling add `@socket.io/redis-adapter` so broadcasts fan out across instances.

### Auth

JWT signed with `JWT_SECRET`, delivered as an **HttpOnly, SameSite** cookie (also accepted as
`Authorization: Bearer`). Passwords hashed with bcrypt (cost 12, `bcryptjs` — pure JS, no native
build). Login uses a constant-time dummy compare to avoid user enumeration. Auth and bid endpoints
are rate-limited. Bidders are only ever shown as anonymous paddle numbers; reserve prices are
never sent to non-admin clients (only `reserveMet`).

### Image pipeline — Cloudinary

* **Signed direct upload** (`GET /api/admin/uploads/signature`): the browser uploads straight to
  Cloudinary with a server-issued signature; the API secret never leaves the server. Eager
  derivatives (1600px display, 600px smart-crop thumb) are generated at upload time.
* **Server-verified registration**: `POST /api/admin/lots/:id/images` confirms the asset exists in
  your account and permitted folder before it is attached to a lot.
* **Server-side upload fallback**: `POST /api/admin/lots/:id/images/upload` (multipart).
* **Responsive delivery**: `f_auto,q_auto,dpr_auto` with `srcset` widths.
* **Deep zoom** (`ZoomViewer`): shows the 1600px rendition instantly, then progressively swaps in
  the full-resolution original once zoomed past 160%; wheel/pinch zoom anchored at the cursor,
  drag to pan, keyboard controls.

Without Cloudinary credentials the app still runs: seeded images are public-domain works served
from Wikimedia Commons, and admin uploads are disabled with a hint. To push the seed images into
your Cloudinary account, set the `CLOUDINARY_*` vars and run
`SEED_UPLOAD_TO_CLOUDINARY=true npm run db:seed`.

---

## API

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | — |
| GET | `/api/auth/me` | user |
| GET | `/api/auctions?status=LIVE\|UPCOMING\|CLOSED` | — |
| GET | `/api/auctions/:slug?sort=lot\|ending\|priceAsc\|priceDesc\|bids&q=` | — |
| GET | `/api/lots/featured`, `/api/lots/ending-soon`, `/api/lots/:id`, `/api/lots/:id/bids` | — |
| POST | `/api/lots/:id/bids` `{ amount, maxAmount? }` | user |
| POST/DELETE | `/api/lots/:id/watch` | user |
| GET | `/api/me/bids`, `/api/me/watchlist` | user |
| GET | `/api/artists`, `/api/artists/:slug` | — |
| GET | `/api/config`, `/api/health` | — |
| * | `/api/admin/*` — auctions, lots, artists, images, upload signature | admin |

Errors are `{ "error": { "code", "message", "details?" } }`.

## Configuration (`server/.env`)

| Variable | Default | |
|---|---|---|
| `SERVER_PORT` / `PORT` | 4000 | API port (`SERVER_PORT` wins, so a tool injecting `PORT` for Vite can't hijack it) |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | ≥ 32 chars |
| `CLIENT_ORIGIN` | `http://localhost:5173` | comma-separated CORS origins |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | empty | enables uploads |
| `SOFT_CLOSE_WINDOW_SECONDS` / `SOFT_CLOSE_EXTENSION_SECONDS` | 120 / 120 | anti-sniping |
| `BUYERS_PREMIUM_PERCENT` | 20 | shown in bid confirmation |

## Production build

```bash
npm run build              # server -> server/dist, client -> client/dist
                           # (on Windows, stop `npm run dev` first - it locks Prisma's engine DLL)
npm run prisma:deploy -w server
npm start                  # serves the API + sockets
```

Serve `client/dist` from a CDN/static host with `VITE_API_URL` set to the API origin at build time,
and set `NODE_ENV=production` so auth cookies are `Secure; SameSite=None`.

---

Artwork images are public domain, courtesy of Wikimedia Commons. Seeded lots are for demonstration
only and are not offered for sale.
