# Demo / playground seed

Safe reload for the ATS company on Supabase. Does **not** delete auth users, orgs, or membership.

## Order (SQL Editor)

1. **Confirm org** — first query inside `clear-org-ops.sql` (expect one live company).
2. `clear-org-ops.sql` — soft-clears customers, jobs, CRM children, smart_lists, calendar, invoices/payments, photos, expenses, hours. Keeps org / members / tag taxonomy.
3. `demo-data.sql` — 12 contacts, 12 jobs, calendar, invoices (ids `de0de000-…`).
4. `demo-crm.sql` — +6 customers, properties / phones / emails, stage+tag variety, activities, 3 more jobs, smart lists.

Optional: `remove-demo-data.sql` soft-removes only `de0de000-…` rows (not other org data). Prefer `clear-org-ops.sql` for a full playground wipe.

## After seeding

On the phone/PWA: hard refresh, or clear site data / IndexedDB for `app.advanced-treeservice.com`, then open the app so sync pulls the new rows.
