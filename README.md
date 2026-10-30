# Canopy Estimate

A simple, offline-friendly estimate form for arborists and tree-care companies. Fill it out on site from a phone or tablet, get the client's signature on screen, and print or save a clean PDF.

## Use it

Open `index.html` in any modern browser. There's nothing to install and no build step. To use it on a phone, host the folder anywhere that serves static files (GitHub Pages, Netlify, or similar), then add it to your home screen.

## Features

- **Company letterhead**: name, logo, contact info, license and insurance numbers, plus default tax, deposit, terms, and validity period (**Company** button)
- **Client and job site**: billing address with a "same as billing" shortcut, and access notes (gate codes, dogs, access width)
- **Site conditions**: power lines, near structure, crane, bucket truck, climb-only, permit, 811 locate, HOA
- **Line items**: service type (removal, pruning types, cabling, stump grinding, PHC, and more), species with autocomplete, DBH, height, description, quantity, and unit price
- **Cleanup options**: wood, brush and chips, stumps, raking
- **Totals**: subtotal, discount (% or $), tax, total, deposit, and balance due
- **Client signature**: sign with a finger or mouse; the signing date fills in automatically
- **Saved estimates**: search, open, copy as a new estimate, or delete. Estimate numbers count up automatically.
- **Autosave**: the current estimate survives closing the tab
- **Print / PDF**: a clean printable layout with no buttons and no empty input boxes. Choose "Save as PDF" in the print dialog to email it.
- **Backup**: export or import every estimate as a JSON file

## Where data lives

Everything is stored in your browser's `localStorage` on the device you're using. Nothing is sent anywhere. Use **Saved → Export all** regularly to back up, or to move estimates to another device.

## Files

- `index.html`: the form layout
- `styles.css`: the screen and print styles
- `app.js`: calculations, saving, signature pad, and printing
