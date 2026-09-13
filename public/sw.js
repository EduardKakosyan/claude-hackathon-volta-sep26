/*
 * Is the Beach Open — service worker. It does two things and nothing else:
 * show the notification a push carries, and open the beach it names when the
 * notification is tapped. No caching, no offline shell. Registered lazily by
 * the follow bell on the first tap, never on page load.
 */

const APP_NAME = 'Is the Beach Open'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/** The payload lib/push/send.ts builds: { title, body, beachId, url }. */
function readMessage(event) {
  if (!event.data) return { title: APP_NAME, body: '', beachId: null, url: '/' }
  try {
    const data = event.data.json()
    const beachId = typeof data.beachId === 'string' ? data.beachId : null
    return {
      title: typeof data.title === 'string' && data.title ? data.title : APP_NAME,
      body: typeof data.body === 'string' ? data.body : '',
      beachId,
      url: typeof data.url === 'string' ? data.url : beachId ? '/?beach=' + encodeURIComponent(beachId) : '/',
    }
  } catch {
    return { title: APP_NAME, body: event.data.text(), beachId: null, url: '/' }
  }
}

self.addEventListener('push', (event) => {
  const message = readMessage(event)
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icon',
      // One notification per beach: a later change replaces the earlier one instead of stacking.
      tag: message.beachId ? 'beach:' + message.beachId : undefined,
      data: { url: message.url, beachId: message.beachId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue
        if ('navigate' in client) {
          return client.navigate(target).then((navigated) => (navigated || client).focus())
        }
        return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
