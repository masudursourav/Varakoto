// Vara Koto — Service Worker
// Strategy:
//   - /api/v1/stops  → network-first, cache fallback (stale-while-revalidate)
//   - Next.js static assets (_next/static) → cache-first
//   - Navigation (HTML pages)             → network-first, cache fallback
//   - Everything else                     → network-only (fare calc must be live)

const SHELL_CACHE = "varakoto-shell-v$SW_VERSION";
const STOPS_CACHE = "varakoto-stops-v$SW_VERSION";
const STATIC_CACHE = "varakoto-static-v$SW_VERSION";

const SHELL_URLS = ["/", "/history", "/settings"];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const validCaches = new Set([SHELL_CACHE, STOPS_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // 1. Stops API → network-first, serve stale on failure
  if (url.pathname.includes("/api/v1/stops")) {
    event.respondWith(stopsStrategy(request));
    return;
  }

  // 2. Fare calculate & other API calls → network-only (must be live data)
  if (url.pathname.includes("/api/")) {
    return; // let it pass through unchanged
  }

  // 3. Next.js static chunks → cache-first (content-hashed filenames)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticStrategy(request));
    return;
  }

  // 4. Next.js image optimization → network-only
  if (url.pathname.startsWith("/_next/image")) {
    return;
  }

  // 5. Navigation requests (HTML) → network-first, shell fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // 6. Public assets (icons, manifest) → cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(staticStrategy(request));
    return;
  }
});

// ─── Strategies ──────────────────────────────────────────────────────────────

/**
 * Network-first with stale cache fallback.
 * On success, refreshes the stops cache in the background.
 */
async function stopsStrategy(request) {
  const cache = await caches.open(STOPS_CACHE);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      // Store a fresh copy for offline use
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline — serve stale stops so the UI still works
    const cached = await cache.match(request);
    if (cached) return cached;
    // No cache at all — return a JSON error the app can handle
    return new Response(
      JSON.stringify({
        success: false,
        message: "Offline — stops unavailable",
        data: [],
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Cache-first — ideal for content-hashed static bundles.
 * Falls back to network and then stores the result.
 */
async function staticStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Nothing we can do for missing static assets
    return new Response("Asset not available offline", { status: 503 });
  }
}

/**
 * Network-first for page navigation.
 * Falls back to the cached shell so the SPA can still boot offline.
 */
async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    // Refresh the shell cache opportunistically
    if (networkResponse.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Serve cached version of the requested page, or fallback to root
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      new Response("App is offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

// ─── Background Sync (future extension point) ────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
