/**
 * L'adresse IP du visiteur, lue en un seul endroit.
 *
 * Le journal d'audit, les plafonds des demandes de compte, la vérification
 * reCAPTCHA et le limiteur de débit la lisaient chacun à leur manière : un
 * plafond qui lit un autre en-tête que son voisin se contourne par celui-là.
 *
 * On prend la première adresse de `X-Forwarded-For`, puis `X-Real-IP`. C'est
 * sûr derrière le reverse proxy du déploiement : Caddy (sans `trusted_proxies`,
 * voir docker/Caddyfile) comme Vercel remplacent l'en-tête reçu du client au
 * lieu d'y ajouter la leur, si bien que cette première adresse n'est pas celle
 * que le visiteur aurait choisi d'écrire. Une application exposée sans proxy
 * lirait en revanche ce que le client envoie : les plafonds par connexion ne
 * tiennent alors plus, ceux par adresse e-mail ou par compte si (voir
 * docs/DEPLOIEMENT.md).
 *
 * Module pur, sans dépendance serveur.
 */
export function clientIpAddress(request?: Request | null): string | null {
  const brute =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip")?.trim() ||
    "";
  // Au-delà, ce n'est pas une adresse : on ne la promène pas dans les
  // journaux ni dans les clés du limiteur.
  if (!brute || brute.length > 64) return null;
  return brute;
}

/**
 * La même connexion, vue par le limiteur de débit.
 *
 * Une adresse IPv4 transportée en IPv6 (`::ffff:1.2.3.4`) redevient elle-même.
 * Une adresse IPv6 est ramenée à son préfixe /64 : un fournisseur d'accès en
 * attribue un entier à chaque abonné, et compter adresse par adresse laisserait
 * une seule box en changer à chaque envoi.
 */
export function rateLimitIpKey(ip: string | null): string | null {
  if (!ip) return null;
  const valeur = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mappee = valeur.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappee) return mappee[1];
  if (!valeur.includes(":")) return valeur;

  // Déplie la notation « :: » pour retrouver les quatre premiers groupes.
  const [tete, queue = ""] = valeur.split("::");
  const debut = tete ? tete.split(":") : [];
  const fin = queue ? queue.split(":") : [];
  const manquants = Math.max(0, 8 - debut.length - fin.length);
  const groupes = [...debut, ...Array<string>(manquants).fill("0"), ...fin];
  return `${groupes
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
