# Setting up the new app

The new app lives in `web/` (the screens) and `supabase/` (the database). The original app in the repo root keeps running on Hostinger until the new one replaces it, so nothing changes for anyone until you switch over.

It takes about 20 minutes and has four parts:

1. Create the Supabase project.
2. Load the database.
3. Turn on logins.
4. Turn on automatic deploys to the new subdomain.

## 1. Create the Supabase project (about 5 minutes)

1. Sign up at **supabase.com** with the business email, then **New project**.
   - Name: `ats` (anything works).
   - Region: **East US (Ohio)**, the closest to northern Michigan.
   - Database password: generate one and save it in your password manager.
2. When it finishes, open **Project Settings → API** and copy two values:
   - **Project URL**, for example `https://abcd1234.supabase.co`
   - **anon public** key

   Both are safe to put inside the app. The database's security rules are what protect the data. **Never** use the `service_role` key in the app.

## 2. Load the database

Open **SQL Editor → New query** in Supabase. Paste and run each file in order:

1. `supabase/migrations/20261112000000_init.sql` (tables, roles, security rules)
2. `supabase/migrations/20261112000100_storage.sql` (private file storage)
3. `supabase/migrations/20261113000000_estimates.sql` (signatures, the signed-estimate lock, the customer link)
4. `supabase/migrations/20261114000000_invoices.sql` (invoices and payments)
5. `supabase/migrations/20261115000000_calendar.sql` (crew assignment on the calendar)

Already ran some? Just run the ones after the last you ran, in order.

Each should end with **Success. No rows returned**.

If you prefer the command line: `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

## 3. Turn on logins

In **Authentication → URL Configuration**:

- **Site URL**: where the app will live, for example `https://app.advanced-treeservice.com`.
- **Redirect URLs**: add the same address. While testing, also add `http://localhost:5173`.

In **Authentication → Providers → Email**, leave **Confirm email** on. It stops anyone from signing up with an email they don't own, which matters because invites are tied to email addresses.

Supabase's built-in email sender is limited to a few emails an hour. That's fine for a handful of people. Before inviting the whole team, add your own email service under **Project Settings → Auth → SMTP**; your email host's SMTP details work.

## 4. Automatic deploys (about 10 minutes, once)

GitHub builds the app for you. Every push to `main` runs all the tests. If they pass, it builds the app and publishes the finished files to a branch called `deploy`. The new subdomain on Hostinger pulls that branch. If any test fails, nothing is published, and the live app stays as it was.

**a. Give GitHub the two Supabase values.** In the repo on GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL, e.g. `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the **anon public** key (never the `service_role` key) |

**b. Run the first deploy.** Go to **Actions → Build and deploy → Run workflow** (on `main`). After a few minutes it shows a green check, and a `deploy` branch appears in the repo.

**c. Point a new subdomain at it.** In hPanel:
1. **Domains → Subdomains:** create `app.advanced-treeservice.com`.
2. **Security → SSL:** turn on SSL for it. Home-screen install, offline use and logins all need it.
3. **Advanced → Git** for the subdomain: repository `https://github.com/bkubont/canopy-estimate.git`, branch **`deploy`**, install path empty (the subdomain's folder must be empty first). If the repo is private, add the SSH key Hostinger shows under **GitHub → repo → Settings → Deploy keys** and use the SSH address `git@github.com:bkubont/canopy-estimate.git`.
4. Click **Deploy**. Then copy Hostinger's **auto-deployment webhook** URL into **GitHub → repo → Settings → Webhooks** (content type `application/json`, just the push event), so each new build goes live by itself.

Then open the address on your phone, **Create account**, and set up the company. You'll be the owner.

**Day to day:** merge to `main`, wait a few minutes, done. To roll back, open the `deploy` branch history on GitHub, and in hPanel deploy an earlier commit, or revert the change on `main`.

**Without GitHub (fallback):** on a computer with Node.js 20+, `cd web && cp .env.example .env` (paste the two values in), `npm install && npm run build`, then upload everything inside `web/dist` with File Manager.

## Inviting your team

Go to **More → Team → Invite someone**, enter their email and role, and send them the link (text or email). They open it, create an account **with that same email address**, and they're in.

| Role | Can do | Can't do |
|---|---|---|
| Owner | Everything | n/a |
| Office | Estimates, invoices, payments, calendar | Company settings, team |
| Crew | Calendar, jobs, notes, mark work done | See any prices, create estimates |

The database enforces these rules, so they hold even if someone pokes at the app.

## Testing

```bash
# Database security rules (needs Postgres 15+ installed locally)
supabase/tests/run-local.sh

# App logic: sync engine and server connection
cd web && npm test

# Two people on two devices, through the real screens.
# Needs Playwright installed: npm i -D playwright && npx playwright install chromium
cd web && npm run dev                        # in one terminal, with .env pointing at your project
APP_URL=http://localhost:5173/ node e2e/two-devices.mjs     # team + sync
APP_URL=http://localhost:5173/ node e2e/estimate-flow.mjs   # estimate, customer signs by link, change order, crew view
APP_URL=http://localhost:5173/ node e2e/invoice-flow.mjs    # deposit, invoice, customer link, final payment, crew can't see
APP_URL=http://localhost:5173/ node e2e/calendar-flow.mjs   # schedule from board/estimate, crew calendar, iPad week
```

The two-device test creates two throwaway accounts. Against a real project, confirmation emails are needed, so run it against a **separate test project**, or with **Confirm email** off on that test project only.

## How the data stays safe

- Everything you enter is saved on the device first, then uploaded. The badge at the top right shows **Synced**, **N waiting** or **Offline**.
- With no signal, keep working. Changes upload when the connection comes back.
- Rows are never erased, only marked deleted, so a sync can't wipe anything.
- Signing out uploads first, and warns you if anything couldn't be sent.
- Supabase backs up the database daily (7 days on the free plan, 14+ on Pro).

## The old app

The original app at the repo root keeps running at its current address and is untouched by these deploys. Once the team is on the new one, we can retire it.
