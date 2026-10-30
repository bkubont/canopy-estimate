# Canopy Estimate

A simple, offline-friendly estimate form for arborists and tree-care companies. Fill it out on site from a phone or tablet, get the client's signature on screen, and print or save a clean PDF.

## Use it

Open `index.html` in any modern browser; there's no build step. Hosted over HTTPS, it becomes an installable app with a home-screen icon that works offline. See [DEPLOY.md](DEPLOY.md) for Hostinger setup, and `brand.js` to rebrand it.

## How it works

The app follows the paper Tree Service Estimate Form, with tap-to-select choices wherever possible.

1. **Company profile (first launch only):** company name, license number, address, phone, email, logo, default labor rate, tax, deposit, validity period, and your contractor signature. It fills every estimate automatically and can be changed later from the ☰ menu.
2. **New estimate**, one section per screen with big Back / Next buttons:
   - **Client:** import from phone contacts (Android), a contact card file (iPhone), or a past client
   - **Service:** type of service, location of trees, large / medium / small tree counts (total adds up automatically), condition of trees
   - **Site:** site conditions, additional services, start date (quick "next week" buttons) and job length
   - **Materials:** tap common equipment and materials to add them. Each price is remembered for next time.
   - **Labor:** hour buttons plus your default hourly rate, with as many labor lines as needed
   - **Summary:** subtotal, tax, additional costs, total, validity period and deposit
   - **Sign:** the client signs on screen; your saved contractor signature is added automatically
   - **Send:** print or save as PDF, share, text, or email a summary, with a preview of the finished form
3. **Estimates list:** search, reopen, duplicate or delete. Everything saves automatically.

Pick lists are at the top of `app.js`, so they're easy to edit.

## Where data lives

Everything is stored in your browser's `localStorage` on the device you're using. Nothing is sent anywhere. Use **Saved → Export all** regularly to back up, or to move estimates to another device.

## Files

- `index.html`: the form layout
- `styles.css`: the screen and print styles
- `app.js`: calculations, saving, signature pad, and printing
- `brand.js`, `brand/`, `manifest.webmanifest`: branding and app icons
- `sw.js`: offline support
- `.htaccess`: Hostinger settings (HTTPS redirect, caching)
