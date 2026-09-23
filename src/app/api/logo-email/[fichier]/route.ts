import { NextResponse } from "next/server";

import {
  emailLogoVersion,
  readBrandingLogo,
  renderEmailLogo,
} from "@/lib/notifications/logo";
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
 * Voir lib/notifications/logo.ts pour le pourquoi du PNG et de la taille.
 */

/**
 * Dernier rendu gardé en mémoire : une diffusion fait ouvrir le même logo par
 * des centaines de boîtes, et chacune le demande.
 */
let cache: {
  version: string;
  body: Buffer;
  type: string;
  /** Faux pour le fichier d'origine servi faute de sharp : voir plus bas. */
  definitif: boolean;
} | null = null;

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
    const version = emailLogoVersion(logoUrl);
    // L'adresse d'un ancien logo ne sert plus rien. Y servir le logo actuel le
    // ferait entrer dans la case d'un autre : les messages déjà envoyés gardent
    // la largeur et la hauteur de l'ancien, et Outlook, qui s'y tient, le
    // déformerait. Ils montrent à la place le nom de l'association.
    if (fichier !== `${version}.png`) return introuvable();

    if (cache?.version !== version) {
      const source = await readBrandingLogo(logoUrl);
      if (!source) return introuvable();
      let rendu: Buffer | null;
      try {
        rendu = await renderEmailLogo(source);
      } catch (error) {
        // Fichier abîmé : rien à servir, et surtout rien à garder un an en
        // cache. Le téléversement refuse ces fichiers ; seul un logo importé
        // avant cette vérification peut encore en arriver là.
        console.warn(
          "[logo-email] logo indécodable, non servi :",
          error instanceof Error ? error.message : error,
        );
        return introuvable();
      }
      if (rendu) {
        cache = { version, body: rendu, type: "image/png", definitif: true };
      } else {
        // Sans sharp, un PNG ou un JPEG d'origine s'affiche encore partout —
        // plus lourd, mais présent. Un WebP, non.
        if (source.contentType === "image/webp") return introuvable();
        cache = {
          version,
          body: source.data,
          type: source.contentType,
          definitif: false,
        };
      }
    }

    return new NextResponse(new Uint8Array(cache.body), {
      headers: {
        "Content-Type": cache.type,
        "Content-Length": String(cache.body.byteLength),
        "Content-Disposition": "inline",
        // L'empreinte change avec le logo : le rendu peut se garder un an. Le
        // fichier d'origine servi en secours, non : il doit céder la place au
        // PNG dès que sharp sera de retour.
        "Cache-Control": cache.definitif
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
