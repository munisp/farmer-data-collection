/**
 * AgriFinance PWA Service Worker
 * Provides offline-first functionality with intelligent caching strategies
 */

const APP_VERSION = '2.0.0';
const CACHE_PREFIX = 'agrifinance';

// Cache names for different resource types
const CACHES = {
  STATIC: `${CACHE_PREFIX}-static-v${APP_VERSION}`,
  DYNAMIC: `${CACHE_PREFIX}-dynamic-v${APP_VERSION}`,
  API: `${CACHE_PREFIX}-api-v${APP_VERSION}`,
  IMAGES: `${CACHE_PREFIX}-images-v${APP_VERSION}`,
};

// Static assets to pre-cache during install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// API endpoints that should use network-first strategy
const API_ROUTES = [
  '/api/trpc',
  '/api/auth',
];

// Routes that can work offline with cached data
const OFFLINE_CAPABLE_ROUTES = [
  '/marketplace',
  '/harvests',
  '/expenses',
  '/crops',
  '/farms',
  '/farmers',
  '/my-listings',
  '/my-orders',
  '/my-sales',
  '/delivery',
  '/cold-chain',
  '/chama',
  '/mobile-money',
  '/settings',
];

// Maximum cache sizes per category
const MAX_CACHE_ITEMS = {
  API: 200,
  IMAGES: 100,
  DYNAMIC: 150,
};

// ============================================
// INSTALL EVENT - Pre-cache static assets
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v' + APP_VERSION);
  
  event.waitUntil(
    caches.open(CACHES.STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// ============================================
// ACTIVATE EVENT - Clean up old caches
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v' + APP_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete caches that don't match current version
              return cacheName.startsWith(CACHE_PREFIX) && 
                     !Object.values(CACHES).includes(cacheName);
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleared');
        return self.clients.claim();
      })
  );
});

// ============================================
// FETCH EVENT - Intelligent caching strategies
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // For non-GET requests: attempt fetch, queue on failure (handled by OfflineDataManager)
  if (request.method !== 'GET') {
    if (isApiRequest(url) && !navigator.onLine) {
      event.respondWith(
        new Response(
          JSON.stringify({
            error: 'queued',
            message: 'Request queued for sync when online.',
            offline: true,
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // API requests - Network first, cache fallback
  if (isApiRequest(url)) {
    event.respondWith(networkFirstStrategy(request, CACHES.API));
    return;
  }
  
  // Image requests - Cache first, network fallback
  if (isImageRequest(url)) {
    event.respondWith(cacheFirstStrategy(request, CACHES.IMAGES));
    return;
  }
  
  // Static assets - Cache first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, CACHES.STATIC));
    return;
  }
  
  // Navigation requests - Network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }
  
  // Default - Stale while revalidate
  event.respondWith(staleWhileRevalidate(request, CACHES.DYNAMIC));
});

// ============================================
// CACHING STRATEGIES
// ============================================

/**
 * Network First Strategy
 * Try network, fall back to cache, update cache on success
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API requests
    return new Response(
      JSON.stringify({ 
        error: 'offline', 
        message: 'You are currently offline. Data will sync when connection is restored.' 
      }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

/**
 * Cache First Strategy
 * Try cache, fall back to network, update cache on success
 */
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache and network failed:', request.url);
    return new Response('Resource not available offline', { status: 503 });
  }
}

/**
 * Stale While Revalidate Strategy
 * Return cache immediately, update cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
}

/**
 * Navigation Strategy
 * Network first with offline page fallback
 */
async function navigationStrategy(request) {
  try {
    const preloadResponse = await Promise.resolve(self.registration.navigationPreload?.getState?.());
    
    if (preloadResponse?.enabled) {
      const response = await preloadResponse;
      if (response) return response;
    }
    
    return await fetch(request);
  } catch (error) {
    console.log('[SW] Navigation failed, serving offline page');
    
    // Try to serve cached version of the page
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Serve offline fallback page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    
    // Last resort - serve index.html (SPA will handle routing)
    return caches.match('/index.html');
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isApiRequest(url) {
  return API_ROUTES.some(route => url.pathname.startsWith(route));
}

function isImageRequest(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname);
}

function isStaticAsset(url) {
  return /\.(js|css|woff|woff2|ttf|eot)$/i.test(url.pathname);
}

// ============================================
// BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncRequestQueue());
  }
  
  if (event.tag === 'sync-harvests') {
    event.waitUntil(syncHarvests());
  }
  
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncExpenses());
  }
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

/**
 * Process the IndexedDB request queue from OfflineDataManager
 */
async function syncRequestQueue() {
  console.log('[SW] Processing offline request queue...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_QUEUE' });
  });
}

async function syncHarvests() {
  console.log('[SW] Syncing harvests...');
  // Sync logic will be handled by the app's sync service
  // This just triggers a message to the client
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_HARVESTS' });
  });
}

async function syncExpenses() {
  console.log('[SW] Syncing expenses...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_EXPENSES' });
  });
}

async function syncOrders() {
  console.log('[SW] Syncing orders...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_ORDERS' });
  });
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = { title: 'AgriFinance', body: 'You have a new notification' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'agrifinance-notification',
    renotify: true,
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open new window if none exists
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// ============================================
// MESSAGE HANDLING
// ============================================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHES.DYNAMIC).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX))
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});

console.log('[SW] Service worker loaded v' + APP_VERSION);
