import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { HttpError } from "@/lib/auth/guards";

/**
 * `accounting` et `document` sont privés : leur lecture exige un rôle.
 * `branding` est le seul scope public — il ne contient que le logo affiché sur
 * le site public, jamais de pièce justificative.
 */
export type UploadScope = "accounting" | "document" | "branding";

const UPLOAD_ID_PATTERN =
  /^(accounting|document|branding)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Scopes dont le contenu est servi sans authentification. */
export function isPublicScope(scope: UploadScope | null) {
  return scope === "branding";
}

type FileKind = "pdf" | "jpeg" | "png" | "webp" | "text" | "zip" | "office";

/**
 * Le logo est servi en ligne depuis l'origine de l'application : on n'accepte
 * que des images matricielles, dont la signature binaire est vérifiable. Le SVG
 * est exclu, un fichier téléversé pouvant embarquer du script.
 */
const BRANDING_KINDS: FileKind[] = ["png", "jpeg", "webp"];

const FILE_POLICIES: Record<
  string,
  { contentType: string; kind: FileKind; inline: boolean }
> = {
  ".pdf": { contentType: "application/pdf", kind: "pdf", inline: true },
  ".jpg": { contentType: "image/jpeg", kind: "jpeg", inline: true },
  ".jpeg": { contentType: "image/jpeg", kind: "jpeg", inline: true },
  ".png": { contentType: "image/png", kind: "png", inline: true },
  ".webp": { contentType: "image/webp", kind: "webp", inline: true },
  ".txt": { contentType: "text/plain; charset=utf-8", kind: "text", inline: true },
  ".csv": { contentType: "text/csv; charset=utf-8", kind: "text", inline: false },
  ".doc": { contentType: "application/msword", kind: "office", inline: false },
  ".xls": {
    contentType: "application/vnd.ms-excel",
    kind: "office",
    inline: false,
  },
  ".docx": {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "zip",
    inline: false,
  },
  ".xlsx": {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "zip",
    inline: false,
  },
  ".odt": {
    contentType: "application/vnd.oasis.opendocument.text",
    kind: "zip",
    inline: false,
  },
  ".ods": {
    contentType: "application/vnd.oasis.opendocument.spreadsheet",
    kind: "zip",
    inline: false,
  },
};

function uploadsRoot() {
  return path.resolve(
    process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "data/uploads"),
  );
}

export function maxUploadBytes() {
  const configured = Number(process.env.UPLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 15 * 1024 * 1024;
}

export function storedUploadIdFromUrl(
  value: string,
  expectedScope?: UploadScope,
) {
  const match =
    /^\/api\/uploads\/((?:accounting|document|branding)-[0-9a-f-]{36})\/([A-Za-z0-9._-]+)$/.exec(
      value,
    );
  if (!match) return null;
  const scope = uploadScopeFromId(match[1]);
  if (
    !scope ||
    (expectedScope && scope !== expectedScope) ||
    match[2] !== safeFilename(match[2]) ||
    !filePolicy(match[2])
  ) {
    return null;
  }
  return match[1];
}

export function isStoredUploadUrl(value: string) {
  return Boolean(storedUploadIdFromUrl(value));
}

export function uploadScopeFromId(id: string): UploadScope | null {
  const match = UPLOAD_ID_PATTERN.exec(id);
  return (match?.[1] as UploadScope | undefined) ?? null;
}

function safeFilename(originalName: string) {
  const normalized = originalName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 140);
  return normalized || "fichier";
}

function filePolicy(filename: string) {
  return FILE_POLICIES[path.extname(filename).toLowerCase()] ?? null;
}

function startsWith(buffer: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function hasExpectedSignature(buffer: Buffer, kind: FileKind) {
  switch (kind) {
    case "pdf":
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    case "jpeg":
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp":
      return (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "zip":
      return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
    case "office":
      return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text":
      return !buffer.subarray(0, 8_192).includes(0);
  }
}

function uploadDirectory(id: string) {
  if (!uploadScopeFromId(id)) {
    throw new HttpError(400, "Identifiant de fichier invalide.");
  }
  const root = uploadsRoot();
  const directory = path.resolve(root, id);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, "Chemin de fichier invalide.");
  }
  return directory;
}

export async function saveUpload(scope: UploadScope, file: File) {
  const filename = safeFilename(file.name);
  const policy = filePolicy(filename);
  if (!policy) {
    throw new HttpError(
      415,
      "Format non pris en charge. Utilisez un PDF, une image ou un document bureautique.",
    );
  }
  if (scope === "branding" && !BRANDING_KINDS.includes(policy.kind)) {
    throw new HttpError(
      415,
      "Le logo doit être une image PNG, JPEG ou WebP.",
    );
  }
  if (file.size <= 0 || file.size > maxUploadBytes()) {
    throw new HttpError(
      413,
      `Le fichier doit faire moins de ${Math.ceil(maxUploadBytes() / 1024 / 1024)} Mo.`,
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedSignature(data, policy.kind)) {
    throw new HttpError(
      415,
      "Le contenu du fichier ne correspond pas à son extension.",
    );
  }

  const id = `${scope}-${randomUUID()}`;
  const directory = uploadDirectory(id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, filename), data, {
    flag: "wx",
    mode: 0o600,
  });

  return {
    id,
    filename,
    contentType: policy.contentType,
    size: file.size,
    url: `/api/uploads/${id}/${filename}`,
  };
}

export async function readUpload(id: string, filename: string) {
  const scope = uploadScopeFromId(id);
  if (!scope || filename !== safeFilename(filename)) {
    throw new HttpError(404, "Fichier introuvable.");
  }
  try {
    const policy = filePolicy(filename);
    if (!policy) throw new HttpError(404, "Fichier introuvable.");
    return {
      scope,
      filename,
      contentType: policy.contentType,
      inline: policy.inline,
      data: await readFile(path.join(uploadDirectory(id), filename)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HttpError(404, "Fichier introuvable.");
    }
    throw error;
  }
}

export async function removeUpload(id: string) {
  if (!uploadScopeFromId(id)) return;
  await rm(uploadDirectory(id), { recursive: true, force: true });
}

export async function cleanupOrphanedUploads(
  referencedUrls: Iterable<string>,
) {
  const referencedIds = new Set<string>();
  for (const url of referencedUrls) {
    const match = /^\/api\/uploads\/([^/]+)\//.exec(url);
    if (match && uploadScopeFromId(match[1])) referencedIds.add(match[1]);
  }

  const configuredHours = Number(process.env.UPLOAD_ORPHAN_MAX_AGE_HOURS);
  const maxAgeHours =
    Number.isFinite(configuredHours) && configuredHours >= 1
      ? configuredHours
      : 24;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1_000;
  const root = uploadsRoot();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries.slice(0, 10_000)) {
    if (
      !entry.isDirectory() ||
      !uploadScopeFromId(entry.name) ||
      referencedIds.has(entry.name)
    ) {
      continue;
    }
    const info = await stat(uploadDirectory(entry.name));
    if (info.mtimeMs > cutoff) continue;
    await removeUpload(entry.name);
    removed += 1;
  }
  return removed;
}
