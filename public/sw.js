const CACHE_NAME = "siomai-production-v3";
const APP_SHELL = [
  "/",
  "/consignment",
  "/icon.svg",
  "/manifest.webmanifest",
  "/consignment/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "SHOW_ORDER_NOTIFICATION") {
    const title = event.data.title || "New consignment order";
    const options = {
      badge: "/icon.svg",
      body: event.data.body || "Open production to review the request.",
      data: {
        url: event.data.url || "/?tab=orders",
      },
      icon: "/icon.svg",
      tag: event.data.tag || "siomai-consignment-order",
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", responseClone));
          return response;
        })
        .catch(() => caches.match("/") || Response.error()),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }

        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  const title = payload.title || "New consignment order";
  const options = {
    badge: "/icon.svg",
    body: payload.body || "Open production to review the request.",
    data: {
      url: payload.url || "/",
    },
    icon: "/icon.svg",
    tag: payload.tag || "siomai-consignment-order",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/?tab=orders", self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => {
        const existingClient =
          clients.find((client) => client.url === targetUrl) ||
          clients.find((client) => new URL(client.url).origin === self.location.origin);

        if (existingClient) {
          if ("navigate" in existingClient) {
            return existingClient.navigate(targetUrl).then((client) => client?.focus());
          }

          return existingClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
