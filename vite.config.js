import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    // index.html lives at project root
    root: '.',

    // Files in public/ are copied to dist/ as-is (no processing)
    // sw.js lives here so it lands at /sw.js
    publicDir: 'public',

    build: {
        outDir: 'dist',
        emptyOutDir: true,

        // Sim + shaman bundles are legitimately large; default 500 kB warning is noisy
        chunkSizeWarningLimit: 900,

        // Use _app/ for Vite's hashed bundles so they don't collide with
        // our existing /assets/ folder (icons, spells.json, images, etc.)
        assetsDir: '_app',

        rollupOptions: {
            output: {
                // Split large module groups into separate cacheable chunks
                manualChunks(id) {
                    // Normalise path separators
                    const p = id.replace(/\\/g, '/');
                    if (p.includes('/modules/sim/')) return 'sim-engine';
                    if (p.includes('/modules/shaman/') && !p.includes('Worker')) return 'shaman';
                    if (p.includes('/modules/gear/')) return 'gear';
                    if (p.includes('/modules/character/')) return 'character';
                    if (p.includes('/modules/talents/')) return 'talents';
                },
            },
        },
    },

    appType: 'spa',

    // Dev server – proxy API routes to the Python server (port 6100)
    server: {
        port: 5173,
        proxy: {
            '/user':        { target: 'http://localhost:6100', changeOrigin: true },
            '/profiles':    { target: 'http://localhost:6100', changeOrigin: true },
            '/inbox':       { target: 'http://localhost:6100', changeOrigin: true },
            '/auth':        { target: 'http://localhost:6100', changeOrigin: true },
            '/builds':      { target: 'http://localhost:6100', changeOrigin: true },
            '/gear-plans':  { target: 'http://localhost:6100', changeOrigin: true },
            '/user-gear-plans': { target: 'http://localhost:6100', changeOrigin: true },
            '/community-gear-plans': { target: 'http://localhost:6100', changeOrigin: true },
            '/share':       { target: 'http://localhost:6100', changeOrigin: true },
            '/bug-report':  { target: 'http://localhost:6100', changeOrigin: true },
            '/bug-reports': { target: 'http://localhost:6100', changeOrigin: true },
            '/api':         { target: 'http://localhost:6100', changeOrigin: true },
            '/bosses':      { target: 'http://localhost:6100', changeOrigin: true },
        },
    },

    // Web Workers – bundle as ES modules so import.meta.url resolves correctly
    worker: {
        format: 'es',
    },

    plugins: [
        // Copy static asset folders into dist/ so they're accessible at the
        // same URL paths they use today (/assets/icons/…, /assets/spells.json, …)
        viteStaticCopy({
            targets: [
                { src: 'assets', dest: '.' },
            ],
        }),
    ],
});
