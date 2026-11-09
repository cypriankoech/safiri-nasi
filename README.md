# Safiri Nasi — Tour & Travel

Website and booking platform for Safiri Nasi Tour & Travel: tour catalogue, online booking with
deposits, M-Pesa / Airtel Money / card payments, invoices and vouchers, and an admin panel for
running the business.

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4 |
| **Backend** | FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL 16 |
| **Payments** | Safaricom Daraja (STK Push + Paybill C2B), Airtel Money Open API, DPO Pay (cards) |
| **Runs on** | Docker Compose — dev stack with hot reload, slim production images |

## Quick start (development)

Requires Docker with Compose v2.

```bash
cp backend/.env.example backend/.env          # defaults work out of the box (payments in mock mode)
docker compose up --build -d                  # db, mailpit, backend, frontend
docker compose exec backend python -m app.seed --reset   # sample tours, bookings and logins
```

| URL | What |
|---|---|
| http://localhost:3000 | Website |
| http://localhost:3000/admin | Admin panel |
| http://localhost:8000/api/docs | API reference (Swagger) |
| http://localhost:8025 | Mailpit: every email the site sends |

Seeded logins:

| Role | Email | Password |
|---|---|---|
| Admin | admin@safirinasitourstravel.co.ke | `SafiriAdmin#2026` |
| Staff | staff@safirinasitourstravel.co.ke | `SafiriStaff#2026` |
| Customer | traveller@example.com | `Traveller#2026` |

Code changes reload automatically (both apps are bind-mounted). Each container has CPU and memory
limits in `docker-compose.yml`; check usage with `docker stats`.

Useful commands:

```bash
docker compose logs -f backend frontend
docker compose exec backend alembic revision --autogenerate -m "describe change"   # new migration
docker compose exec backend alembic upgrade head
docker compose down            # stop (data is kept in the pgdata volume)
docker compose down -v         # stop and wipe the database
```

## Testing

```bash
docker compose exec backend pytest                 # 39 API tests (separate safiri_nasi_test DB)
docker compose exec backend ruff check app tests

cd frontend && npm ci && npm run typecheck && npm run lint
npx playwright test                                # browser tests against the running dev stack
```

The Playwright suite books a safari, pays the deposit by M-Pesa and the balance by card, takes a
phone booking in the admin panel and checks every admin page renders.

## Payments

`PAYMENTS_MODE` in `backend/.env` controls everything:

- **`mock`** (default) — no credentials needed. M-Pesa/Airtel prompts approve themselves after
  ~6 seconds (phone numbers ending in `000` are declined); cards go to a local test page.
- **`sandbox`** — provider test environments. Needs credentials and a public HTTPS URL for
  callbacks, e.g. `cloudflared tunnel --url http://localhost:8000`, then set `PUBLIC_API_URL`.
- **`live`** — production endpoints.

Every callback URL contains `CALLBACK_SECRET`, every payload is logged (`provider_callbacks`
table), and no payment is credited until the provider confirms it with a status query.

### Go-live checklist

**M-Pesa (Safaricom Daraja)**
1. Create an app on https://developer.safaricom.co.ke and test in sandbox (shortcode 174379).
2. Get a live Paybill or Till; set `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CONSUMER_KEY/SECRET`
   and `MPESA_TRANSACTION_TYPE` (`CustomerPayBillOnline` or `CustomerBuyGoodsOnline` + `MPESA_TILL_NUMBER`).
3. Complete go-live on the Daraja portal, then in **Admin → Payments → Provider setup** click
   *Register Paybill URLs* so payments made straight to the Paybill (account number = booking
   reference) are matched automatically. Unmatched ones appear in the *Unmatched Paybill* queue.
4. Optionally set `MPESA_ALLOWED_IPS` to Safaricom's callback IPs.

**Airtel Money**
1. Register on https://developers.airtel.africa and request Kenya collections.
2. Set `AIRTEL_CLIENT_ID/SECRET`; confirm the collection path Airtel assigns
   (`AIRTEL_COLLECTION_PATH`, v1 or v2) and set `AIRTEL_CALLBACK_SECRET` if you enable signed callbacks.
3. Give Airtel the callback URL shown under *Provider setup*.

**Cards (DPO Pay)**
1. Sign a merchant agreement with DPO (Network International).
2. Set `DPO_COMPANY_TOKEN` and `DPO_SERVICE_TYPE`; give DPO the push URL from *Provider setup*.

Also set in **Admin → Settings**: Paybill number shown to customers, bank details, WhatsApp
number, USD→KES rate and which payment methods are offered.

## Preview deployment (Vercel + Render)

For a free, shareable preview see **[docs/deploy-preview.md](docs/deploy-preview.md)**: the website on
Vercel, the API and database on Render via the included `render.yaml` blueprint.

## Production

```bash
cp backend/.env.example backend/.env.production     # real SECRET_KEY, CALLBACK_SECRET, SMTP, provider keys,
                                                    # FRONTEND_URL, PUBLIC_API_URL, COOKIE_SECURE=true
export POSTGRES_PASSWORD='a-long-random-password'
SITE_URL=https://safirinasitourstravel.co.ke API_PUBLIC_URL=https://api.safirinasitourstravel.co.ke \
  docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend python -m app.seed --no-demo   # first deploy only
```

- Containers run as non-root, restart automatically, and have health checks and resource limits.
  Ports are bound to `127.0.0.1`; put a TLS reverse proxy (Caddy, Nginx, Traefik) in front:
  the site → `:3000`, the API host (for payment callbacks) → `:8000`.
- The frontend is built without access to the API, so catalogue pages ship with placeholder data
  and refresh with real data on the first request (the health check makes that request right
  after start-up). After that, catalogue data is cached for about a minute and refreshed
  immediately when staff save changes in the admin panel.
- Back up the `pgdata` and `uploads` volumes.

## Project layout

```
backend/
  app/models/        SQLAlchemy models (tours, departures, bookings, payments, CRM, content)
  app/routers/       public, bookings, auth, provider callbacks, admin/*
  app/payments/      mpesa.py, airtel.py, dpo.py, mock.py, phone.py
  app/services/      pricing, booking lifecycle, payments, emails, PDFs, scheduled jobs
  app/templates/     email and PDF (invoice, receipt, voucher) templates
  alembic/           migrations
  tests/             pytest suite
frontend/
  src/app/(site)/    public website
  src/app/admin/     admin panel
  src/components/    UI kit, site, booking, tour and admin components
  public/media/      Safiri Nasi's own photos (WebP) and trip clips (MP4 + poster frames)
  e2e/               Playwright tests
docker/db-init/      creates the test database on first start
```

Stock destination photos come from Wikimedia Commons under Creative Commons licences; credits are
listed on the site at `/credits`.
