const CACHE_NAME = 'logo-package-generator-v1.0.0';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Assets to cache during installation
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://i.postimg.cc/dtq83xGm/logo-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js'
];

// Third-party resources to cache
const EXTERNAL_RESOURCES = [
  'https://fonts.googleapis.com/css2?family=Segoe+UI:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll([...STATIC_ASSETS, ...EXTERNAL_RESOURCES]);
      })
      .then(() => {
        console.log('Service Worker: Install completed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activate completed');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('extension')) {
    return;
  }

  // Handle API requests (don't cache them)
  if (event.request.url.includes('api.openai.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise make network request
        return fetch(event.request)
          .then((networkResponse) => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response
            const responseToCache = networkResponse.clone();

            // Cache the new response for dynamic resources
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                // Only cache same-origin resources and specific external resources
                const url = new URL(event.request.url);
                const isCacheable = 
                  url.origin === self.location.origin ||
                  EXTERNAL_RESOURCES.includes(event.request.url) ||
                  STATIC_ASSETS.includes(event.request.url);
                
                if (isCacheable) {
                  cache.put(event.request, responseToCache);
                }
              })
              .catch((error) => {
                console.warn('Service Worker: Cache put error', error);
              });

            return networkResponse;
          })
          .catch((error) => {
            console.warn('Service Worker: Fetch failed', error);
            
            // If both cache and network fail, you could return a fallback page
            // For now, we'll let the error propagate
            throw error;
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Periodic background sync for updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-check') {
    console.log('Service Worker: Periodic sync for updates');
    event.waitUntil(checkForUpdates());
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Logo Package Generator',
    icon: 'https://i.postimg.cc/dtq83xGm/logo-512x512.png',
    badge: 'https://i.postimg.cc/dtq83xGm/logo-512x512.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Logo Package Generator', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

// Background sync function
async function doBackgroundSync() {
  try {
    // Perform any background tasks here
    console.log('Service Worker: Performing background sync');
    
    // Example: Check for app updates
    const cache = await caches.open(STATIC_CACHE);
    const response = await fetch('/');
    await cache.put('/', response);
    
    console.log('Service Worker: Background sync completed');
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Check for updates function
async function checkForUpdates() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const updatedAssets = [];
    
    for (const asset of STATIC_ASSETS) {
      try {
        const networkResponse = await fetch(asset);
        const cachedResponse = await cache.match(asset);
        
        if (!cachedResponse || 
            networkResponse.headers.get('etag') !== cachedResponse.headers.get('etag')) {
          await cache.put(asset, networkResponse.clone());
          updatedAssets.push(asset);
        }
      } catch (error) {
        console.warn(`Service Worker: Failed to update ${asset}`, error);
      }
    }
    
    if (updatedAssets.length > 0) {
      console.log('Service Worker: Updated assets', updatedAssets);
      
      // Notify clients about updates
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'ASSETS_UPDATED',
          assets: updatedAssets
        });
      });
    }
  } catch (error) {
    console.error('Service Worker: Update check failed', error);
  }
}

// Message event handler for communication with clients
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: '1.0.0',
      cacheName: CACHE_NAME
    });
  }
});
