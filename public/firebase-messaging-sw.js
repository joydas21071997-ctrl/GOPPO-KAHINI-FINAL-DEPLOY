/* Goppo Kahini Firebase Cloud Messaging Web Push Service Worker */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Goppo Kahini', body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const fcmOptions = payload.fcmOptions || {};

  const title = notification.title || data.title || 'গল্পকাহিনি (Goppo Kahini)';
  const body = notification.body || data.body || 'নতুন অডিও গল্প বা আপডেট এসেছে।';
  const targetUrl = fcmOptions.link || notification.click_action || data.url || '/';

  const options = {
    body,
    icon: notification.icon || '/pwa-192x192.png',
    badge: notification.badge || '/pwa-192x192.png',
    image: notification.image || undefined,
    tag: data.tag || 'goppo-kahini-push',
    data: {
      url: typeof targetUrl === 'string' ? targetUrl : '/',
      storyId: data.storyId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  let targetUrl = '/';
  try {
    const resolved = new URL(String(rawUrl), self.location.origin);
    if (resolved.origin === self.location.origin) {
      targetUrl = resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    targetUrl = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (typeof client.navigate === 'function' && client.url !== self.location.origin + targetUrl) {
            return client.navigate(targetUrl).then((navClient) => (navClient ? navClient.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
