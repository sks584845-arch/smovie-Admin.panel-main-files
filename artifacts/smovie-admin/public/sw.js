// sMovie Admin — Service Worker
// Handles PWA install, offline cache, and push notifications.

const CACHE = 'smovie-admin-v1';
const PRECACHE = ['/', '/index.html'];

// ── Install: pre-cache shell ────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ──────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fall back to cache ────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── OTA: clear all caches on demand from the main thread ────────────────────
// The main app posts { type: 'CLEAR_CACHE' } after detecting a new app_version
// in Firebase Realtime Database. The SW deletes every cache entry so the
// subsequent hard reload fetches fully fresh assets.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CLEAR_CACHE') {
    e.waitUntil(
      caches.keys().then(keys => {
        console.log('[SW] OTA CLEAR_CACHE received — flushing', keys.length, 'cache(s)');
        return Promise.all(keys.map(k => caches.delete(k)));
      })
    );
  }
});

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title   = data.title   ?? 'sMovie Admin';
  const options = {
    body:  data.body  ?? 'New OTT release available.',
    icon:  data.icon  ?? '/assets/icon.png',
    badge: data.badge ?? '/assets/favicon.png',
    tag:   data.tag   ?? 'smovie-notif',
    data:  { url: data.url ?? '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus / open window ─────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(w => w.url.includes(url) && 'focus' in w);
      return win ? win.focus() : clients.openWindow(url);
    })
  );
});
