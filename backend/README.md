# Portfolio backend

Express + PostgreSQL + Prisma. Serves the admin API (auth-gated CRUD for every
piece of content that used to live in `localStorage`), a public read endpoint
the frontend hydrates from, and a contact-form submission endpoint.

## What's in here

```
backend/
├── prisma/
│   ├── schema.prisma      Data model — mirrors the frontend admin shape 1:1
│   └── seed.ts            Bootstrap: creates first admin + inserts defaults
└── src/
    ├── index.ts           Express bootstrap (helmet, cors, morgan, mounts routes)
    ├── env.ts             Zod-validated env vars — fails loudly on boot
    ├── db.ts              Prisma singleton (survives tsx-watch reloads)
    ├── errors.ts          HttpError + centralised error handler
    ├── auth/
    │   ├── jwt.ts         sign/verify HS256
    │   ├── middleware.ts  requireAuth / requireRole
    │   └── routes.ts      /login, /me, /password (rate-limited)
    ├── admin/*.ts         CRUD per resource — all mounted behind requireAuth
    └── public/
        ├── portfolio.ts   GET /api/portfolio — one call, everything the site needs
        └── contact.ts     POST /api/messages — with honeypot + rate limit
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness probe. |
| GET | `/api/portfolio` | — | Bulk read for the public site. Cached 60s. |
| POST | `/api/messages` | — | Contact form submit (5/hour/IP, honeypot). |
| POST | `/api/auth/login` | — | `{email, password}` → `{token, user}`. 10/15min/IP. |
| GET | `/api/auth/me` | Bearer | Return the current user. |
| POST | `/api/auth/password` | Bearer | Change password (requires current). |
| GET/POST/PUT/DELETE | `/api/admin/projects[/:id]` | Bearer | Project CRUD. |
| GET/PUT | `/api/admin/hero` | Bearer | Hero singleton. |
| GET/PUT | `/api/admin/social` | Bearer | Social links singleton. |
| GET/POST/PUT/DELETE | `/api/admin/about[/:id]` | Bearer | About cards. |
| GET/POST/PUT/DELETE | `/api/admin/education[/:id]` | Bearer | Education. |
| GET/POST/PUT/DELETE | `/api/admin/experience[/:id]` | Bearer | Experience. |
| GET/POST/PUT/DELETE | `/api/admin/skills[/:id]` | Bearer | Skill categories. |
| GET/POST/PUT/DELETE | `/api/admin/certificates[/:id]` | Bearer | Certificates. |
| GET/PUT/DELETE | `/api/admin/messages[/:id]` | Bearer | Read / mark-read / delete inbox. |

Error responses are always `{ error: string, ... }`. Validation errors add
`{ issues: [{path, message}] }` so the client can highlight individual fields.

## Local development

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL (point at a local Postgres) and JWT_SECRET.
# Set ADMIN_EMAIL / ADMIN_PASSWORD if you want the seed to bootstrap you.

npm install
npx prisma migrate dev --name init   # First time only: creates the schema
npm run seed                          # Idempotent — safe to re-run.
npm run dev                           # http://localhost:4000
```

## Deploy on Render (Blueprint)

Everything is described in `render.yaml`. First-time flow:

1. Push this branch to GitHub (already done if you're reading this on Render).
2. In the Render dashboard: **New → Blueprint**, select the repo, point it at
   `backend/render.yaml`. Render provisions the free Postgres and the web
   service in one go.
3. In the web service's **Environment** tab, fill in the three secrets
   Render can't guess:
   - `FRONTEND_ORIGIN` — comma-separated list, e.g.
     `https://my-portfolio-three-tau-68.vercel.app,http://localhost:8080`
   - `ADMIN_EMAIL` — your login email
   - `ADMIN_PASSWORD` — a strong bootstrap password (change it after first
     login via `POST /api/auth/password`, then you can delete this env var)
4. Trigger a deploy. Watch the logs — the build runs `prisma migrate deploy`
   automatically. Once it's up, hit the service in a shell to seed defaults:

   ```
   # From the Render dashboard → Shell tab on the web service
   npm run seed
   ```

5. Point the frontend at the service URL. In your Vercel project, set
   `VITE_API_BASE_URL=https://portfolio-backend.onrender.com` (or whatever
   Render gives you), then swap the client-side data layer over to it — that
   step lives in the frontend, not here.

Render's free plan puts idle services to sleep, so the first request after a
few minutes of quiet may take up to a minute to answer. Paid plans (or an
external ping) get rid of that.
