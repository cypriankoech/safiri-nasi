# Deploying a preview (Vercel + Render)

A free, shareable preview of the site while the real domain and payment accounts are pending.

| Part | Host | Preview address | Final address (later) |
|---|---|---|---|
| Website (Next.js) | Vercel | `https://safirinasitourstravel.vercel.app` | `https://safirinasitourstravel.co.ke` |
| API (FastAPI) + PostgreSQL | Render | `https://safirinasitourstravel-api.onrender.com` | `https://api.safirinasitourstravel.co.ke` |

Payments run in **mock mode** (simulated M-Pesa, Airtel Money and card) and emails are off, so
nothing real is charged or sent. The website talks to the API through its own `/api` path, so
logins work as normal first-party cookies.

> If Vercel or Render says a name is taken, use the address it gives you instead, and use that
> address wherever these steps mention it.

## 1. API and database on Render (about 10 minutes)

1. Sign in at https://render.com with your GitHub account and allow access to `cypriankoech/safiri-nasi`.
2. **New → Blueprint**, pick the `safiri-nasi` repo, branch `main`. Render reads `render.yaml` and
   proposes:
   - `safirinasitourstravel-api`: a Docker web service built from `backend/Dockerfile`
   - `safirinasitourstravel-db`: PostgreSQL 16
3. It asks for the three values it can't guess. Enter:

   | Key | Value |
   |---|---|
   | `FRONTEND_URL` | `https://safirinasitourstravel.vercel.app` |
   | `PUBLIC_API_URL` | `https://safirinasitourstravel-api.onrender.com` |
   | `CORS_ORIGINS` | `["https://safirinasitourstravel.vercel.app"]` |

4. **Apply**. The first build takes 5–10 minutes. When the service shows **Live**, open
   `https://safirinasitourstravel-api.onrender.com/api/health`: you should see `{"status":"ok",…}`.
   On first start the API creates the tables and loads the sample tours, destinations, reviews
   and demo bookings.
5. Get your admin password: service → **Environment** → reveal `SEED_ADMIN_PASSWORD`.
   Admin login: `admin@safirinasitourstravel.co.ke` + that password.

## 2. Website on Vercel (about 5 minutes)

1. Sign in at https://vercel.com with GitHub → **Add New… → Project** → import `cypriankoech/safiri-nasi`.
2. Configure:
   - **Project name:** `safirinasitourstravel`
   - **Root Directory:** `frontend` (click *Edit*)
   - Framework preset: Next.js (detected automatically). Leave the build settings as they are.
3. **Environment Variables** (add all three before deploying, because the API address is built in):

   | Name | Value |
   |---|---|
   | `API_URL_INTERNAL` | `https://safirinasitourstravel-api.onrender.com` |
   | `NEXT_PUBLIC_API_URL` | `https://safirinasitourstravel-api.onrender.com` |
   | `NEXT_PUBLIC_SITE_URL` | `https://safirinasitourstravel.vercel.app` |

4. **Deploy**. When it finishes, open `https://safirinasitourstravel.vercel.app`.

If you change an environment variable later, redeploy (**Deployments → ⋯ → Redeploy**) for it
to take effect.

## 3. Before showing the customer

- **Wake the API first.** Free Render services sleep after 15 minutes idle, and the first request
  then takes about a minute. Open the health URL above a couple of minutes before the demo, then
  load the site twice. To avoid this completely, switch the Render service to the *Starter* plan
  (about US$7/month), or point a free uptime monitor (e.g. UptimeRobot) at the health URL every
  10 minutes.
- **Share the production URL** (`…vercel.app`, from the `main` branch). Vercel's per-commit
  preview URLs ask visitors to log in to Vercel unless you turn off *Deployment Protection*.
- **Set the real contact details** in the admin panel → Settings (phone, WhatsApp, email,
  Paybill), so the customer sees their own details.
- Things to try in the demo:
  - book a tour, pay the deposit by "M-Pesa" (approves itself after about 6 seconds), then pay the
    balance by "card"
  - download the invoice and voucher
  - in `/admin`, walk through the dashboard, bookings, payments, tours editor and reports

## Good to know

- **Free database lifetime:** Render's free PostgreSQL expires after 30 days. Upgrade it, or move
  to a paid plan before real customers use the site.
- **Uploaded photos:** images uploaded in the admin panel are stored on the API container's disk,
  which resets on each redeploy. Fine for a preview; production needs a persistent disk or S3.
- **Updates:** every push to `main` redeploys both Vercel and Render automatically.
- **Reloading the sample data:** delete and recreate the database in Render, then redeploy the API.
  `SEED_ON_START` only loads data into an empty database.

## Moving to the real domain later

1. Buy `safirinasitourstravel.co.ke` (any KeNIC registrar).
2. Vercel → Project → **Domains** → add `safirinasitourstravel.co.ke` and `www.…`, then create the DNS
   records it shows.
3. Render → service → **Custom Domains** → add `api.safirinasitourstravel.co.ke`, then create its CNAME.
4. Update the environment variables (`FRONTEND_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS` on Render;
   the three on Vercel) to the new addresses, then redeploy both.
5. Before going live: set `PAYMENTS_MODE=live` plus provider keys, configure SMTP and set
   `SEND_EMAILS=true` (see the README's go-live checklist).
