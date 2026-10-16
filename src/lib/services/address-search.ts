import "server-only";

import type { AddressSuggestion } from "@/lib/address-types";

/**
 * Recherche d'adresses pendant la frappe, sur les données OpenStreetMap.
 *
 * Le service est Photon (komoot), fait pour l'autocomplétion : Nominatim, le
 * moteur officiel d'OpenStreetMap, l'interdit dans ses conditions d'usage.
 * `ADDRESS_SEARCH_URL` désigne une autre instance (la sienne, par exemple) ;
 * `off` coupe la recherche — les champs restent à saisir à la main.
 *
 * Le navigateur ne parle jamais à Photon : la requête passe par
 * `/api/adresses`. La politique de sécurité du site n'a pas à s'ouvrir, la
 * connexion des familles ne part pas chez un tiers, et un cache évite de
 * redemander la même saisie.
 */

const PAR_DEFAUT = "https://photon.komoot.io";
const DELAI_MS = 4000;
const CACHE_MAX = 500;
const CACHE_DUREE_MS = 10 * 60 * 1000;
const SUGGESTIONS_MAX = 6;

const cache = new Map<string, { at: number; value: AddressSuggestion[] }>();

export function addressSearchBaseUrl(): string | null {
  const brut = (process.env.ADDRESS_SEARCH_URL ?? "").trim();
  if (brut.toLowerCase() === "off") return null;
  return (brut || PAR_DEFAUT).replace(/\/+$/, "");
}

type PhotonFeature = {
  properties?: {
    type?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    country?: string;
    countrycode?: string;
  };
};

function texte(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  // Aucun caractère de contrôle ne doit atteindre un champ de fiche.
  const propre = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return propre ? propre.slice(0, max) : null;
}

/** Une proposition Photon, découpée comme une fiche ; null si inutilisable. */
export function suggestionDepuisPhoton(feature: PhotonFeature): AddressSuggestion | null {
  const p = feature.properties ?? {};
  const postalCode = texte(p.postcode, 20);
  const city = texte(p.city, 120) ?? texte(p.district, 120);
  if (!postalCode || !city) return null;

  const type = (p.type ?? "").toLowerCase();
  const nom = texte(p.name);
  let streetNumber: string | null = null;
  let street: string | null = null;
  let locality: string | null = null;

  if (type === "house") {
    streetNumber = texte(p.housenumber, 20);
    street = texte(p.street);
    // Un numéro dans un lieu-dit sans nom de voie : le lieu-dit tient lieu
    // de voie.
    if (!street) locality = texte(p.locality, 120) ?? texte(p.district, 120);
  } else if (type === "street") {
    street = nom ?? texte(p.street);
  } else if (nom && nom !== city) {
    // Hameau, lieu-dit : l'adresse d'une ferme ou d'une maison isolée.
    locality = nom;
  } else {
    // Une ville seule : rien à proposer au-delà du code postal et de la ville,
    // qui ne valent pas une adresse.
    return null;
  }
  if (!street && !locality) return null;

  const ligne = [streetNumber, street ?? locality].filter(Boolean).join(" ");
  const country = texte(p.country, 120);
  return {
    label: `${ligne}, ${postalCode} ${city}${
      country && p.countrycode?.toUpperCase() !== "FR" ? `, ${country}` : ""
    }`,
    streetNumber,
    street,
    locality,
    postalCode,
    city,
    country: p.countrycode?.toUpperCase() === "FR" ? "France" : country,
  };
}

/**
 * Jusqu'à six adresses pour la saisie `query`. Les adresses françaises
 * passent devant : ce sont celles des familles, presque toujours. Une panne
 * du service rend une liste vide — la saisie à la main reste possible.
 */
export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const base = addressSearchBaseUrl();
  const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!base || q.length < 3) return [];

  const cle = q.toLowerCase();
  const enCache = cache.get(cle);
  if (enCache && Date.now() - enCache.at < CACHE_DUREE_MS) return enCache.value;

  const url = new URL("/api/", base);
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "fr");
  url.searchParams.set("limit", "12");
  for (const layer of ["house", "street", "locality"]) {
    url.searchParams.append("layer", layer);
  }

  let features: PhotonFeature[] = [];
  try {
    const reponse = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Les services OpenStreetMap demandent qu'on se présente.
        "User-Agent": `APEL-manager (${process.env.APP_URL?.trim() || "association"})`,
      },
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
    if (!reponse.ok) {
      console.warn(`[adresses] recherche refusée (${reponse.status})`);
      return [];
    }
    const corps = (await reponse.json()) as { features?: unknown };
    features = Array.isArray(corps.features) ? (corps.features as PhotonFeature[]) : [];
  } catch (error) {
    // Ni la saisie ni l'adresse au journal : ce sont des données personnelles.
    console.warn(
      "[adresses] service injoignable :",
      error instanceof Error ? error.name : "erreur",
    );
    return [];
  }

  const vues = new Set<string>();
  const suggestions = features
    .map(suggestionDepuisPhoton)
    .filter((s): s is AddressSuggestion => s !== null)
    .filter((s) => {
      // Photon renvoie souvent plusieurs fois la même adresse (nœud et bâtiment).
      if (vues.has(s.label)) return false;
      vues.add(s.label);
      return true;
    })
    .sort((a, b) => Number(b.country === "France") - Number(a.country === "France"))
    .slice(0, SUGGESTIONS_MAX);

  if (cache.size >= CACHE_MAX) {
    const plusAncienne = cache.keys().next().value;
    if (plusAncienne !== undefined) cache.delete(plusAncienne);
  }
  cache.set(cle, { at: Date.now(), value: suggestions });
  return suggestions;
}
