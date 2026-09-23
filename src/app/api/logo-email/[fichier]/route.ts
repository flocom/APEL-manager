import { NextResponse } from "next/server";

import {
  emailLogoSize,
  emailLogoVersion,
  MAX_SOURCE_PIXELS,
  readBrandingLogo,
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
let cache: { version: string; body: Buffer; type: string } | null = null;

function introuvable() {
  // Jamais mis en cache : la même adresse servira dès qu'un logo existera.
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

async function renderPng(
  data: Buffer,
  box: { width: number; height: number },
): Promise<Buffer> {
  // Chargé ici seulement : la bibliothèque native n'a rien à faire dans les
  // autres routes.
  const { default: sharp } = await import("sharp");
  return (
    sharp(data, { limitInputPixels: MAX_SOURCE_PIXELS })
      // Redressé comme le navigateur le redresse sur le site.
      .autoOrient()
      .resize({
        // Le double de la taille d'affichage : net sur un écran haute densité.
        width: box.width * 2,
        height: box.height * 2,
        fit: "inside",
        withoutEnlargement: true,
      })
      // Posé sur blanc : les logos sont dessinés pour un fond clair. Un client
      // qui force le mode sombre assombrit la carte, pas l'image ; un logo
      // transparent aux lettres foncées y deviendrait invisible.
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer()
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { fichier } = await params;
  if (!/^[0-9a-f]{16}\.png$/.test(fichier)) return introuvable();

  try {
    const { logoUrl } = await getAssociationSettings();
    if (!logoUrl) return introuvable();
    const version = emailLogoVersion(logoUrl);

    if (cache?.version !== version) {
      const source = await readBrandingLogo(logoUrl);
      if (!source) return introuvable();
      let body: Buffer;
      let type = "image/png";
      try {
        body = await renderPng(source.data, emailLogoSize(source.dimensions));
      } catch (error) {
        // Sans conversion possible, un PNG ou un JPEG d'origine s'affiche
        // encore partout — plus lourd, mais présent. Un WebP, non.
        if (source.contentType === "image/webp") throw error;
        console.warn(
          "[logo-email] conversion impossible, envoi du fichier d'origine :",
          error instanceof Error ? error.message : error,
        );
        body = source.data;
        type = source.contentType;
      }
      cache = { version, body, type };
    }

    return new NextResponse(new Uint8Array(cache.body), {
      headers: {
        "Content-Type": cache.type,
        "Content-Length": String(cache.body.byteLength),
        "Content-Disposition": "inline",
        // L'empreinte change avec le logo : l'adresse courante peut se garder
        // un an. Celle d'un ancien logo — un vieux message rouvert — reçoit le
        // logo actuel, mais pour une heure seulement.
        "Cache-Control":
          fichier === `${version}.png`
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
