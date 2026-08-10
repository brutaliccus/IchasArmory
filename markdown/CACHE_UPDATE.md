# Cache Update Instructions

This project uses a Service Worker for caching. Instead of updating version numbers on individual modules, you only need to update the cache version in one place.

## How to Force a Cache Update

When you make changes to any JavaScript, CSS, or HTML files, update the cache version:

1. Open `sw.js`
2. Change the `CACHE_VERSION` constant at the top:
   ```javascript
   const CACHE_VERSION = 'v2';  // Increment this (v1 -> v2 -> v3, etc.)
   ```
3. Save the file
4. Deploy to your server

The service worker will automatically:
- Clear old caches
- Re-cache all files with the new version
- Update users' browsers on next visit

## What Gets Cached

The service worker caches:
- HTML files (index.html)
- CSS files (style.css)
- JavaScript modules (all files in /modules/)
- Main app file (app.js)

## Testing Locally

When testing locally:
1. Open DevTools (F12)
2. Go to Application tab > Service Workers
3. Check "Update on reload" to force updates during development
4. Click "Unregister" to completely clear the service worker if needed

## Cache Strategy

- **Cache First**: Files are served from cache when available
- **Network Fallback**: If not in cache, fetches from network
- **Auto-cleanup**: Old cache versions are automatically deleted
- **Update check**: Runs every 60 seconds to check for new versions
