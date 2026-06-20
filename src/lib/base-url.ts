import { headers } from "next/headers";

/**
 * URL de base du site (sans slash final). Utilise NEXT_PUBLIC_APP_URL si défini,
 * sinon déduit l'origine depuis les en-têtes de la requête.
 */
export async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
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
