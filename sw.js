const CACHE_NAME = 'hormuz-watch-v1';
const STATIC_CACHE = 'hormuz-static-v1';
const DYNAMIC_CACHE = 'hormuz-dynamic-v1';
const OFFLINE_PAGE = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  // External CDN resources (cache as opaque responses)
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;600;700&family=SF+Mono:wght@400;500&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('hormuz-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Strategy: Cache First for static assets, Network First for API calls
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (isAPIRequest(url)) {
    event.respondWith(networkFirst(request));
  } else {
    // Default: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Helper: Check if URL is static asset
function isStaticAsset(url) {
  const staticHosts = [
    'unpkg.com',
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  
  return staticHosts.some(host => url.hostname.includes(host)) ||
         url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|json)$/);
}

// Helper: Check if URL is API request
function isAPIRequest(url) {
  return url.pathname.includes('/api/') || 
         url.hostname.includes('aisstream.io') ||
         url.hostname.includes('portwatch.imf.org');
}

// Cache First Strategy
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    return caches.match(OFFLINE_PAGE);
  }
}

// Network First Strategy (for APIs)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache');
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    throw error;
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then(c => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Network fetch failed:', error);
      return null;
    });

  // Return cached version immediately, or wait for network
  return cached || networkFetch;
}

// Background Sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-alerts') {
    event.waitUntil(syncPendingAlerts());
  }
});

// Push Notifications (optional)
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification('HORMUZ WATCH', {
      body: data.message,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/badge-72x72.png',
      tag: data.id,
      requireInteraction: true,
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/?alert=' + event.notification.tag)
    );
  }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Periodic background sync (when supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-vessel-data') {
    event.waitUntil(updateVesselData());
  }
});

async function syncPendingAlerts() {
  // Implementation for syncing alerts queued while offline
  console.log('[SW] Syncing pending alerts...');
}

async function updateVesselData() {
  // Background update of cached vessel positions
  console.log('[SW] Background sync updating vessel data...');
}
