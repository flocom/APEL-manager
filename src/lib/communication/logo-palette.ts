import "server-only";

import sharp from "sharp";

import type { VideoPalette } from "@/remotion/class-video/types";

import {
  buildVideoPalette,
  DEFAULT_VIDEO_PALETTE,
  type WeightedColor,
} from "./palette";

/**
 * Lit les couleurs d'un logo : réduit à 64 × 64, chaque pixel opaque compte
 * pour une voix. Les pixels transparents — le fond d'un PNG détouré — ne
 * votent pas.
 */
export async function logoColors(image: Buffer): Promise<WeightedColor[]> {
  const { data, info } = await sharp(image)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors: WeightedColor[] = [];
  for (let i = 0; i < info.width * info.height; i++) {
    const alpha = data[i * 4 + 3];
    if (alpha < 128) continue;
    colors.push({
      r: data[i * 4],
      g: data[i * 4 + 1],
      b: data[i * 4 + 2],
      weight: 1,
    });
  }
  return colors;
}

/** Palette de la vidéo ; la palette par défaut si le logo est illisible. */
export async function paletteFromLogo(
  image: Buffer | null,
): Promise<VideoPalette> {
  if (!image) return DEFAULT_VIDEO_PALETTE;
  try {
    return buildVideoPalette(await logoColors(image));
  } catch {
    return DEFAULT_VIDEO_PALETTE;
  }
}
