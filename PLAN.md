# Canopy Estimate: Rebuild Plan

Status: **Phases 1 and 2 built** (2026-11-12). Not yet run against a live Supabase project (see SETUP.md).

## Decisions so far

| Question | Answer | What it means for the build |
|---|---|---|
| Who uses it | Whole team, eventually | Company account, individual logins, roles |
| Payments | Card payments on invoices | Stripe, a customer-facing invoice page, a small server piece |
| Distribution | Home-screen install is fine | Stay an installable web app (PWA); no App Store work now |
| Existing data | None to keep | Start with a clean data model; drop all the legacy-migration code |
| Equipment pricing on PDF | Hide markup, per-line prices OK | Lines show the marked-up price; cost and markup stay internal |
| Crew sees prices | No | Prices live in a separate table only owner/office can read |
| Deposit by card at signing | Yes | Customer signing link offers "Pay deposit" (Phase 2/3) |
| Card fees | Absorb | No surcharge logic or disclosures needed |
| Invoicing | One invoice per job, at completion | No progress billing |
| Stripe account | None yet | Owner creates one in the business name before Phase 3 (verification takes a few days) |
| Web address | Real subdomain | e.g. `app.advanced-treeservice.com` before customer links go out |

## Architecture

**Recommendation: rebuild the app on a proper foundation and port the good parts over.** With no data to migrate and a much bigger scope (team, sync, invoices, payments), patching the current single 4,000-line file would cost more than it saves.

- **Front end:** React + TypeScript, built with Vite. It still deploys as plain static files to Hostinger.
- **Back end:** Supabase, which provides:
  - Postgres database
  - Login by email magic link or password
  - File storage (signatures, logos, PDFs)
  - Row-level security, so each company only ever sees its own data
  - Edge Functions for the Stripe pieces
- **Offline:** Each device keeps a local copy in IndexedDB. Changes are saved locally first, then synced through an outbox queue when there's signal, so the app keeps working at a job site with no service.
- **Payments:** Stripe Checkout. An Edge Function creates the payment, and a Stripe webhook marks the invoice paid. Card data never touches our app.
- **Ported from today's app, not rewritten from scratch:** pick lists (species, work, sizes, and the rest), pricing math, the PDF layout and styling, branding, signature pad.

### Sync rules (team-safe)
- **Estimate numbers:** each device reserves a block of numbers from the server while online (for example E-1040 to E-1059). Numbers never collide, and estimates can still be numbered offline.
- **Edit conflicts:** last write wins per record, and the app shows who changed it last. Signed documents are locked, which removes most conflict risk.
- **Deletes:** soft deletes (archived, not erased), so a sync can never wipe data.

### Approximate running costs
- Supabase: free tier to start, about $25/month once the team is on it
- Stripe: about 2.9% + 30¢ per card payment; no monthly fee
- Hostinger: unchanged

## Data model

```
organizations     company profile, day rate, tax, terms, logo, Stripe account
members           user ↔ org, role: owner | office | crew
customers         contact library (shared by the team)
jobs              one record per job; it moves through stages
  stage           estimate → work_order → invoice → paid (or archived)
  estimate        trees, site, equipment, days, terms, client signature (locked when signed)
  change_orders   signed add-ons
  internal_notes  NEVER printed or sent (job-level and per-tree)
  client_notes    printed on the PDF
invoices          number, issue/due date, line items, tax, deposit applied, balance, status
payments          card (Stripe) / cash / check, amount, date, who recorded it
events            calendar: bids, tree-work days, tasks; the ONLY place dates live
attachments       signatures, photos, PDFs (Storage)
activity_log      who did what, when
```

### Roles (confirmed)
- **Owner:** everything, including company settings, Stripe and the team.
- **Office:** estimates, invoices, payments, calendar.
- **Crew:** calendar, assigned jobs, internal notes, and marking work done. They see the work but **not the prices** (enforced by the database, not just hidden on screen).

## Phases

### Phase 1: Foundation
- Set up the new project: Vite, React, TypeScript, Supabase and the deploy to Hostinger
- Login, company setup and invite teammates
- Data model, row-level security, offline cache and sync
- Port the shell: navigation, branding and the company profile

**Done when:** two people on two devices log in, see the same data, and work offline.

**Status: built and tested.** Not yet tried against a live Supabase project (needs your account; see SETUP.md).
- Database: 36 security and sync checks pass against Postgres 16 (`supabase/tests/run-local.sh`)
- App: 19 unit tests for the sync engine and server connection (`npm test`)
- End to end: 22 two-device checks pass through the real screens against a stand-in backend (`web/e2e/two-devices.mjs`)

### Phase 2: Estimate wizard
Port the wizard, plus these fixes:
- **Internal notes:** at job level and per tree, clearly labelled "Internal, never printed"
- **PDF pricing:** equipment lines show the marked-up price; no cost or markup rows anywhere customer-facing
- **PDF layout:** fix the pricing box spilling off the page
- **Fewer phone screens:** 8 → 5 (Client & Site · Trees · Pricing · Review & Sign · Send)
- **One "Choose client" button** that searches the contact library, past customers and the phone's contacts
- **Tree sheet:** most-used species first, "More…" for the rest
- **Profile banner:** goes on Home only, not inside the wizard
- **Tablet:** fix the Back/Next bar overlapping the sidebar
- **Real PDF file** to attach or share, not only the print dialog
- **Customer link:** view and **sign online** when the customer isn't on site

**Status: built and tested.**
- Internal notes on the job and every tree, styled differently, never on the PDF, print, texts or the customer link (enforced by the document component and by the server for the link)
- Equipment lines show the marked-up price; the owner/office see their cost and what the markup earns, privately
- 5 steps; one "Choose client" (contacts, past estimates, phone contacts / .vcf); typed-in clients are added to Contacts
- Signing locks the estimate and records the agreed prices; older copies on other devices can't undo a signature; "Remove signature" is an explicit owner/office action
- Customer link: view, sign, download PDF; crew can't open or create links
- Change orders with signature; crew get a no-price job sheet with every internal note
- Estimate numbers reserved in blocks so devices never collide, even offline
- Tests: 63 database checks, 38 unit tests, 32-step estimate walkthrough (phone, customer phone, tablet, desktop)
- Deposit **payment** by card at signing comes with Stripe in Phase 3 (the deposit amount already shows on the estimate and link)

### Phase 3: Work orders, invoices, payments
- **Convert to work order:** a crew-facing document with internal notes, trees, equipment, site and parking, and no prices.
- **Convert to invoice:**
  - Adds an invoice number and due date
  - Brings forward actual days worked, change orders and other costs
  - Applies any deposit paid
  - The original signed estimate stays unchanged
- **Customer invoice link** with a **Pay by card** button (Stripe); paid status updates automatically.
- **Record cash or check** payments by hand; partial payments supported.
- **Invoice list** with Unpaid / Overdue / Paid filters.
- **Optional:** take the deposit by card at signing.

### Phase 4: Calendar and Jobs board
- The calendar is the single source of dates; the Jobs board reads from it, so the two can't disagree again.
- Scheduling a job on either screen creates the same calendar entry.
- Week view fits iPad landscape (scrolls instead of cutting off).
- Assign a job to a crew; crew members see "My jobs this week."
- The Kanban stages follow the job stage (approved → scheduled → in progress → done → invoiced → paid).

### Phase 5: Later
- App Store and Play Store builds (Capacitor wraps the same code)
- Photos on trees and jobs
- QuickBooks export
- Reports: revenue, equipment spend, and markup earned

## Open questions
None right now. All six were answered on 2026-11-12 (see Decisions).
