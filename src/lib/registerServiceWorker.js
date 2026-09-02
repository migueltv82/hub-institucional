export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  if (import.meta.env.DEV || isLocalhost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => (window.caches ? window.caches.keys() : []))
        .then((keys = []) => Promise.all(keys.map((key) => window.caches.delete(key))))
        .catch(() => {
          // La app sigue funcionando si el navegador no permite limpiar caches.
        })
    })
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // La app sigue funcionando si el navegador rechaza el service worker.
    })
  })
}
