# Canopy Estimate

A simple, offline-friendly estimate form for arborists and tree-care companies. Fill it out on site from a phone or tablet, get the client's signature on screen, and print or save a clean PDF.

## Use it

Open `index.html` in any modern browser; there's no build step. Hosted over HTTPS, it becomes an installable app with a home-screen icon that works offline. See [DEPLOY.md](DEPLOY.md) for Hostinger setup, and `brand.js` to rebrand it.

## How it works

1. **Company profile (first launch only):** company name, logo, phone, estimator and ISA number, license, tax, deposit, terms. It prints on every estimate automatically and can be changed later from the menu.
2. **New estimate**, one section per screen with big Back / Next buttons:
   - **Customer:** import from phone contacts (Android), a contact card file (iPhone), or a past customer
   - **Site:** same-as-customer toggle, plus tap-to-select site conditions and access
   - **Work:** add trees or work items. For each one you tap the service, its work details, species, location, trunk diameter and height, then enter quantity and price.
   - **Cleanup:** wood, brush, stumps and extras
   - **Price:** tap-to-select discount and deposit, tax, and live totals
   - **Notes:** tap-to-add common notes, free text, and terms
   - **Sign:** the customer signs on screen; the name and date fill in automatically
   - **Send:** print or save as PDF, share, text, or email a summary, with a preview of the finished estimate
3. **Estimates list:** search, reopen, duplicate or delete. Everything saves automatically.

Pick lists (services and their details, species, conditions and so on) are at the top of `app.js`, so they're easy to edit.

## Where data lives

Everything is stored in your browser's `localStorage` on the device you're using. Nothing is sent anywhere. Use **Saved → Export all** regularly to back up, or to move estimates to another device.

## Files

- `index.html`: the form layout
- `styles.css`: the screen and print styles
- `app.js`: calculations, saving, signature pad, and printing
- `brand.js`, `brand/`, `manifest.webmanifest`: branding and app icons
- `sw.js`: offline support
- `.htaccess`: Hostinger settings (HTTPS redirect, caching)
