# Atelier — User & Admin Guide

A practical, page-by-page guide to using Atelier: how to **schedule an auction**, **add paintings**,
**upload images** and **run a sale**, and what bidders see and do on every page.

> Related: [`SETUP.md`](../SETUP.md) (install & GitHub) ·
> [`PROJECT_WALKTHROUGH.md`](./PROJECT_WALKTHROUGH.md) (technical deep dive) ·
> [`Atelier-Architecture.pdf`](./Atelier-Architecture.pdf) (diagrams)

---

## Contents

1. [What Atelier is (short explanation)](#1-what-atelier-is)
2. [Before you start](#2-before-you-start)
3. [Do I need Cloudinary keys?](#3-do-i-need-cloudinary-keys)
4. [Admin workflow — schedule an auction and add paintings](#4-admin-workflow)
5. [Bidder workflow — register, inspect, bid, win](#5-bidder-workflow)
6. [Page-by-page reference](#6-page-by-page-reference)
7. [Auction rules at a glance](#7-auction-rules-at-a-glance)
8. [FAQ & troubleshooting](#8-faq--troubleshooting)

---

## 1. What Atelier is

Atelier is an **online auction house for paintings**, modelled on premium online sale houses such as
Artrise Art. Admins publish **auctions** (sales), and each auction contains **lots** (individual
paintings). Collectors register, inspect the artworks in high resolution and **bid live**. Every bid
appears instantly on every other bidder's screen, and lots close one after another on a countdown.

What it handles for you automatically:

- **Opening and closing lots on time.** A background scheduler opens lots when the auction starts
  and closes each lot at its own time.
- **Fair bidding.** Bids must follow an increment ladder, and simultaneous bids are resolved safely
  so there is always exactly one highest bidder.
- **Maximum (proxy) bids.** A bidder can leave a maximum, and the system bids for them one step at a
  time.
- **Anti-sniping.** A bid in the last 2 minutes extends that lot by 2 minutes.
- **Hidden reserves.** A lot only sells if bidding reaches its secret minimum price.
- **Notifications.** "You've been outbid" and "You won" alerts appear in real time.

---

## 2. Before you start

1. The app is running (`npm run dev`, with Docker Desktop and the database running). See
   [`SETUP.md`](../SETUP.md).
2. Open **http://localhost:5173**.
3. Use these accounts (created by `npm run db:seed`):

| Role | Email | Password | Can do |
|---|---|---|---|
| **Admin** | `admin@atelier.test` | `Admin@12345` | Everything bidders can, plus the **Admin** console |
| Bidder | `asha@atelier.test` | `Bidder@123` | Browse, bid, watch |
| Bidder | `rohan@` · `clara@` · `omar@atelier.test` | `Bidder@123` | (extra accounts for testing) |

New accounts created through **Register** are always bidders. To make someone an admin, change their
`role` to `ADMIN` in the database (e.g. in Prisma Studio: `cd server && npx prisma studio`, open
**User**, edit `role`), then have them log out and back in.

---

## 3. Do I need Cloudinary keys?

**Short answer:** not for creating auctions or adding paintings, but **yes for uploading
photos of the paintings**.

| Task | Needs Cloudinary? | Notes |
|---|---|---|
| Browse the seeded demo sales | ❌ No | Demo images load from Wikimedia Commons |
| Create / schedule an auction | ❌ No | |
| Add a painting (lot): title, artist, estimates, reserve… | ❌ No | |
| **Upload a photo of a painting** | ✅ **Yes** | Without keys the **Upload** tile reads **"No Cloudinary"** and is disabled |
| Bidding, countdowns, results | ❌ No | |

**What happens if you add a lot without a photo?** It works and can be bid on. Its card and lot page
show a grey "no image" placeholder, and lots without images are not picked for the home-page hero
carousel. For a real sale you'll want photos, so set up Cloudinary.

### Setting up Cloudinary (about 5 minutes, free)

1. Sign up at **https://cloudinary.com** (the free plan is enough).
2. Open the **Dashboard** (Programmable Media → *API Keys*). Copy **Cloud name**, **API Key** and
   **API Secret**.
3. Put them in `server/.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=123456789012345
   CLOUDINARY_API_SECRET=your_api_secret
   ```
4. **Restart** the app (stop `npm run dev` with Ctrl+C and start it again).
5. Open **Admin**: the image tiles now read **Upload**.

> Keep `server/.env` private. It is excluded from Git by `.gitignore`. Never paste the API secret
> into the client or into a commit.

---

## 4. Admin workflow

The whole job of running a sale happens in the **Admin console** (`/admin`):

```
 Log in as admin ─► Admin console ─► ① New auction ─► ② Add lots (paintings)
                                        │                  │
                                        │                  └─► ③ Upload photos (Cloudinary)
                                        ▼
                              ④ Publish (if saved as draft)
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
   "Bidding opens" time reached                      ⑤ During the sale: monitor, withdraw a lot
   → all lots go LIVE automatically                                │
             │                                                     ▼
             └─► lots close one by one ─► SOLD / Unsold ─► ⑥ Results on the public pages
```

### Step 0 — Open the console

1. Click **Log in** (top right) → `admin@atelier.test` / `Admin@12345`.
2. An **Admin** link appears in the header. Click it, or go to **http://localhost:5173/admin**.

What you see:

- **Saleroom console** heading and a **+ New auction** button.
- Four stat tiles: **Registered users · Bids placed · Lots sold · Hammer total**.
- **Left column:** every auction (status badge, number of lots, opening time). Click one to manage it.
- **Right panel:** the selected auction, with its lots.

### Step 1 — Schedule an auction

Click **+ New auction** and fill in the form:

| Field | What it means | Example |
|---|---|---|
| **Title** *(required, ≥ 3 chars)* | Sale name shown everywhere | `Modern Indian Masters — Winter Sale` |
| **Subtitle** | Line under the title | `Works on canvas and paper` |
| **Bidding opens** | Date & time all lots go **LIVE** (your local time) | `10 Nov, 18:00` |
| **First lot closes** | When **Lot 1** closes. Must be after *Bidding opens* | `12 Nov, 20:00` |
| **Seconds between lot closes** | The stagger: Lot 2 closes this many seconds after Lot 1, and so on (0–3600) | `60` |
| **Currency** | INR, USD, EUR, GBP or AED. All amounts in this sale use it | `INR` |
| **Description** | Shown on the auction page | Sale terms, highlights… |
| **Publish immediately** | ✅ ticked: visible to the public now, shown as *Upcoming*. ☐ unticked: saved as a **Draft**, hidden until you publish | |

Click **Create auction**. It appears in the left list and is selected.

**How closing times work.** Lots close in sequence:

```
Lot n closes at  =  First lot closes  +  (n − 1) × Seconds between lot closes
```

*Example:* first lot closes **20:00**, stagger **60 s**, 10 lots → Lot 1 at 20:00:00, Lot 2 at
20:01:00 … Lot 10 at 20:09:00. Any bid in a lot's final 2 minutes pushes **that lot** back by
2 minutes (soft close). The other lots keep their times.

> **Plan the times first.** There is no "edit auction" screen yet. If you get a time wrong, create a
> new auction (or edit the row in Prisma Studio before the sale starts).

### Step 2 — Add paintings (lots)

With the auction selected, click **+ Add lot**:

| Field | What it means |
|---|---|
| **Title** *(required)* | Title of the work, e.g. `Village Women` |
| **Artist** | Pick an existing artist, **or** type a name in **"…or new artist name"** to create one |
| **Year** · **Medium** · **Dimensions** | Free text, e.g. `1938` · `Oil on canvas` · `92 x 61 cm` |
| **Low estimate** / **High estimate** *(required)* | Expected price range shown to bidders. High ≥ Low |
| **Starting bid** *(required)* | The first bid must be at least this |
| **Reserve (hidden)** | Secret minimum. If bidding ends below it, the lot is **Unsold**. Bidders only see "Reserve met / not met". Leave blank for no reserve |
| **Signature** | e.g. `Signed lower right` |
| **Catalogue note** | Description shown on the lot page |
| **Provenance** | Ownership history |

Click **Add lot**. Atelier gives it the next **lot number** automatically (1, 2, 3…) and computes its
closing time from the stagger. Repeat for every painting, **in the order you want them to close**.

Amounts are whole numbers in the auction's currency. Commas and symbols are ignored, so
`25,00,000` and `2500000` are the same.

> **Add all lots before bidding opens.** If you add a lot to a sale that is already running, its
> closing time is still calculated from the original schedule. If that time has already passed, the
> lot closes straight away as Unsold.

### Step 3 — Upload photos *(requires Cloudinary, see §3)*

Each lot row in the console has an image strip:

1. Click the **Upload** tile and choose one or more images (**JPEG, PNG, WebP, TIFF or AVIF**).
   Cloudinary's free plan accepts images up to 10 MB each.
2. A tile shows the upload **progress %** for each file.
3. When done, the thumbnails appear. **The first image is the main image** on cards and the lot
   page; the others become gallery thumbnails.
4. To remove an image, hover its thumbnail and click the **🗑 trash** icon. It is deleted from
   Cloudinary too.

Upload the largest, sharpest photo you have. Visitors see a fast, resized version, and the
**Inspect in detail** viewer loads the full resolution when they zoom in.

*Under the hood:* the file goes **straight from your browser to Cloudinary** using a short-lived
signature from the server. The server then checks the upload is real before attaching it to the lot.

### Step 4 — Publish (only if you saved a draft)

A draft shows a dashed **DRAFT** badge and a **Publish** button. Drafts are invisible to the public:
their lots won't open, close or appear anywhere, even if the opening time passes. Click **Publish**
when the catalogue is ready. The status becomes **Upcoming**.

### Step 5 — During the sale

You don't need to do anything for the sale to run:

- At **Bidding opens**, every lot switches to **LIVE** automatically and the auction shows
  **Live**.
- Each lot **closes on its own** at its time (plus any soft-close extensions).
- Click **View public page** to see the catalogue exactly as bidders do.
- Each lot row shows **current bid, number of bids, reserve and closing time**. Refresh the console
  to update these figures. The public pages update live.
- **Withdraw**: removes a live or upcoming lot from the sale (you'll be asked to confirm). It
  disappears from the catalogue, and anyone viewing it sees it as closed. This can't be undone.

### Step 6 — After the sale

- Each lot ends as **Sold** (highest bid ≥ reserve, or no reserve) or **Unsold** (no bids, or
  reserve not met).
- When the last lot closes, the auction becomes **Closed** and moves to **Results**
  (`/auctions?tab=past`) with its **sale total**.
- Winners get a **"Congratulations — you won!"** notification, and the lot appears under
  **My account → Won lots**.
- The console's **Lots sold** and **Hammer total** tiles update.

> There is no invoicing or payment step yet. The winner and price are recorded on the lot
> (`status = SOLD`, `currentBid`, `highestBidderId`).

### Quick checklist for a new sale

- [ ] Cloudinary keys in `server/.env` (if you want photos)
- [ ] **New auction**: times chosen, stagger set, currency correct, saved as **draft**
- [ ] **Add lot** for each painting, in closing order
- [ ] **Upload** at least one photo per lot
- [ ] Check **View public page** (only after publishing) or review the console list
- [ ] **Publish**
- [ ] Watch it run; **Withdraw** a lot if needed

---

## 5. Bidder workflow

1. **Register.** Click **Register to bid** and enter name, email, password (8+ characters with a
   letter and a number), and optionally phone and country. You get a private **paddle number** (e.g.
   **#3715**). Other bidders only ever see this number, never your name.
2. **Browse.** **Auctions** → choose a sale → search or sort the catalogue.
3. **Inspect.** Open a lot → **Inspect in detail** → scroll or pinch to zoom into the brushwork.
4. **Bid.** In the bid panel, pick one of the three quick amounts or type your own (it's rounded up
   to a valid step) → **Bid ₹…** → check the **buyer's premium** and **total** → **Confirm**.
5. **Or set a maximum.** Tick **Set a maximum bid**, enter your limit and confirm. Atelier bids for
   you only as much as needed to keep you ahead, up to your limit. Nobody else sees your maximum.
6. **Follow along.** A green banner means **You are the highest bidder**. A red banner and an
   **"You've been outbid"** pop-up (on any page) mean someone has bid more; click the pop-up to go
   straight back.
7. **Watch.** Click **♡ Watch** on any lot to save it to your watchlist.
8. **Win.** When the lot closes with you on top and the reserve met, you'll see **"Congratulations —
   you won!"**, and the lot appears under **My account → Won lots**.

---

## 6. Page-by-page reference

### Header & footer (every page)

- **Top black bar:** "Authenticity guaranteed · Worldwide shipping".
- **Logo (ATELIER):** back to Home.
- **Menu:** **Auctions** (live sales) · **Upcoming** · **Results** (past sales) · **Artists** ·
  **How to Bid**. On narrow screens these sit behind the ☰ button.
- **Logged out:** **Log in** · **Register to bid**.
- **Logged in:** **Admin** (admins only) · *your first name and #paddle* (opens My account) · logout
  icon.
- **Footer:** Quick links, Buying links, and a **Subscribe** box (demo only: it shows a confirmation
  but doesn't store emails yet).

### Home — `/`

| Section | What it shows |
|---|---|
| **Hero carousel** | Big slides of headline lots: artist, title, estimate, live countdown, **Bid now / View lot** and **View auction**. It auto-advances every 7 s and pauses on hover; use the arrows or bars to move. If nothing is live or upcoming, it shows top works from past sales |
| **Current auctions** | Live and upcoming sales: image mosaic, status, dates, "first lot closes in" or "opens in", lot count |
| **Closing soon** | The next live lots to close, with live prices |
| **Find your next acquisition** | Three tiles: Live Auctions, Upcoming Sales, Artists |
| **Artist spotlight** | A featured artist with bio and **Learn more** |
| **Past auctions** | Recent finished sales with dates, lot count and **sale total** |
| **Trust bar** | Authenticity Guarantee · Bid live or set a maximum · International Shipping |

### Auctions — `/auctions`, `/auctions?tab=upcoming`, `/auctions?tab=past`

Three tabs: **Current** (live), **Upcoming** and **Past**. Each sale card shows images, status,
dates, countdown and lot count. Click a card to open its catalogue.

### Auction catalogue — `/auctions/<sale-name>`

- **Header:** status, title, subtitle, description, opening and first-close times, number of lots
  (and how many are live). It also shows **Next lot closes** with a countdown (live sales),
  **Opens in** (upcoming) or **Sale total** (past).
- **Search** by artist or title, and **Sort by**: Lot number · Closing soonest · Price high→low ·
  Price low→high · Most bids.
- **Lot cards:** image, status badge (LIVE / UPCOMING / SOLD / Unsold), **Leading** badge if you're
  winning, lot number, countdown, artist, title, estimate, current bid and bid count. Prices and
  countdowns update live.

### Lot page — `/lots/<id>`

| Area | What's there |
|---|---|
| **Breadcrumb & Prev/Next** | Back to the sale; jump to the neighbouring lots |
| **Main image** | Click **Inspect in detail** for the zoom viewer: zoom to 800% with the scroll wheel, pinch or the +/− buttons; drag to pan; double-click to toggle; ←/→ for other images; Esc to close. "Full resolution" appears once the original has loaded |
| **Thumbnails** | Other photos of the work (if any) |
| **Title block** | Status, lot number, **artist** (links to their page), nationality and dates, title, year, **estimate** |
| **Bid panel** | Current or starting bid (flashes when it changes), bid count, reserve status, **watch** toggle, countdown (red in the final 2 minutes) and soft-close notice. Also: quick-bid buttons, custom amount, **Set a maximum bid**, the confirmation step with buyer's premium and total, and the leading/outbid banner. When the lot is closed: the result. Logged out: **Log in / Register** buttons |
| **Lot details tab** | Medium, dimensions, date, signature, catalogue note, provenance, about the artist |
| **Bid history tab** | Every bid: paddle number ("You" for yours), a 🤖 icon for automatic bids from a maximum, amount, time |
| **Live activity** *(wide screens)* | The latest bids, updating in real time |

### Artists — `/artists` and `/artists/<name>`

An index of all artists, with an image, nationality, dates and number of lots. The profile page shows
the bio and every work of theirs at auction (live, upcoming or sold).

### How to Bid — `/how-to-bid`

Six illustrated steps (register → inspect → bid live → leave a maximum → soft close → win & collect)
and the **buyer's premium** explanation.

### Log in / Register — `/login`, `/register`

Standard forms. Errors are shown next to each field. After logging in you return to the page you
came from.

### My account — `/account` *(logged in)*

- Your name, email and **paddle number**.
- Tiles: **Active bids · Leading · Won**.
- **My bids** tab: every lot you've bid on, with your top bid, the current or final price, a
  countdown if live, and your standing: **Leading · Outbid · Won · Not won · Reserve not met**.
- **Won lots** tab: just your wins.
- **Watchlist** tab: lots you're watching.

### Admin console — `/admin` *(admins only)*

See **[§4 Admin workflow](#4-admin-workflow)**. Non-admins who open this address are sent back to
Home.

---

## 7. Auction rules at a glance

| Rule | Value / behaviour |
|---|---|
| **Bid increments** | Depend on the current price, e.g. ₹1,000 steps from ₹10,000; ₹1,00,000 steps from ₹10 lakh; ₹5,00,000 steps from ₹1 crore; ₹10,00,000 steps above ₹5 crore |
| **First bid** | At least the starting bid |
| **Soft close** | A bid in the final **2 min** extends that lot to **2 min** from the bid |
| **Buyer's premium** | **20%** on top of the hammer price, shown before you confirm |
| **Reserve** | Hidden; below it the lot is **Unsold** |
| **Maximum bids** | Confidential. On equal maximums, the one placed **first** wins |
| **Bidding against yourself** | Not allowed. When leading, you can only raise your maximum |
| **Lot states** | Upcoming → Live → **Sold** / **Unsold**, or **Withdrawn** |
| **Auction states** | Draft → Upcoming → Live → Closed |

Premium and soft-close timings are set in `server/.env` (`BUYERS_PREMIUM_PERCENT`,
`SOFT_CLOSE_WINDOW_SECONDS`, `SOFT_CLOSE_EXTENSION_SECONDS`).

---

## 8. FAQ & troubleshooting

**The Upload tile says "No Cloudinary".**
Add the three `CLOUDINARY_*` keys to `server/.env` and restart the app (§3).

**I created an auction but bidders can't see it.**
It's probably a **Draft**: select it in the console and click **Publish**.

**The demo sales have no live lots any more.**
Seeded times are relative to when you seeded. Run `npm run db:seed` to reset. Note that this
**wipes all data**, including auctions you created.

**My lot closed immediately as Unsold.**
It was added after its calculated closing time had passed (see the note in Step 2). Add lots before
bidding opens.

**Can I edit an auction or lot after creating it?**
Not in the console yet. You can edit fields in Prisma Studio (`cd server && npx prisma studio`).
Safest before bidding opens: don't change `currentBid`, `bidCount`, `highestBidderId` or `version`
by hand.

**Times look wrong.**
Times in the console are entered and shown in **your computer's local time zone** and stored in
UTC. Countdowns use the server's clock, so they're correct even if your PC clock is off.

**I want another admin.**
Register them normally, then set their `role` to `ADMIN` in Prisma Studio, and have them log out and
in again.

**Where's the data?**
In PostgreSQL (Docker). Browse it with `cd server && npx prisma studio` → http://localhost:5555.
