# Setting up the new app (Phase 1)

The new app lives in `web/` (the screens) and `supabase/` (the database). The original app in the repo root keeps running on Hostinger until the new one replaces it, so nothing changes for anyone until you switch over.

It takes about 20 minutes and has four parts:

1. Create the Supabase project.
2. Load the database.
3. Turn on logins.
4. Build the app and upload it.

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

Already ran some? Just run the ones after the last you ran, in order.

Each should end with **Success. No rows returned**.

If you prefer the command line: `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

## 3. Turn on logins

In **Authentication → URL Configuration**:

- **Site URL**: where the app will live, for example `https://app.advanced-treeservice.com`.
- **Redirect URLs**: add the same address. While testing, also add `http://localhost:5173`.

In **Authentication → Providers → Email**, leave **Confirm email** on. It stops anyone from signing up with an email they don't own, which matters because invites are tied to email addresses.

Supabase's built-in email sender is limited to a few emails an hour. That's fine for a handful of people. Before inviting the whole team, add your own email service under **Project Settings → Auth → SMTP**; your email host's SMTP details work.

## 4. Build and upload

On your computer (needs Node.js 20 or newer):

```bash
cd web
cp .env.example .env          # then paste the Project URL and anon key into .env
npm install
npm run build                 # creates web/dist
```

Upload **everything inside `web/dist`** to the new subdomain's folder on Hostinger:

1. In hPanel, go to **Domains → Subdomains** and create `app.advanced-treeservice.com`.
2. Go to **Security → SSL** and turn on SSL for it. It's required for home-screen install and offline use.
3. In **File Manager**, upload the contents of `web/dist` into that subdomain's folder.

Then open the address on your phone, **Create account**, and set up the company. You'll be the owner.

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
```

The two-device test creates two throwaway accounts. Against a real project, confirmation emails are needed, so run it against a **separate test project**, or with **Confirm email** off on that test project only.

## How the data stays safe

- Everything you enter is saved on the device first, then uploaded. The badge at the top right shows **Synced**, **N waiting** or **Offline**.
- With no signal, keep working. Changes upload when the connection comes back.
- Rows are never erased, only marked deleted, so a sync can't wipe anything.
- Signing out uploads first, and warns you if anything couldn't be sent.
- Supabase backs up the database daily (7 days on the free plan, 14+ on Pro).

## Moving the app to Hostinger Git deploys (later)

The current Git deploy publishes the repo root (the old app). When we switch over, we'll add a small build step so pushes to `main` publish `web/dist` instead. That happens at cut-over, not now.
