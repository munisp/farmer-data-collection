export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // In dev mode, VitePWA plugin handles SW registration via devOptions.enabled
  // Only register the custom service-worker.js in production builds
  const isDev = import.meta.env.DEV;

  window.addEventListener('load', () => {
    const swUrl = isDev ? '/dev-sw.js?dev-sw' : '/service-worker.js';

    navigator.serviceWorker
      .register(swUrl, isDev ? { type: 'module' } : undefined)
      .then((registration) => {
        console.warn(`Service Worker registered (${isDev ? 'dev' : 'prod'}):`, registration.scope);

        setInterval(() => {
          registration.update();
        }, 60000);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

export function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('Service Worker unregistration failed:', error);
      });
  }
}
