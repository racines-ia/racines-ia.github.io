/* racines.ia — démarrage hors ligne (les données restent sur Supabase) */
const CACHE = 'racine-v97';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/racine-192.png', '/racine-512.png', '/ecole/', '/ecole/index.html', '/ecole/shim.js', '/ecole/config.js', '/ecole/icon-192-v3.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === location.origin && !u.pathname.endsWith('.apk');
  const lib = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if (!same && !lib) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match(u.pathname.startsWith('/ecole/') ? '/ecole/index.html' : '/index.html') : undefined))));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/ecole/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (new URL(c.url).pathname.startsWith('/ecole')) return c.focus();
    return self.clients.openWindow(url);
  }));
});

/* notifications envoyées par le serveur (paiements, documents, communiqués…) */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'racines.ia', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'racines.ia', body = d.body || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const vis = cs.filter(c => c.visibilityState === 'visible' && new URL(c.url).pathname.startsWith('/ecole'));
    vis.forEach(c => c.postMessage({ type: 'push', title, body }));
    if (vis.length && !d.always) return;
    return self.registration.showNotification(title, { body, icon: '/racine-192.png', badge: '/racine-badge-96.png', tag: d.tag || 'racines', renotify: true, vibrate: [120, 60, 120], data: { url: d.url || '/ecole/' } });
  }));
});
