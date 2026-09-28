/**
 * Envoi d'un fichier dans le scope `media` (photos, musique).
 *
 * Une photo de téléphone pèse souvent 5 à 10 Mo pour 4 000 pixels de large ;
 * la vidéo n'en montre jamais plus de 1 920. Elle est donc réduite dans le
 * navigateur avant l'envoi : moins d'attente, moins de disque, et un export
 * vidéo qui ne décode pas des images inutilement lourdes. L'orientation EXIF
 * est appliquée au passage, faute de quoi une photo prise en portrait
 * arriverait couchée.
 */

const MAX_SIDE = 1920;

async function downscaleImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export async function uploadMedia(file: File): Promise<string> {
  const prepared = await downscaleImage(file);
  const body = new FormData();
  body.set("scope", "media");
  body.set("file", prepared);
  const response = await fetch("/api/uploads", {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    file?: { url?: string };
  };
  if (!response.ok || !payload.file?.url) {
    throw new Error(payload.error || "Envoi du fichier impossible.");
  }
  return payload.file.url;
}

/** Durée d'un fichier audio, lue dans ses métadonnées par le navigateur. */
export function audioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
      } else {
        reject(new Error("Durée du fichier audio illisible."));
      }
    };
    audio.onerror = () => reject(new Error("Fichier audio illisible."));
    audio.src = url;
  });
}
