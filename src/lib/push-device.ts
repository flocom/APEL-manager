import { api } from "@/lib/client";

/**
 * Abonnement push d'un appareil, côté navigateur.
 *
 * Partagé par le réglage « Mon compte » et par la bannière du tableau de bord :
 * un seul chemin de code demande la permission, enregistre le service worker
 * et déclare l'abonnement au serveur, pour que les deux entrées ne puissent pas
 * diverger.
 */

/** Émis sur `window` dès qu'un appareil s'abonne, se désabonne ou coupe tout. */
export const EVENEMENT_PUSH = "apel:push-change";

type DetailPush = { compteActif?: boolean };

export function signalerChangementPush(detail: DetailPush = {}) {
  window.dispatchEvent(new CustomEvent<DetailPush>(EVENEMENT_PUSH, { detail }));
}

export function pushDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iPhone et iPad n'ouvrent les notifications qu'aux sites ajoutés à l'écran
 * d'accueil : dans Safari, l'API n'existe pas du tout. On sait donc distinguer
 * « ce navigateur ne saura jamais » d'« il manque une étape à l'utilisateur ».
 */
export function iosSansEcranAccueil(): boolean {
  if (typeof window === "undefined" || pushDisponible()) return false;
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS se fait passer pour un Mac, seul l'écran tactile le trahit.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const installe =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installe;
}

export async function abonnementLocal(): Promise<PushSubscription | null> {
  if (!pushDisponible()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function base64UrlVersUint8(base64: string) {
  const rembourre = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const brut = atob(rembourre);
  return Uint8Array.from([...brut].map((c) => c.charCodeAt(0)));
}

/** Étiquette lisible pour que le membre reconnaisse ses appareils dans la liste. */
export function nomAppareil() {
  const ua = navigator.userAgent;
  const systeme = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Mac/i.test(ua)
        ? "Mac"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Appareil";
  const navigateur = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "navigateur";
  return `${systeme} · ${navigateur}`;
}

/**
 * Abonne l'appareil courant. À n'appeler que depuis un clic : les navigateurs
 * refusent une demande de permission qui ne suit pas un geste de l'utilisateur.
 */
export async function activerCetAppareil(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "Votre navigateur a refusé les notifications. Autorisez-les dans ses réglages, puis réessayez.",
    );
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = (await fetch("/api/push/key", {
    cache: "no-store",
  }).then((r) => r.json())) as { publicKey: string | null };
  if (!publicKey) throw new Error("Clé du serveur indisponible.");

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlVersUint8(publicKey),
  });
  const brut = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await api("/api/push/subscribe", {
    body: {
      endpoint: brut.endpoint,
      p256dh: brut.keys.p256dh,
      auth: brut.keys.auth,
      deviceLabel: nomAppareil(),
    },
  });
}

export async function desactiverCetAppareil(): Promise<void> {
  const subscription = await abonnementLocal();
  if (!subscription) return;
  await api("/api/push/subscribe", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}
