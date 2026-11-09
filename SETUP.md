# Setup Guide — Atelier

This guide covers two things:

- **Part A**: pushing this project from your machine to GitHub.
- **Part B**: setting it up on any machine from GitHub (clone → run).

Commands are shown for **Windows (PowerShell or Git Bash)**. They work the same on macOS/Linux
unless noted.

---

## Prerequisites

| Tool | Version | Check | Get it |
|---|---|---|---|
| Git | 2.30+ | `git --version` | https://git-scm.com/downloads |
| Node.js | 20 LTS+ | `node -v` | https://nodejs.org |
| npm | 10+ | `npm -v` | ships with Node |
| Docker Desktop | any recent | `docker --version` | https://www.docker.com/products/docker-desktop |
| GitHub account | — | — | https://github.com |
| GitHub CLI *(optional)* | 2.x | `gh --version` | https://cli.github.com |

Docker is only used to run PostgreSQL. If you already have PostgreSQL 14+ installed or use a
hosted database (Neon, Supabase, Railway), you can skip Docker. See [B6](#b6-without-docker).

---

# Part A — Push the project to GitHub

### A1. Check what will be committed

The repo's `.gitignore` already excludes secrets and build output:

```
node_modules
dist
.env
*.log
.DS_Store
coverage
```

> ⚠️ **Never commit `server/.env`.** It contains your JWT secret and Cloudinary keys. Only
> `server/.env.example` (placeholders) is committed. Anyone cloning copies it to `.env`.

The Prisma migration in `server/prisma/migrations/` **should** be committed, because it is how other
machines build the same schema.

### A2. Initialise the local repository

From the project root (`D:\BID`):

```bash
git init
git branch -M main
git add .
git status
```

Look over the `git status` output. You should **not** see `node_modules/`, `server/.env` or `dist/`.
If you do, stop and fix `.gitignore` before continuing.

```bash
git commit -m "Initial commit: Atelier real-time art auction platform"
```

If Git asks who you are (first time on this machine):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### A3. Create the GitHub repository

**Option 1 — Website**

1. Go to https://github.com/new.
2. Repository name: `atelier-auctions` (or any name).
3. Choose **Private** or **Public**.
4. **Do not** tick "Add a README", ".gitignore" or "license". The project already has them, and
   ticking them causes a merge conflict on first push.
5. Click **Create repository** and copy the URL, e.g.
   `https://github.com/<your-username>/atelier-auctions.git`.

**Option 2 — GitHub CLI**

```bash
gh auth login
gh repo create atelier-auctions --private --source=. --remote=origin --push
```

This creates the repo, adds the remote and pushes in one step. If you use it, skip A4.

### A4. Connect and push

```bash
git remote add origin https://github.com/<your-username>/atelier-auctions.git
git push -u origin main
```

Authentication: GitHub no longer accepts account passwords over HTTPS. When prompted, sign in through
the browser window that Git Credential Manager opens (default on Windows), or use a **Personal
Access Token** (GitHub → Settings → Developer settings → Personal access tokens) as the password.

Refresh the repository page on GitHub. You should see `server/`, `client/`, `docs/`, `README.md`,
`SETUP.md` and `docker-compose.yml`.

### A5. Day-to-day workflow afterwards

```bash
git checkout -b feature/my-change     # work on a branch
git add -A
git commit -m "Describe the change"
git push -u origin feature/my-change  # then open a Pull Request on GitHub
```

If you change `server/prisma/schema.prisma`, create a migration and commit it with the change:

```bash
npm run db:migrate                     # prompts for a migration name
git add server/prisma/migrations server/prisma/schema.prisma
```

---

# Part B — Set up the project from GitHub

### B1. Clone

```bash
git clone https://github.com/<your-username>/atelier-auctions.git
cd atelier-auctions
```

### B2. Install dependencies

One command installs both workspaces (`server` and `client`):

```bash
npm install
```

A `postinstall` hook then runs `prisma generate` to build the type-safe database client.

### B3. Configure environment variables

```bash
cp server/.env.example server/.env
```

(PowerShell: `Copy-Item server/.env.example server/.env`)

Open `server/.env` and set at least:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Leave the default if you use the Docker database: `postgresql://atelier:atelier@localhost:5432/atelier?schema=public` |
| `JWT_SECRET` | A long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLOUDINARY_*` | *(Optional)* Cloud name, API key and secret from https://console.cloudinary.com, needed for admin image uploads |

The client needs no `.env` for local development (Vite proxies `/api` and `/socket.io` to the
server). `client/.env.example` documents `VITE_API_URL` for deployments.

### B4. Start the database, migrate and seed

Make sure **Docker Desktop is running** (whale icon in the system tray), then:

```bash
npm run db:up                                 # starts PostgreSQL 16 in Docker on :5432
npm run db:deploy                             # applies committed migrations
npm run db:seed                               # demo users, artists, auctions, bids
```

> `migrate deploy` applies the migrations in the repo without prompting, which is the right command
> on a fresh clone. Use `npm run db:migrate` (`migrate dev`) only when you change the schema
> yourself.

### B5. Run

```bash
npm run dev
```

- Web app: **http://localhost:5173**
- API: http://localhost:4000/api/health

Log in with a seeded account:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@atelier.test` | `Admin@12345` |
| Bidder | `asha@atelier.test` (also `rohan@`, `clara@`, `omar@`) | `Bidder@123` |

Seeded auction times are relative to when you seed. To get live lots again later, re-run
`npm run db:seed`.

**Optional checks:**

```bash
npm run typecheck                    # both apps
npm run test:concurrency -w server   # race-condition test (server must be running)
cd server && npx prisma studio       # browse the database at http://localhost:5555
```

### B6. Without Docker

Use any PostgreSQL 14+ and put its connection string in `server/.env`:

```
# local install
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/atelier?schema=public
# hosted (Neon / Supabase / Railway) — usually needs SSL
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

Create the database if needed (`createdb atelier`), then run the migrate and seed commands from B4,
skipping `npm run db:up`.

### B7. Enable Cloudinary uploads (optional)

1. Create a free account at https://cloudinary.com and open the **Dashboard**.
2. Copy **Cloud name**, **API Key** and **API Secret** into `server/.env`.
3. Restart `npm run dev`. The admin console's **Upload** buttons become active.
4. Optional: copy the seed artworks into your Cloudinary account:
   ```bash
   # Git Bash / macOS / Linux
   SEED_UPLOAD_TO_CLOUDINARY=true npm run db:seed
   # PowerShell
   $env:SEED_UPLOAD_TO_CLOUDINARY="true"; npm run db:seed
   ```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `error during connect … dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it and wait until it says "Engine running". |
| `P1001: Can't reach database server` | Postgres isn't up yet (`docker ps` should list `atelier-postgres`), or `DATABASE_URL` is wrong. |
| `port 5432 is already allocated` | Another Postgres is running. Stop it, or change the left side of `"5432:5432"` in `docker-compose.yml` (e.g. `5433:5432`) and update `DATABASE_URL`. |
| Server exits with `JWT_SECRET must be at least 32 characters` | Set a longer secret in `server/.env`. |
| `EPERM … query_engine-windows.dll.node` during build | Windows locks Prisma's engine while `npm run dev` is running. Stop the dev server, then build. |
| Page loads but no data / proxy `ECONNREFUSED` | The API isn't on port 4000. Check the `server` log lines in the `npm run dev` output. |
| No live lots | Seed times are relative. Run `npm run db:seed` again. |
| Admin upload button says "No Cloudinary" | Add the `CLOUDINARY_*` variables and restart. |
| `git push` rejected (`fetch first`) | The GitHub repo was created with a README. Run `git pull --rebase origin main`, then push again. |

---

## Production deployment (summary)

1. **Database**: managed Postgres (Neon, Supabase, RDS). Run `npm run prisma:deploy -w server`.
2. **API**: any Node host (Render, Railway, Fly.io). Build command `npm install && npm run build -w server`.
   Start command `npm start`. Environment: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`,
   `CLIENT_ORIGIN=https://your-frontend`, `CLOUDINARY_*`. The host provides `PORT`.
3. **Client**: Vercel, Netlify or any static host. Build command `npm install && npm run build -w client`.
   Output `client/dist`. Set `VITE_API_URL=https://your-api` at build time, and add an SPA
   fallback rewrite of `/*` to `/index.html`.
4. With `NODE_ENV=production`, auth cookies are `Secure; SameSite=None`, so both sites must be served
   over HTTPS.
5. To run more than one API instance, add the Socket.io Redis adapter (see the walkthrough, §18).
