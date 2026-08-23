import type { MetadataRoute } from "next";

import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

/**
 * Manifeste d'application : il permet d'installer le site sur l'écran
 * d'accueil, condition posée par iOS pour recevoir des notifications.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getAssociationSettings();
  return {
    name: settings.associationName,
    short_name: settings.associationName.slice(0, 12),
    description: `Espace de l’association ${settings.associationName}`,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#082a40",
    icons: [
      {
        src: settings.logoUrl || "/logo.svg",
        sizes: "any",
        type: settings.logoUrl?.endsWith(".png") ? "image/png" : "image/svg+xml",
      },
    ],
  };
}
