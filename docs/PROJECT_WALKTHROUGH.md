# Atelier — Project Walkthrough

A guide for presenting and explaining the Atelier real-time painting auction platform. It goes from
the product view (what a user sees) down to the engineering details (how each piece works and why).

> Companion documents: [`SETUP.md`](../SETUP.md) (GitHub + local setup) and
> [`Atelier-Architecture.pdf`](./Atelier-Architecture.pdf) (HLD, ER diagram, schema, flowcharts).

---

## Contents

1. [The one-minute pitch](#1-the-one-minute-pitch)
2. [Tech stack and why](#2-tech-stack-and-why)
3. [Repository layout](#3-repository-layout)
4. [High-level architecture](#4-high-level-architecture)
5. [Data model](#5-data-model)
6. [Feature walkthrough (user-facing)](#6-feature-walkthrough-user-facing)
7. [The bidding engine (the core)](#7-the-bidding-engine-the-core)
8. [Proxy (maximum) bidding](#8-proxy-maximum-bidding)
9. [Auction lifecycle and the scheduler](#9-auction-lifecycle-and-the-scheduler)
10. [Real-time layer (Socket.io)](#10-real-time-layer-socketio)
11. [Server-synchronised countdowns](#11-server-synchronised-countdowns)
12. [Authentication and security](#12-authentication-and-security)
13. [Image pipeline (Cloudinary + deep zoom)](#13-image-pipeline-cloudinary--deep-zoom)
14. [Frontend architecture](#14-frontend-architecture)
15. [Admin console](#15-admin-console)
16. [API reference](#16-api-reference)
17. [Testing and verification](#17-testing-and-verification)
18. [Scaling and production considerations](#18-scaling-and-production-considerations)
19. [Demo script](#19-demo-script)
20. [Likely questions and answers](#20-likely-questions-and-answers)

---

## 1. The one-minute pitch

**Atelier** is an online auction house for paintings, modelled on premium online sale houses such
as Artrise Art. Collectors browse curated sales, inspect artworks at full resolution and bid live.
Every bid reaches every other bidder within milliseconds.

What makes it more than a CRUD app:

- **Correct under concurrency.** When many people bid on the same lot at the same instant, exactly
  one bid wins each price level. This is enforced by the database, not by hope.
- **Real-time everywhere.** Prices, bid histories, "you've been outbid" alerts, countdowns and lot
  closures are pushed over WebSockets.
- **Saleroom-grade rules.** Maximum (proxy) bids, an increment ladder, hidden reserves,
  anti-sniping soft close, staggered lot closing and a buyer's premium.
- **Gallery-grade imagery.** A Cloudinary pipeline with signed direct uploads, responsive delivery
  and a deep-zoom viewer that loads the full-resolution original only when needed.

---

## 2. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces (`server`, `client`) | One `npm install`, shared scripts, no extra tooling |
| API | Node 20, Express 4, TypeScript | Mature, simple, strongly typed |
| Real-time | Socket.io 4 | Rooms, automatic reconnection, polling fallback, acknowledgements |
| Database | PostgreSQL 16 | Real row-level locks and `SERIALIZABLE` isolation, which bidding needs |
| ORM | Prisma 5 | Type-safe queries, migrations, interactive transactions |
| Validation | Zod | One schema validates and types each request body |
| Auth | JWT + bcrypt (`bcryptjs`) | Stateless sessions in an HttpOnly cookie |
| Images | Cloudinary SDK | Signed uploads, on-the-fly transforms, global CDN |
| Frontend | React 18 + Vite + TypeScript | Fast dev server, code splitting |
| Server state | TanStack Query 5 | Caching, refetching; sockets patch the cache directly |
| Styling | Tailwind CSS 3 | Design tokens (ink, paper, gold) in one config |
| Motion | Framer Motion | Hero carousel, toasts, live bid-row highlights |
| Icons | lucide-react | Consistent stroke icons |
| Routing | React Router 6 | Nested layout, lazy-loaded pages |

---

## 3. Repository layout

```
BID/
├── package.json              # workspaces + root scripts (dev, build, db:*)
├── docker-compose.yml        # PostgreSQL 16 for local development
├── README.md, SETUP.md
├── docs/                     # this walkthrough + architecture PDF
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     # data model (8 models, 4 enums)
│   │   ├── migrations/       # generated SQL migrations
│   │   └── seed.ts           # demo users, artists, auctions, lots, bids
│   ├── scripts/
│   │   └── concurrency-test.ts   # fires N simultaneous bids, asserts consistency
│   └── src/
│       ├── index.ts          # boot: HTTP server + Socket.io + scheduler
│       ├── app.ts            # Express app: middleware + route mounting
│       ├── config/env.ts     # Zod-validated environment
│       ├── lib/              # prisma, cloudinary, increments, paddle, serializers, errors
│       ├── middleware/       # auth (JWT), validate (Zod), error handler
│       ├── routes/           # auth, auctions, lots, artists, me, admin
│       ├── services/
│       │   ├── bidding.ts    # transactional bid placement + proxy engine
│       │   └── scheduler.ts  # opens/closes lots, syncs auction status
│       └── socket/index.ts   # Socket.io server, rooms, clock sync
│
└── client/
    ├── index.html, vite.config.ts, tailwind.config.js
    └── src/
        ├── main.tsx, App.tsx     # providers + routes
        ├── lib/                  # api, socket, images, increments, format, types
        ├── hooks/                # useRealtime (cache bridge), useCountdown
        ├── context/              # AuthContext, ToastContext
        ├── components/           # Layout, LotCard, BidPanel, BidHistory, ZoomViewer, Countdown…
        └── pages/                # Home, Auctions, AuctionDetail, LotDetail, Artists, Auth, Account, Admin, HowToBid
```

---

## 4. High-level architecture

```
 Browser (React SPA)
   │  REST (fetch, cookies)          WebSocket (Socket.io)
   ▼                                  ▼
 ┌─────────────────────── Node.js process ───────────────────────┐
 │ Express API ── routes ── services/bidding ──┐                  │
 │                                             ├── Prisma ──► PostgreSQL
 │ Socket.io server ◄── broadcasts ────────────┤                  │
 │ Scheduler (1s tick) ────────────────────────┘                  │
 └───────────────────────────────────────────────────────────────┘
   │ signed upload params                    ▲ verify asset
   ▼                                         │
 Cloudinary (storage, transforms, CDN) ◄── browser uploads files directly
```

**Request paths:**

- **Reads** (catalogues, lots, artists): REST → Prisma → JSON. Responses are passed through
  *serializers* so private fields (reserve price, password hash) never leave the server.
- **Writes** (bids): REST → `placeBid()` transaction → commit → Socket.io broadcast.
- **Time-driven changes** (lot opens/closes): scheduler → conditional UPDATE → broadcast.
- **Images**: browser → Cloudinary directly (signed). The API only signs the request and verifies
  the result.

**Key principle:** the *database* is the single source of truth and the *only* place where
correctness is enforced. Sockets are a notification channel: if a socket message is lost, the next
REST fetch (refetch on focus/reconnect) repairs the view.

---

## 5. Data model

Eight tables (see the ER diagram in the PDF):

| Model | Purpose | Notable fields / constraints |
|---|---|---|
| `User` | Bidders and admins | `email` unique, `passwordHash`, `role` (`BIDDER`/`ADMIN`) |
| `Artist` | Artist profiles | `slug` unique, `born`, `died`, `bio` |
| `Auction` | A sale (catalogue) | `status` (`DRAFT/UPCOMING/LIVE/CLOSED`), `startsAt`, `endsAt` (first lot close), `lotIntervalSeconds` (stagger), `currency` |
| `Lot` | One artwork in a sale | estimates, `startingBid`, hidden `reservePrice`, denormalised live state (`currentBid`, `bidCount`, `highestBidderId`), `endsAt`, `extensionCount`, **`version`** |
| `LotImage` | Images for a lot | `provider` (`CLOUDINARY`/`EXTERNAL`), `publicId`, `url`, `width`, `height`, `position` |
| `Bid` | Immutable bid ledger | **`@@unique([lotId, amount])`**, `isProxy` |
| `AutoBid` | A bidder's confidential maximum | `@@unique([lotId, userId])`, `maxAmount` |
| `Watchlist` | Saved lots | composite PK `(userId, lotId)` |

**Design decisions worth explaining:**

- **Money as integers.** All amounts are whole currency units (`Int`), so there is no floating-point
  rounding. Ranges go up to ~₹200 Cr and stay within 32-bit limits.
- **Denormalised live state on `Lot`.** `currentBid`, `bidCount` and `highestBidderId` could be
  derived from `Bid`, but storing them makes catalogue pages a single cheap query. The bidding
  transaction keeps them in sync atomically, and the concurrency test checks they always match.
- **`Bid` is append-only.** History is never edited, which gives a full audit trail.
- **Indexes** match the hot queries: `(status, endsAt)` for the scheduler and "ending soon",
  `(lotId, createdAt)` for bid history, `(lotId, maxAmount)` for proxy resolution.

---

## 6. Feature walkthrough (user-facing)

### Home page (`pages/Home.tsx`)
- **Hero carousel** of featured lots (highest estimates, live/upcoming). It auto-advances every 7 s
  and pauses on hover. Each slide shows artist, title, estimate and a live countdown.
- **Current auctions**: live and upcoming sales with an image mosaic and a "first lot closes in"
  countdown.
- **Closing soon**: the next lots to close, updating live.
- **Explore tiles**, **Artist spotlight**, **Past auctions** with sale totals, and a **trust bar**
  (authenticity, bid live or set a maximum, international shipping). This mirrors the section
  structure of artriseart.com.

### Auctions list (`pages/Auctions.tsx`)
Tabs for **Current / Upcoming / Past**, driven by `?tab=` in the URL, so tabs are linkable.

### Auction catalogue (`pages/AuctionDetail.tsx`)
- Sale header: dates, lot count, sale total (past) or "next lot closes" (live).
- **Search** by artist or title (deferred input so typing stays smooth) and **sort** by lot number,
  closing soonest, price or most bids.
- Lot cards show status, countdown, estimate, current bid and a **Leading** badge if you are winning.
  The page joins one socket room for the whole auction, so every card updates live.

### Lot page (`pages/LotDetail.tsx`)
- Large image with **Inspect in detail** → deep-zoom viewer.
- Artist, title, estimate, prev/next lot navigation.
- **Bid panel** (`components/BidPanel.tsx`):
  - Current/starting bid with a flash animation when it changes, bid count, reserve status
    ("Reserve met" / "Reserve not met"; the amount is never shown).
  - Countdown blocks that turn red in the last 2 minutes, plus a soft-close extension notice.
  - **Quick bids**: the next three valid increments.
  - **Custom amount**: snapped up to the next valid increment.
  - **Set a maximum bid** (proxy).
  - **Confirmation step** showing bid, buyer's premium (20%) and total.
  - Banners: *You are the highest bidder* / *You have been outbid*.
  - **Watch** toggle (optimistic update).
- **Bid history** with paddle numbers (never names), proxy-bid icons and new rows highlighted.

### Accounts (`pages/Auth.tsx`, `pages/Account.tsx`)
- Register (name, email, password rules, phone, country) and log in. Each user gets an anonymous
  **paddle number**.
- **My account**: active bids with live standing (Leading / Outbid / Won / Not won /
  Reserve not met), won lots and watchlist.
- **Notifications**: outbid and win alerts arrive on a private socket channel as toasts that link to
  the lot.

### Artists and "How to bid"
Artist index and profile pages list works at auction. "How to bid" explains the rules, reading the
live values (premium, soft-close window) from `/api/config`.

---

## 7. The bidding engine (the core)

File: `server/src/services/bidding.ts` → `placeBid()`.

### The problem
Two bidders click "Bid ₹42.7 Cr" at the same millisecond. A naive implementation reads
`currentBid`, checks the amount and writes. Both requests read the same old price, both pass
validation, and both write: two winners, or a lost update.

### The solution: four layers of defence

1. **`SERIALIZABLE` transaction** (`prisma.$transaction(fn, { isolationLevel: Serializable })`).
2. **Pessimistic row lock** taken first:
   ```sql
   SELECT id FROM "Lot" WHERE id = $1 FOR UPDATE
   ```
   Every other bid on *this* lot waits until we commit. Bids on *other* lots are unaffected, so the
   lock is per lot, not global.
3. **Unique constraint** `Bid(lotId, amount)`: even if logic failed, the database refuses two bids
   at the same price on one lot.
4. **Optimistic version check** on the final write:
   ```ts
   updateMany({ where: { id, version: lot.version }, data: { ..., version: { increment: 1 } } })
   ```
   If anything else changed the row, zero rows update and we abort.

Failures that are expected under contention (`P2034` write conflict, Postgres `40001`
serialization failure, `40P01` deadlock, or a `P2002` unique collision) are **retried up to 5 times
with jittered backoff**. If contention persists, the client gets `409 BID_CONTENTION`.

### Steps inside the transaction
1. Lock the lot row; load it.
2. Validate: status `LIVE`, `startsAt ≤ now < endsAt`, amount ≥ **next minimum bid** (from the
   increment ladder), bidder isn't already leading (unless only raising their maximum).
3. Upsert the bidder's `AutoBid` if a maximum was supplied.
4. Run **proxy resolution** (section 8).
5. Insert all resulting bids in order (timestamps 1 ms apart so history sorts correctly).
6. **Soft close**: if the bid landed within `SOFT_CLOSE_WINDOW_SECONDS` (120 s) of `endsAt`,
   set `endsAt = now + SOFT_CLOSE_EXTENSION_SECONDS` and increment `extensionCount`.
7. Version-checked update of the lot's live state.
8. Return the new state, the bids and the list of users who lost the lead.

### After commit (never before)
`broadcastBidResult()` emits `lot:bid` to the lot and auction rooms and `user:outbid` to each
displaced bidder's private room. Because broadcasting happens only after commit, no client ever
sees a bid that was rolled back.

### Increment ladder (`lib/increments.ts`)
| Current price below | Increment |
|---|---|
| 1,000 | 50 |
| 5,000 | 100 |
| 10,000 | 500 |
| 50,000 | 1,000 |
| 1,00,000 | 5,000 |
| 5,00,000 | 10,000 |
| 10,00,000 | 25,000 |
| 50,00,000 | 1,00,000 |
| 1,00,00,000 | 2,50,000 |
| 5,00,00,000 | 5,00,000 |
| above | 10,00,000 |

The client keeps a mirrored copy only for UI (quick-bid buttons, snapping). **The server is
authoritative.**

---

## 8. Proxy (maximum) bidding

A bidder can say "bid for me up to ₹X". The amount is confidential and stored in `AutoBid`.

Algorithm (the loop in `placeBidTx`), repeated until no challenger remains:

1. `next` = current price + increment.
2. Find the strongest **challenger**: another bidder's `AutoBid` with `maxAmount ≥ next` (highest
   max first, earliest first on ties).
3. Compare with the **leader's ceiling** (their `AutoBid` max, or the current price):
   - **Challenger's max > leader's max**: the leader's proxy bids up to its ceiling, then the
     challenger bids one increment above. The challenger leads.
   - **Equal**: the earlier instruction wins at that amount (saleroom rule).
   - **Challenger's max < leader's max**: the challenger bids its max and the leader answers one
     increment higher. The leader keeps the lead.

**Example (verified live):**
1. Clara bids ₹72.2 Cr with max ₹75.81 Cr. She leads at ₹72.2 Cr.
2. Omar bids ₹72.3 Cr with no max. Clara's proxy replies ₹72.4 Cr, and Omar is told *"immediately
   outbid by another bidder's maximum bid"*.
3. Omar sets max ₹79.42 Cr. Clara's proxy goes to her ceiling (₹75.81 Cr), Omar's proxy goes one
   step above (₹75.91 Cr), and Omar leads.

All of this happens inside the same locked transaction, so proxy battles are atomic.

---

## 9. Auction lifecycle and the scheduler

File: `server/src/services/scheduler.ts`. A tick every second (skipped if the previous tick is still
running).

**Lot states:** `UPCOMING → LIVE → SOLD | PASSED`, plus `WITHDRAWN` (admin action).
**Auction states:** `DRAFT → UPCOMING → LIVE → CLOSED`.

Each tick does three things:

1. **Open due lots** in one atomic statement:
   ```sql
   UPDATE "Lot" SET status='LIVE', version=version+1
   WHERE status='UPCOMING' AND "startsAt" <= now() AND "endsAt" > now()
   RETURNING id
   ```
   Then it broadcasts `lot:update` for each opened lot.
2. **Close due lots**: for each lot past `endsAt`, a transaction locks the row (`FOR UPDATE`) and
   **re-checks `endsAt`**, because a bid in the last second may have extended it. The lot becomes
   `SOLD` if there is a bid and the reserve is met (or there is no reserve), otherwise `PASSED`.
   It broadcasts `lot:closed`, plus `user:won` to the winner.
3. **Sync auction status**: an auction becomes `LIVE` once started, and `CLOSED` once none of its
   lots are `UPCOMING`/`LIVE`.

**Staggered closing:** lot *n* closes at `auction.endsAt + (n − 1) × lotIntervalSeconds`, the way
online auction houses close lots one after another.

**Multi-instance safe:** every transition is a conditional update or a row-locked re-check, so if
two servers run the scheduler, exactly one wins each transition.

---

## 10. Real-time layer (Socket.io)

File: `server/src/socket/index.ts`; client: `client/src/lib/socket.ts`, `hooks/useRealtime.ts`.

**Handshake auth:** the JWT is read from the HttpOnly cookie in the handshake headers (or
`auth.token`). Anonymous visitors can connect and watch; only bidding needs an account.

**Rooms:**

| Room | Who joins | Events |
|---|---|---|
| `lot:<id>` | Anyone viewing that lot or its card | `lot:bid`, `lot:update`, `lot:closed` |
| `auction:<id>` | Anyone viewing that catalogue | same, for all lots in the sale |
| `user:<id>` | Automatically, if authenticated | `user:outbid`, `user:won` |
| `lobby` | Everyone | `auction:update` |

**Ref-counted subscriptions (client):** several components may need the same lot (a card on the
home page and the "closing soon" grid). `subscribeLot(id)` counts references and only emits
`lot:join` on the first and `lot:leave` on the last. After a reconnect, all rooms are re-joined
automatically.

**The cache bridge (`useRealtimeBridge`):** one listener at the app root receives every event and
calls `patchLotEverywhere()`, which merges the new state into every TanStack Query cache entry that
contains that lot: the lot page, catalogue lists, home lists, artist pages and "my bids". New bids
are de-duplicated by id. **Stale events are ignored by comparing `version`**, so an out-of-order
packet can never roll the UI back.

**Connection state recovery** (2 minutes) lets a briefly disconnected client receive missed events
on reconnect.

---

## 11. Server-synchronised countdowns

Device clocks are often minutes off, and a countdown based on them would lie about when bidding
closes. The client therefore estimates the **server clock offset**:

1. The first estimate comes from `serverTime` in `/api/config` and the lot responses.
2. It is refined with an NTP-style exchange over the socket (`time:sync` with an acknowledgement):
   four samples, `offset = serverTime − (t0 + rtt/2)`, keeping the **lowest-RTT** sample, which has
   the least network asymmetry error. This re-runs every 60 s and on every reconnect.

`useCountdown` uses `serverNow() = Date.now() + offset` and schedules its next tick on the exact
second boundary. When the offset changes, every countdown re-renders immediately. The server
remains the final authority: even a perfectly synced client cannot bid after `endsAt`.

---

## 12. Authentication and security

| Concern | Implementation |
|---|---|
| Password storage | bcrypt, cost 12 |
| User enumeration | Login compares against a dummy hash when the email doesn't exist, so the timing is the same either way |
| Session | JWT (`sub`, `role`), 7-day expiry, in an **HttpOnly** cookie (`SameSite=Lax` in dev, `None; Secure` in prod); `Authorization: Bearer` also accepted (used by scripts) |
| Authorisation | `requireAuth`, `requireAdmin` middleware; admin routes mounted behind `router.use(requireAdmin)` |
| Input validation | Zod on every body/query; unknown fields stripped; amounts bounded |
| Rate limiting | Auth: 30 requests / 15 min / IP. Bids: 20 / 10 s / user |
| Headers | `helmet()`, `x-powered-by` disabled, JSON body limit 100 kb |
| CORS | Explicit allow-list from `CLIENT_ORIGIN`, credentials enabled |
| Data minimisation | Serializers never expose `reservePrice` or `passwordHash`; bidders appear as paddle numbers (an FNV-1a hash of the user id) |
| Uploads | Cloudinary secret never leaves the server; uploaded assets are verified to exist and to be in the permitted folder before being attached |
| Config | `env.ts` validates every variable at boot and refuses to start on bad config (e.g. a JWT secret shorter than 32 characters) |
| Errors | Uniform `{ error: { code, message, details } }`; internal messages hidden in production |

---

## 13. Image pipeline (Cloudinary + deep zoom)

### Upload (admin)
1. The admin picks files on a lot.
2. The client calls `GET /api/admin/uploads/signature?lotId=…`. The server signs
   `{timestamp, folder, eager}` with the API secret.
3. The browser posts the file **directly to Cloudinary** (XHR with a progress bar). No file bytes
   pass through our server.
4. Cloudinary generates **eager derivatives** at upload time (1600 px display, 600 px smart-crop
   thumbnail), so the first view is instant.
5. The client calls `POST /api/admin/lots/:id/images {publicId}`. The server **verifies** the asset
   via the Admin API (it exists and is inside the allowed folder) and only then stores a `LotImage`.

A server-side multipart fallback (`/images/upload`, multer memory storage, 25 MB, image MIME types
only) also exists.

### Delivery
`client/src/lib/images.ts` builds transformation URLs:
`f_auto,q_auto,c_limit,w_800,dpr_auto/<publicId>`. These serve AVIF/WebP where supported, apply
perceptual quality and scale to the device pixel ratio. `srcset` offers 400–1600 px widths.
`c_fill,g_auto` gives smart-cropped thumbnails.

Seed images are public-domain paintings from Wikimedia Commons (`provider = EXTERNAL`). The same
helper maps them to Wikimedia's standard thumbnail widths, so everything works without a Cloudinary
account. `SEED_UPLOAD_TO_CLOUDINARY=true` pushes them into Cloudinary.

### Deep zoom (`components/ZoomViewer.tsx`)
- Opens instantly with the 1600 px rendition.
- When the user zooms past **160%**, the full-resolution original is pre-loaded in the background
  and swapped in seamlessly ("Full resolution" indicator). Verified: a 3422 × 3396 original at 225%.
- Wheel zoom anchored at the cursor (the point under the mouse stays fixed), drag to pan,
  **pinch-zoom** on touch (pointer events), double-click toggle, keyboard (+, −, ←, →, Esc).
- Zoom and pan live in one state object with pure updates, so it is safe under React StrictMode.

---

## 14. Frontend architecture

- **Providers** (`main.tsx`): QueryClient → Router → Toasts → Auth → App.
- **Routing** (`App.tsx`): one `Layout` with nested routes. Every page except Home is
  **lazy-loaded** (code splitting). `/account` and `/admin` are wrapped in `RequireAuth`.
- **Data fetching**: TanStack Query with query keys `["lot", id]`, `["auction", slug, sort, q]`,
  `["lots", "featured"]`, `["me", "bids"]`, etc. Sockets keep these fresh, and
  `refetchOnWindowFocus` covers anything missed while the tab was hidden.
- **Auth state** (`AuthContext`): `/auth/me` as a query. After login or logout it invalidates
  viewer-specific queries and **reconnects the socket**, so the handshake picks up the new cookie.
- **Bid mutation**: on success the response is written into the cache immediately (no waiting for
  the socket echo). On `BID_TOO_LOW` the UI adopts the server's new minimum.
- **Design system** (`tailwind.config.js`, `index.css`): ink/paper/gold tokens, Cormorant Garamond
  display serif + Inter, `.btn-*`, `.input`, `.eyebrow` component classes, animations
  (`flash` for price changes, `pulseDot` for LIVE badges).
- **Accessibility**: labelled controls, `role="tablist"`/`tab`, `aria-live` toasts, `role="timer"`
  countdowns, keyboard support in the viewer.

---

## 15. Admin console

`/admin` (role `ADMIN`):

- **Stats**: registered users, bids placed, lots sold, hammer total.
- **Create auction**: title, subtitle, description, currency, opening time, first-lot close, stagger
  seconds, publish now or save as draft.
- **Manage lots**: add a lot (title, existing or new artist, year, medium, dimensions, estimates,
  starting bid, **hidden reserve**, catalogue note, provenance). The lot number and close time are
  computed automatically from the stagger.
- **Images**: signed direct upload with progress, thumbnails, delete (also removes the asset from
  Cloudinary).
- **Withdraw** a live or upcoming lot (broadcasts the closure).
- Admins see reserve prices; nobody else does.

---

## 16. API reference

Base path `/api`. Errors: `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | DB ping |
| GET | `/config` | — | Cloudinary status, auction rules, server time |
| POST | `/auth/register` | — | Create account → sets cookie |
| POST | `/auth/login` | — | Log in → sets cookie |
| POST | `/auth/logout` | — | Clears cookie |
| GET | `/auth/me` | user | Current user (+ paddle) |
| GET | `/auctions?status=` | — | List sales with lot count, preview images, sale totals |
| GET | `/auctions/:slug?sort=&q=` | — | Sale + its lots |
| GET | `/lots/featured` | — | Hero lots |
| GET | `/lots/ending-soon` | — | Next live lots to close |
| GET | `/lots/:id` | optional | Lot, 50 latest bids, prev/next, viewer state, server time |
| GET | `/lots/:id/bids?cursor=` | — | Paginated bid history |
| POST | `/lots/:id/bids` | user | `{ amount, maxAmount? }` → place bid |
| POST/DELETE | `/lots/:id/watch` | user | Watch / unwatch |
| GET | `/me/bids` | user | Lots I bid on, with standing |
| GET | `/me/watchlist` | user | Watched lots |
| GET | `/artists`, `/artists/:slug` | — | Artists |
| GET | `/admin/overview` | admin | Stats, auctions, artists |
| POST | `/admin/artists` | admin | Create artist |
| POST | `/admin/auctions` | admin | Create auction |
| GET | `/admin/auctions/:id` | admin | Sale with reserves |
| PATCH | `/admin/auctions/:id/publish` | admin | Draft → upcoming |
| POST | `/admin/auctions/:id/lots` | admin | Add lot |
| POST | `/admin/lots/:id/withdraw` | admin | Withdraw lot |
| GET | `/admin/uploads/signature?lotId=` | admin | Signed Cloudinary params |
| POST | `/admin/lots/:id/images` | admin | Register a verified upload |
| POST | `/admin/lots/:id/images/upload` | admin | Multipart upload fallback |
| DELETE | `/admin/images/:id` | admin | Remove image |

**Bid error codes:** `BID_TOO_LOW` (includes `details.minimum`), `ALREADY_LEADING`,
`LOT_NOT_LIVE`, `LOT_NOT_STARTED`, `LOT_CLOSED`, `INVALID_MAX_BID`, `BID_CONTENTION`,
`RATE_LIMITED`.

**Socket events:** client → server `lot:join`, `lot:leave`, `auction:join`, `auction:leave`,
`time:sync`; server → client `lot:bid`, `lot:update`, `lot:closed`, `auction:update`,
`user:outbid`, `user:won`.

---

## 17. Testing and verification

| Check | How | Result |
|---|---|---|
| Race condition | `npm run test:concurrency -w server`: 40 identical bids at the same instant from 4 accounts | 1 accepted, 30 `BID_TOO_LOW`, 9 `ALREADY_LEADING`; DB state consistent ✅ |
| Proxy engine | Scripted Clara/Omar scenario (section 8) | Correct auto-outbid, ceiling spent, correct leader ✅ |
| Real-time | Bid in browser, competing bid via API | Price, banner and outbid toast updated within ~1 s ✅ |
| Soft close | Late bids during the test | `endsAt` extended ✅ |
| Hammer-down | Watched scheduled closes | Reserve not met → `PASSED`; met → `SOLD`, within ~1 s ✅ |
| Deep zoom | Zoom to 225% | Original 3422 × 3396 swapped in ✅ |
| Types/builds | `tsc` on both apps, `vite build` | Clean ✅ |

---

## 18. Scaling and production considerations

- **Horizontal scaling:** add `@socket.io/redis-adapter` so broadcasts fan out across instances.
  The bidding and scheduler logic is already multi-instance safe.
- **Database:** per-lot row locks mean throughput scales with the number of *different* lots being
  bid on. Use connection pooling (PgBouncer or Prisma Accelerate) at scale.
- **Scheduler:** at large scale, move to a dedicated worker or `pg_cron`, or elect a leader with
  `pg_try_advisory_lock`.
- **Payments and invoicing**, **KYC / bidder approval** and **email/SMS notifications** are natural
  next modules (hooks: `user:won`, lot `SOLD` transition).
- **Observability:** structured logging (pino), metrics on bid latency and retries, and an alert on
  `BID_CONTENTION` rate.
- **Deployment:** API on Render, Railway, Fly or ECS; client on Vercel, Netlify or a CDN with
  `VITE_API_URL`; managed Postgres (Neon, Supabase, RDS); `NODE_ENV=production` for secure cookies.

---

## 19. Demo script

1. **Home**: point out the hero carousel, live countdowns, "Closing soon" and the trust bar
   (Artrise-style structure).
2. **Open a live auction**: search, sort by "Closing soonest", show the live countdowns.
3. **Open a lot**, then *Inspect in detail*: zoom past 160% and point out "Full resolution" loading.
4. **Log in as two bidders** in two browser windows (normal + private): `asha@atelier.test` and
   `rohan@atelier.test` / `Bidder@123`.
5. Asha bids → Rohan's window updates instantly. Rohan bids → Asha gets the red banner and the
   outbid toast.
6. Asha sets a **maximum bid**. Rohan bids again and is "immediately outbid by another bidder's
   maximum bid".
7. Watch a lot hit zero → it closes as **Sold** or **Unsold** (reserve) live.
8. **Admin** (`admin@atelier.test` / `Admin@12345`): create an auction, add a lot, upload an image
   (with Cloudinary keys).
9. Terminal: `npm run test:concurrency -w server` → **PASS**. Explain the four layers of defence.

---

## 20. Likely questions and answers

**Why not just use a Redis lock or an in-memory queue?**
The database is already the source of truth. A row lock inside the same transaction that writes the
bid guarantees correctness with no extra infrastructure and no split-brain risk between Redis and
Postgres.

**Why both `FOR UPDATE` and `SERIALIZABLE`?**
`FOR UPDATE` makes bids on one lot queue instead of failing. `SERIALIZABLE` catches any anomaly the
lock doesn't cover (for example, the AutoBid reads). The unique constraint and version check are
belt and braces, and all four are cheap.

**What happens if two bids arrive in the last second?**
They serialise on the lock. The first may extend `endsAt` (soft close). The scheduler re-checks
`endsAt` under the same lock before closing, so a lot can never close while a valid bid is
committing.

**Can a client cheat the countdown?**
No. The countdown is cosmetic. The server rejects bids at or after `endsAt`.

**How do you stop the UI from showing stale or out-of-order updates?**
Every lot state carries a `version`. The client ignores any event with a lower version than it
already has.

**Why is the reserve hidden?**
That's auction-house practice. Bidders only see "reserve met / not met". The API never serialises
the amount to non-admins.

**What if the WebSocket drops?**
Socket.io reconnects with backoff, re-joins rooms and recovers missed events (2-minute window).
TanStack Query also refetches on focus/reconnect. Correctness never depends on the socket.

**Why integers for money?**
To avoid floating-point rounding. Amounts are whole currency units, and the buyer's premium is
rounded once, for display.
