# Safiri Nasi — Tour & Travel

Website and booking platform for Safiri Nasi Tour & Travel: tour catalogue, online booking with
deposits, M-Pesa / Airtel Money / card payments, invoices and vouchers, and an admin panel for
running the business.

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4 |
| **Backend** | FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL 16 |
| **Payments** | Paystack (M-Pesa, Airtel Money, cards) with an automatic revenue split; direct Daraja / Airtel / DPO integrations kept as an alternative |
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

Online payments go through **Paystack** (`PAYMENT_GATEWAY=paystack`): M-Pesa and Airtel Money
send a PIN prompt to the customer's phone, and cards use Paystack's hosted checkout.

**Revenue split.** Safiri Nasi owns the Paystack account. Astralyn is a Paystack *subaccount*
and receives `PAYSTACK_PLATFORM_PERCENT` (5%) of every online payment, settled by Paystack
directly. Paystack's fee is charged to Safiri Nasi. The percentage and subaccount are server
settings, shown read-only in **Admin → Payments → Provider setup**. Every payment records the
Paystack fee and Astralyn's share; **Reports** and the payments CSV show gross, fees, partner
share and net. Paybill and bank transfers bypass Paystack (and the split), so they're off by
default (**Admin → Settings**); staff can still record exceptional cash/bank payments.

`PAYMENTS_MODE` in `backend/.env`:

- **`mock`** (default): no credentials needed. Mobile money prompts approve themselves after
  ~6 seconds (numbers ending in `000` are declined); cards go to a local test page. The 5% share
  is still calculated and recorded so reports show the split.
- **`sandbox`**: Paystack test keys (`sk_test_…`).
- **`live`**: live keys (`sk_live_…`).

Paystack webhooks are verified with the `x-paystack-signature` HMAC, every payload is logged
(`provider_callbacks` table), and no payment is credited until Paystack's verify endpoint
confirms the amount and currency.

### Go-live checklist (Paystack)

1. Safiri Nasi signs up at https://paystack.com (Kenya), completes business verification and
   adds its settlement bank or M-Pesa details.
2. In Paystack → **Subaccounts**, create a subaccount for Astralyn with Astralyn's settlement
   details. Copy its code (`ACCT_…`).
3. Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLATFORM_SUBACCOUNT` and `PAYSTACK_PLATFORM_PERCENT` on
   the API, set `PAYMENTS_MODE=sandbox`, and test an M-Pesa, Airtel Money and card payment
   with Paystack's test details. Confirm the split in Paystack's transaction view.
4. In Paystack → Settings → **API Keys & Webhooks**, set the webhook URL to
   `https://<api-host>/api/callbacks/paystack` (shown under *Provider setup*).
5. Switch to live keys and `PAYMENTS_MODE=live`.

The direct integrations (Safaricom Daraja STK Push + Paybill matching, Airtel Open API, DPO Pay)
are still in `backend/app/payments/` and can be switched on with `PAYMENT_GATEWAY=direct`
(see `.env.example`), but payments made that way are not split automatically.

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
