import { NextResponse } from "next/server";

import { emailLogoFile, emailLogoVersion } from "@/lib/notifications/logo";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ fichier: string }> };

/**
 * Le logo de l'association, en PNG, pour l'en-tête des e-mails.
 *
 * Public comme le logo lui-même : un client de messagerie n'a pas de session,
 * et le proxy d'images de Gmail non plus. La route ne lit jamais que le logo
 * *configuré* — le nom du fichier demandé n'est qu'une empreinte, comparée et
 * jamais utilisée comme chemin.
 *
 * Voir lib/notifications/logo.ts pour le pourquoi du PNG et de la taille, et
 * pour le rendu gardé en mémoire d'une requête à l'autre.
 */

function introuvable() {
  // Jamais mis en cache : la même adresse servira dès qu'un logo existera.
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { fichier } = await params;
  if (!/^[0-9a-f]{16}\.png$/.test(fichier)) return introuvable();

  try {
    const { logoUrl } = await getAssociationSettings();
    if (!logoUrl) return introuvable();
    // L'adresse d'un ancien logo ne sert plus rien. Y servir le logo actuel le
    // ferait entrer dans la case d'un autre : les messages déjà envoyés gardent
    // la largeur et la hauteur de l'ancien, et Outlook, qui s'y tient, le
    // déformerait. Ils montrent à la place le nom de l'association.
    if (fichier !== `${emailLogoVersion(logoUrl)}.png`) return introuvable();

    // Le verdict même qui a mis le logo dans les messages : un fichier abîmé,
    // ou un WebP sans sharp, n'y figure pas, et n'est pas servi ici non plus —
    // encore moins gardé un an en cache.
    const logo = await emailLogoFile(logoUrl);
    if (!logo) return introuvable();

    return new NextResponse(new Uint8Array(logo.body), {
      headers: {
        "Content-Type": logo.contentType,
        "Content-Length": String(logo.body.byteLength),
        "Content-Disposition": "inline",
        // L'empreinte change avec le logo : le PNG rendu, décodé puis
        // réencodé ici, peut se garder un an. Le fichier d'origine servi en
        // secours, non : il doit céder la place au PNG dès que sharp sera de
        // retour.
        "Cache-Control": logo.definitif
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "[logo-email] logo indisponible :",
      error instanceof Error ? error.message : error,
    );
    return new NextResponse(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
