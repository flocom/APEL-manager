import { headers } from "next/headers";

/**
 * L'URL du site telle que configurée (sans slash final), ou une chaîne vide.
 * APP_URL reste configurable au démarrage d'une image Docker ;
 * NEXT_PUBLIC_APP_URL est conservée pour les anciens déploiements.
 */
export function configuredBaseUrl(): string {
  const configured =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

/**
 * URL de base du site (sans slash final) : celle configurée, à défaut celle
 * déduite de la requête en cours.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = configuredBaseUrl();
  if (configured) {
    return configured;
  }
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    return host ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
}
