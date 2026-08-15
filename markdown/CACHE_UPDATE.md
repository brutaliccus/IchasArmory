# Cache Update Instructions

This project uses a Service Worker for caching. Instead of updating version numbers on individual modules, you only need to update the cache version in one place.

## How to Force a Cache Update

When you make changes to any JavaScript, CSS, or HTML files, update the cache version:

1. Open `public/sw.js` (copied to `dist/sw.js` by Vite)
2. Change the `CACHE_VERSION` constant at the top:
   ```javascript
   const CACHE_VERSION = 'v2';  // Increment this (v1 -> v2 -> v3, etc.)
   ```
3. Save the file
4. Deploy to your server

The service worker will automatically:
- Clear old caches
- Re-cache the HTML shell with the new version
- Update users' browsers on next visit

## What Gets Cached

The service worker caches:
- HTML shell (`index.html`, `/`) — network-first, offline fallback only
- Other static assets (images, fonts, etc.) — cache-first

It does **not** cache:
- Vite hashed bundles under `/_app/` (immutable HTTP cache)
- `/modules/` (dev) or `.js` / `.css` paths (handled by Vite/CDN headers)
- **Auth and API routes:** `/auth/*`, `/user`, `/profiles*`, `/inbox*`, `/share`, `/api/*`, `/builds*`, `/bug-report*`

Bumping `CACHE_VERSION` does **not** log users out of Discord auth. Sessions live in the `ichacalc.sid` cookie and on-disk session files (`data/sessions/` on the Pi), not in the service worker cache.

## Testing Locally

When testing locally:
1. Open DevTools (F12)
2. Go to Application tab > Service Workers
3. Check "Update on reload" to force updates during development
4. Click "Unregister" to completely clear the service worker if needed

## Cache Strategy

- **HTML:** Network-first; cache used only when offline
- **Images/fonts:** Cache-first with network fallback
- **Auth/API:** Service worker bypass — always network
- **Auto-cleanup:** Old `ichacalc-*` cache versions are deleted on activate
