import "server-only";

/**
 * Lecture de l'image publiée dans le registre.
 *
 * C'est l'image — pas le dernier commit — que l'`updater` installe. Interroger
 * GitHub revenait à mesurer autre chose que ce qui allait se produire : entre
 * la fusion et la fin de la construction multi-architecture il s'écoule une
 * dizaine de minutes pendant lesquelles l'écran annonçait une mise à jour que
 * personne ne pouvait installer, et si la construction échouait, il l'annonçait
 * indéfiniment.
 *
 * Le protocole est celui de l'API Registry v2, telle que la parlent GHCR, le
 * Docker Hub et les registres auto-hébergés : une première requête sans jeton,
 * un en-tête `WWW-Authenticate` qui indique où en demander un, puis la même
 * requête avec. Les images publiques n'exigent aucun identifiant.
 */

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const REQUEST_TIMEOUT_MS = 8000;

/** Le registre auquel s'adresse le Docker Hub quand aucun hôte n'est indiqué. */
const DOCKER_HUB = "registry-1.docker.io";

export interface PublishedImage {
  /** SHA du commit ayant produit l'image, tel que gravé par la publication. */
  revision: string;
  /** Nom de version lisible (« main-34 »), quand l'image en porte un. */
  version: string | null;
  /** Date de construction déclarée par l'image. */
  createdAt: string | null;
  reference: string;
}

export type RegistryCheck =
  | { ok: true; image: PublishedImage }
  | { ok: false; error: string };

/** Erreur portant le code renvoyé par le registre, pour pouvoir l'expliquer. */
class RegistryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

interface ImageReference {
  registry: string;
  repository: string;
  tag: string;
}

/**
 * Découpe « ghcr.io/flocom/apel-manager:latest ».
 *
 * Un premier segment n'est un hôte que s'il contient un point, deux-points, ou
 * vaut « localhost » : sans cette règle, « flocom/apel-manager » verrait
 * « flocom » pris pour un registre. C'est la convention de Docker.
 */
export function parseImageReference(reference: string): ImageReference | null {
  const brut = reference.trim();
  if (!brut || brut.includes("@")) return null;

  const segments = brut.split("/");
  const premier = segments[0];
  const aUnHote =
    segments.length > 1 &&
    (premier.includes(".") || premier.includes(":") || premier === "localhost");

  const registry = aUnHote ? premier : DOCKER_HUB;
  let chemin = aUnHote ? segments.slice(1).join("/") : brut;
  // Le Docker Hub range les images sans espace de noms sous « library ».
  if (!aUnHote && !chemin.includes("/")) chemin = `library/${chemin}`;

  const separateur = chemin.lastIndexOf(":");
  const tag = separateur === -1 ? "latest" : chemin.slice(separateur + 1);
  const repository = separateur === -1 ? chemin : chemin.slice(0, separateur);

  if (!repository || !tag) return null;
  return { registry, repository, tag };
}

