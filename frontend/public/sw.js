/**
 * Nirixon Frontline Worker Service Worker (PWA)
 * Enables offline dashboard access, screening cache, and sync queue reliability.
 */

const CACHE_NAME = "nirixon-chw-cache-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
];

// Install: Cache essential app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn("SW install: Pre-caching partial failure, proceeding:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Purge old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for APIs, Stale-while-revalidate for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (e.g. POST/PATCH sync handled by IndexedDB sync queue)
  if (request.method !== "GET") {
    return;
  }

  // Audio Narration assets and manifest: Cache-first for instant offline playback
  if (url.pathname.startsWith("/audio/") || url.pathname.startsWith("/api/audio/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background if online
          fetch(request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkRes;
        }).catch(() => {
          return new Response(
            JSON.stringify({ error: "offline_fallback", fallback_to_text: true }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        });
      })
    );
    return;
  }

  // API endpoints: Network-first, offline fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({ error: "offline", message: "Device is currently offline. Actions are queued in IndexedDB." }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // App navigation (HTML): Try network first, then cache, fallback to index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const indexMatch = await caches.match("/index.html");
        if (indexMatch) return indexMatch;
        return new Response("Offline - Nirixon Frontline Worker", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      })
    );
    return;
  }

  // Static assets (CSS, JS, Fonts, Images): Cache-first with network revalidation
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Asynchronously update cache in background
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      }).catch(() => {
        // Offline placeholder or nothing
      });
    })
  );
});

// Web push (delivery requires a server-side sender — see README).
self.addEventListener("push", (event) => {
  let data = { title: "Nirixon", body: "A follow-up is due." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // Plain-text payload — keep the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: "/#/chw/caseload" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#/chw/caseload";
  event.waitUntil(self.clients.openWindow(url));
});
