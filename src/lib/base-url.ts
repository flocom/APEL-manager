import { headers } from "next/headers";

/**
 * URL de base du site (sans slash final). APP_URL reste configurable au
 * démarrage d'une image Docker ; NEXT_PUBLIC_APP_URL est conservée pour les
 * anciens déploiements.
 */
export async function getBaseUrl(): Promise<string> {
  const configured =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
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