/** Analyse l'en-tête `WWW-Authenticate` d'un registre v2. */
function defiAuthentification(header: string | null) {
  if (!header || !/^bearer/i.test(header)) return null;
  const champs = Object.fromEntries(
    [...header.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
  return champs.realm ? champs : null;
}

export class RegistryClient {
  private token: string | null = null;

  constructor(private readonly image: ImageReference) {}

  private get base() {
    return `https://${this.image.registry}/v2/${this.image.repository}`;
  }

  /**
   * Requête authentifiée si nécessaire. Le jeton n'est demandé qu'après un
   * premier refus, ce qui laisse fonctionner les registres qui n'en réclament
   * pas, et il n'est demandé qu'une fois par vérification.
   */
  private async get(url: string, accept?: string): Promise<Response> {
    const envoyer = () => {
      const headers: Record<string, string> = {
        "User-Agent": "apel-manager-update-check",
      };
      if (accept) headers.Accept = accept;
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      return fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    };

    const premiere = await envoyer();
    if (premiere.status !== 401) return premiere;

    const defi = defiAuthentification(premiere.headers.get("www-authenticate"));
    if (!defi) return premiere;

    const demande = new URL(defi.realm);
    if (defi.service) demande.searchParams.set("service", defi.service);
    demande.searchParams.set(
      "scope",
      defi.scope ?? `repository:${this.image.repository}:pull`,
    );

    const reponse = await fetch(demande, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!reponse.ok) return premiere;

    const charge = (await reponse.json()) as {
      token?: string;
      access_token?: string;
    };
    this.token = charge.token ?? charge.access_token ?? null;
    if (!this.token) return premiere;

    return envoyer();
  }

  /**
   * Résout le manifeste d'une plateforme concrète. Une image multi-architecture
   * publie un index dont les entrées d'attestation annoncent une plateforme
   * « unknown » : les retenir mènerait à un blob qui n'est pas une
   * configuration d'image.
   */
  private async manifestePlateforme(corps: {
    manifests?: {
      digest: string;
      platform?: { architecture?: string; os?: string };
    }[];
    config?: { digest: string };
  }) {
    if (corps.config) return corps;
    const entrees = (corps.manifests ?? []).filter(
      (m) =>
        m.platform?.architecture &&
        m.platform.architecture !== "unknown" &&
        m.platform.os !== "unknown",
    );
    if (entrees.length === 0) return null;
    const choisi =
      entrees.find(
        (m) =>
          m.platform?.os === "linux" && m.platform?.architecture === "amd64",
      ) ?? entrees[0];

    const reponse = await this.get(
      `${this.base}/manifests/${choisi.digest}`,
      MANIFEST_TYPES,
    );
    if (!reponse.ok) return null;
    return (await reponse.json()) as { config?: { digest: string } };
  }

  async lireImagePubliee(): Promise<PublishedImage | null> {
    const reponse = await this.get(
      `${this.base}/manifests/${this.image.tag}`,
      MANIFEST_TYPES,
    );
    if (!reponse.ok) {
      throw new RegistryError("manifeste refusé", reponse.status);
    }

    const manifeste = await this.manifestePlateforme(await reponse.json());
    if (!manifeste?.config) return null;

    // Le blob de configuration part vers un stockage signé : `fetch` suit la
    // redirection et retire l'en-tête d'autorisation, ce qui est exactement ce
    // qu'attend l'URL signée.
    const config = await this.get(`${this.base}/blobs/${manifeste.config.digest}`);
    if (!config.ok) {
      throw new RegistryError("configuration refusée", config.status);
    }

    const corps = (await config.json()) as {
      config?: { Labels?: Record<string, string>; Env?: string[] };
      created?: string;
    };
    const labels = corps.config?.Labels ?? {};
    const env = Object.fromEntries(
      (corps.config?.Env ?? [])
        .filter((entree) => entree.startsWith("APP_"))
        .map((entree) => {
          const coupe = entree.indexOf("=");
          return [entree.slice(0, coupe), entree.slice(coupe + 1)];
        }),
    );

    const revision =
      labels["org.opencontainers.image.revision"]?.trim() ||
      env.APP_REVISION?.trim() ||
      "";
    if (!revision) return null;

    return {
      revision,
      version:
        env.APP_VERSION?.trim() ||
        labels["org.opencontainers.image.version"]?.trim() ||
        null,
      createdAt:
        env.APP_BUILD_TIME?.trim() ||
        labels["org.opencontainers.image.created"]?.trim() ||
        corps.created ||
        null,
      reference: `${this.image.registry}/${this.image.repository}:${this.image.tag}`,
    };
  }
}

/**
 * Révision de l'image publiée, ou l'explication de l'échec. Ne lève jamais :
 * l'écran des mises à jour doit rester lisible quand le registre ne répond pas.
 */
export async function checkPublishedImage(
  reference: string,
): Promise<RegistryCheck> {
  const image = parseImageReference(reference);
  if (!image) {
    return {
      ok: false,
      error: `Référence d'image illisible : « ${reference} ».`,
    };
  }

  try {
    const publiee = await new RegistryClient(image).lireImagePubliee();
    if (!publiee) {
      return {
        ok: false,
        error:
          "L'image publiée ne porte pas de révision : impossible de la comparer à la version installée.",
      };
    }
    return { ok: true, image: publiee };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, error: "Le registre n'a pas répondu à temps." };
    }
    // Un registre qui répond 404 ou 401 n'est pas injoignable : il est joint,
    // et il refuse. Les confondre enverrait chercher une panne de réseau là où
    // c'est le nom de l'image qui est faux.
    if (error instanceof RegistryError && error.status) {
      const cible = `${image.registry}/${image.repository}:${image.tag}`;
      if (error.status === 404) {
        return {
          ok: false,
          error: `Aucune image « ${cible} » dans le registre. Vérifiez le nom et l'étiquette dans APEL_IMAGE.`,
        };
      }
      if (error.status === 401 || error.status === 403) {
        return {
          ok: false,
          error: `Le registre refuse l'accès à « ${cible} ». Une image privée ne peut pas être consultée sans identifiants ; une image publique répond ainsi lorsqu'elle n'existe pas.`,
        };
      }
      return {
        ok: false,
        error: `Le registre a répondu ${error.status} pour « ${cible} ».`,
      };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Registre injoignable (${error.message}).`
          : "Registre injoignable.",
    };
  }
}
