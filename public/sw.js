/*
 * Service worker des notifications sur appareil.
 *
 * Il ne met rien en cache : son unique rôle est d'afficher les notifications
 * reçues et de dire au serveur qu'elles sont arrivées, puis qu'elles ont été
 * ouvertes. C'est cet accusé qui permet de savoir qui a réellement reçu quoi —
 * le service de notification du navigateur, lui, ne confirme que la prise en
 * charge du message.
 */

function accuser(token, event) {
  if (!token) return Promise.resolve();
  return fetch("/api/push/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, event }),
    keepalive: true,
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let charge = {};
  try {
    charge = event.data ? event.data.json() : {};
  } catch {
    charge = { title: "Notification", body: event.data ? event.data.text() : "" };
  }

  const titre = charge.title || "Notification";
  const options = {
    body: charge.body || "",
    icon: charge.icon || undefined,
    tag: charge.ack || undefined,
    data: { url: charge.url || "/dashboard", ack: charge.ack || null },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titre, options),
      accuser(charge.ack, "received"),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const donnees = event.notification.data || {};
  event.waitUntil(
    Promise.all([
      accuser(donnees.ack, "opened"),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((fenetres) => {
          const cible = donnees.url || "/dashboard";
          // Réutiliser un onglet déjà ouvert plutôt que d'en empiler un de plus.
          for (const fenetre of fenetres) {
            if ("focus" in fenetre) {
              fenetre.navigate?.(cible);
              return fenetre.focus();
            }
          }
          return self.clients.openWindow(cible);
        }),
    ]),
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
