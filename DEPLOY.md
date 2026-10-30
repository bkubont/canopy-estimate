# Deploying to Hostinger

The app is plain static files, so any Hostinger web hosting plan works. No Node.js or database is needed.

## 1. Pick where it lives

### Starting on a temporary domain (current plan)

When you add a website in hPanel without connecting a domain, Hostinger gives it a free temporary address. It looks something like `something-12345.hostingersite.com`, and it already has SSL. Use that address to try the app before pointing advanced-treeservice.com at it. The app uses relative paths, so the files don't need any change when the domain changes.

**Before you switch to the real domain:** estimates are stored per web address. Anything saved on phones while using the temporary address won't appear automatically once you move to advanced-treeservice.com. Before switching, on each device:
1. Open **Saved → Export all** on the temporary address.
2. Open the app on the new address and use **Saved → Import JSON**.
3. Delete the old home-screen icon and install it again from the new address.

### Final address

Either:
- **A subdomain** such as `estimates.advanced-treeservice.com` (recommended, so it stays separate from your main website). In hPanel, go to **Domains → Subdomains** and create it. Hostinger gives it its own folder, e.g. `public_html/estimates`.
- **The main domain**, which uses `public_html` itself. Only do this if this app *is* the whole site; otherwise it would replace your existing website.

## 2. Turn on SSL (required)

Installing to the home screen and working offline only work over `https://`. In hPanel, open **Security → SSL** and install the free SSL certificate for the domain or subdomain. Temporary Hostinger domains normally come with SSL already. The included `.htaccess` then redirects all `http://` traffic to `https://`.

## 3. Upload the files

### Option A: Git deploy (recommended, updates in one click)

1. In hPanel, open **Advanced → Git** for the website.
2. Repository: `https://github.com/bkubont/canopy-estimate.git`, branch `main`.
3. Install path: the folder from step 1. Leave it blank for `public_html`; the folder must be empty.
4. If the GitHub repo is private, Hostinger shows an SSH key. Add it to GitHub under **repo → Settings → Deploy keys**, and use the SSH URL `git@github.com:bkubont/canopy-estimate.git` instead.
5. Click **Deploy**. Optionally, copy Hostinger's auto-deployment webhook URL into GitHub under **repo → Settings → Webhooks** so every push to `main` goes live automatically.

### Option B: File Manager upload

1. On GitHub, use **Code → Download ZIP**.
2. In hPanel, open **Files → File Manager**, go to the folder from step 1, upload the ZIP, and extract it.
3. Move the files so `index.html` sits directly in that folder, not in a subfolder.
4. Make sure `.htaccess` came across. It's a hidden file, so turn on "show hidden files" if you don't see it.

Hostinger may rename menu items over time. If something isn't where this guide says, search hPanel for "Git", "SSL", or "Subdomains".

## 4. Install on phones and tablets

- **iPhone/iPad (Safari):** open the site, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the site, tap **Install app** in the toolbar or **⋮ → Install app**.

After loading once, it opens full screen from the home screen icon and works with no signal.

## Updating

After changing any files, open `sw.js` and bump `VERSION` (e.g. `'v1'` → `'v2'`). Then redeploy. Devices pick up the new version the next time they open the app with a connection.

## Rebranding

- `brand.js`: app name, colors, and the company details that appear on every estimate
- `brand/logo.svg`: logo (a PNG also works; update the paths in `brand.js`, `index.html`, and `sw.js`)
- `brand/icon-*.png`, `brand/apple-touch-icon.png`: home-screen icons
- `manifest.webmanifest`: app name and colors used when it's installed

## Data

Estimates are saved on each device (in the browser), not on the server. Hosting doesn't change that. Use **Saved → Export all** to back up or move estimates between devices.
