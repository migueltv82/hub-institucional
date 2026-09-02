const CACHE_NAME = 'institutional-hub-v2'
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
]
const APP_SHELL_PATHS = new Set(APP_SHELL)

const canCacheResponse = (response) =>
  response?.ok === true && response.type === 'basic'

const putInCache = async (request, response) => {
  if (!canCacheResponse(response)) return

  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async (response) => {
        await putInCache('/', response)
        return response
      }).catch(async () => (await caches.match('/')) || Response.error()),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || APP_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then(async (response) => {
          await putInCache(request, response)
          return response
        }),
      ),
    )
  }
})
