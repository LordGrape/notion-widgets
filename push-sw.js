/* Dedicated push service worker for the Clock widget's Fix C (real Web Push).
   Lives at the repo root (notion-widgets-93r.pages.dev/push-sw.js) since a
   service worker can only control the origin/scope it's served from, and
   clock.html is served from this origin (separate from the Command Centre
   PWA's own apps/assistant/sw.js, which is a different origin and can't be
   reused here). Intentionally does NOT do any caching — its only job is to
   turn an incoming push into an OS notification. */

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Clock', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || 'Clock';
  var options = {
    body: data.body || '',
    tag: 'clock-widget',
    renotify: true,
    icon: data.icon || new URL('apps/assistant/icon-192.png', self.registration.scope).href,
    badge: new URL('apps/assistant/icon-192.png', self.registration.scope).href,
    data: data
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var home = new URL('apps/assistant/', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      /* Prefer an open Command Centre window; otherwise any window of ours; otherwise open the app. */
      var best = clients.find(function(c) { return c.url.indexOf('/apps/assistant/') !== -1; }) || clients[0];
      if (best && 'focus' in best) return best.focus();
      if (self.clients.openWindow) return self.clients.openWindow(home);
    })
  );
});
