/**
 * Un relais SMTP « local » : la machine elle-même ou un conteneur voisin du
 * même réseau Docker (Mailpit, un Postfix de la pile). Le courrier n'y
 * traverse aucun réseau qu'un tiers pourrait écouter, et ces relais ne
 * présentent en général aucun certificat : exiger TLS les rendrait
 * inutilisables sans rien protéger.
 *
 * Tout autre hôte passe par Internet ou par un réseau partagé, où le mot de
 * passe et les liens de connexion contenus dans les messages ne doivent jamais
 * circuler en clair.
 *
 * Sans dépendance à Node : l'écran de configuration s'en sert aussi pour dire
 * à l'administrateur ce qui sera exigé.
 */
export function estRelaisLocal(host: string | null | undefined): boolean {
  const hote = host?.trim().toLowerCase().replace(/^\[|\]$/g, "") ?? "";
  if (!hote) return false;
  // `localhost` seul : un sous-domaine en `.localhost` n'est ramené à la
  // machine que par certains résolveurs, d'autres l'envoient au DNS.
  if (hote === "localhost") return true;
  // L'hôte Docker vu depuis un conteneur, sous Docker Desktop.
  if (hote === "host.docker.internal") return true;
  if (hote === "::1") return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(hote)) return true;
  // Un nom sans point est un service du réseau Compose (`mailpit`) : il ne se
  // résout jamais sur Internet. Il doit commencer par une lettre, pour qu'une
  // adresse IP écrite en un seul nombre (« 167772161 », « 0x0a000001 ») ne
  // passe pas pour un nom.
  return /^[a-z][a-z0-9_-]*$/.test(hote);
}
