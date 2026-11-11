# Canopy Estimate

A simple, offline-friendly estimate, calendar, and jobs app for arborists and tree-care companies (tuned for northern Michigan work). Light workspace UI with a desktop sidebar and mobile bottom nav, field estimates with on-screen signatures, an interactive calendar, and a Jobs list/Kanban for approved work.

## Use it

Open `index.html` in any modern browser; there's no build step. Hosted over HTTPS, it becomes an installable app with a home-screen icon that works offline. See [DEPLOY.md](DEPLOY.md) for Hostinger setup, and `brand.js` to rebrand it.

## How it works

Pricing is **days × day rate** plus equipment rentals. Wood & debris choices are operational only (not priced). Tree size is trunk diameter (DBH).

1. **Company profile:** company name, license, address, phone, email, logo, day rate (default $2,000), tax, deposit, validity period, and your contractor signature. Incomplete setup shows a banner with a Finish company profile action but does **not** block Calendar, Estimates, or Jobs. Name and phone are required to save. After setup, the app lands on **Calendar**.
2. **New estimate**, with big Back / Next buttons. On a phone it’s one section per screen; on a tablet related sections are combined:
   - **Client** *(tablet: Job = Client + Site):* first/last name, company, state (MI) + ZIP, contacts / `.vcf` / past client, plus **Town** for the schedule
   - **Trees:** northern MI species in hardwood/softwood groups, work, DBH size, condition
   - **Site:** site conditions, **Parking**, **Wood & debris** (leave all / leave wood / haul all / cut and stack / hide it), notes
   - **Job days** *(tablet: Pricing):* ½ / 1 / 1½ / 2… days × day rate, optional start date
   - **Equipment:** Smith Equipment day-rate defaults; rental days auto-match job days until edited
   - **Summary** *(tablet: Review):* labor, equipment, tax, **Other costs**, total, terms, **Mark approved**
   - **Sign:** client signature sets status to Approved and opens the full PDF view; contractor sig from profile
   - **Approved:** full estimate PDF with branding; **Add** opens a signed change order (extra days, reason, optional trees) appended to the PDF
   - **Send** (drafts): print/PDF, share, text, email; Mark approved for verbal / email approvals
3. **Estimates list** (☰): search, reopen, status badges (Draft / Approved / Scheduled / In Progress / Blocked / Done).
4. **Calendar** (landing / ☰): Month, Week, Day, and Agenda views (phone defaults to Agenda). Create and edit events (estimate visit, tree work, rentals, etc.) in America/Detroit time. Filters by type, crew, and status; overlap warnings for shared crew/equipment; tree work on an unapproved estimate requires an override. Estimates that already have work dates can seed calendar events once.
5. **Jobs board** (☰): List or Kanban of the estimate pipeline — client name, phone, town, days, equipment. Pick a work date → **Scheduled**. Move to In Progress, Blocked (with reason chips), or Done.

Pick lists live at the top of `app.js`.

## Where data lives

Everything is stored in the browser's `localStorage` on this device only — there is no cloud sync. Use **Back up data** regularly (profile, estimates, and calendar events when present). Restore can merge or replace; replace snapshots current data on the device first. Legacy estimates migrate automatically (status from signature, ignore old crew, map old height sizes when possible, split town from City/State/ZIP).

## Files

- `index.html`: the app shell
- `styles.css`: screen and print styles
- `app.js`: form, calendar/events, jobs/kanban, saving, signatures, printing
- `brand.js`, `brand/`, `manifest.webmanifest`: branding and app icons
- `sw.js`: offline support (bump `VERSION` when deploying)
- `.htaccess`: Hostinger settings (HTTPS redirect, caching)
