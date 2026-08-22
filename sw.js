// Service worker for "Two Currencies, One Number". Caching strategy is deliberately asymmetric:
//
// - HTML navigations: network-first, falling back to cache only when the network fetch fails.
//   This is a financial-figures site (2026 TFSA/HSA/401(k) limits, tax brackets, CPP/OAS/SS
//   maximums are baked into the HTML/shared.js) — serving a stale cached page to someone who's
//   actually online would be a real correctness problem, not just a UX nitpick. Offline visitors
//   still get the last-seen version instead of a broken connection error.
// - styles.css / shared.js (any ?v=<hash> query) and /fonts/*: cache-first, populated at runtime
//   on first fetch. These are NOT precached by exact hash below — scripts/bump_asset_version.py
//   rewrites that hash on every content change, and hardcoding a specific ?v=... URL here would
//   immediately go stale with nothing to keep the two in sync. Runtime caching sidesteps that.
// - Everything else (notably cross-origin api.frankfurter.dev FX calls) is never intercepted.
//
// CACHE_NAME is the update mechanism: bump it when this file's caching behavior changes
// meaningfully, and `activate` below deletes any cache that doesn't match.
const CACHE_NAME = 'ccfire-shell-v1';

// The 16 real pages (clean URLs, matching how this site is actually served/linked — see each
// page's <link rel="canonical">) plus the manifest and the two icon files it references.
// google31da07b5b71e19d0.html (Search Console verification) is intentionally excluded — it's not
// a real page and nothing links to it.
const PRECACHE_URLS = [
  '/', '/coastfire-calculator', '/compare-scenarios', '/departure-tax', '/drawdown-optimizer',
  '/moving-back', '/rrsp-withholding', '/benefit-timing', '/action-items',
  '/guides', '/guides/canada-departure-tax-explained', '/guides/coastfire-cross-border-canadians',
  '/guides/cpp-oas-social-security-cross-border', '/guides/moving-back-to-canada-from-us-taxes',
  '/guides/retirement-drawdown-order-rrsp-401k', '/guides/rrsp-withholding-tax-us-resident',
  '/manifest.json', '/favicon.svg', '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each URL independently rather than cache.addAll() — one missing/failed URL (e.g. a
    // page not yet deployed, or a route that 404s in a given environment) shouldn't sink
    // installation of the rest of the shell.
    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* offline during install, or route not available here — skip it */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

const RUNTIME_CACHE_RE = /\/(styles\.css|shared\.js)(\?.*)?$/;

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Cross-origin (e.g. api.frankfurter.dev FX calls) — never intercepted.
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || caches.match('/');
      }
    })());
    return;
  }

  if (RUNTIME_CACHE_RE.test(url.pathname) || url.pathname.startsWith('/fonts/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    })());
  }
});
