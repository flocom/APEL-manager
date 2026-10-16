/**
 * Une adresse proposée pendant la frappe (`GET /api/adresses?q=…`), déjà
 * découpée comme les champs des fiches adhérents. Importé des deux côtés.
 */
export type AddressSuggestion = {
  /** Ce que lit la personne dans la liste : « 12 Rue des Lilas, 85100 Les Sables-d'Olonne ». */
  label: string;
  streetNumber: string | null;
  /** La voie, sans le numéro. Null pour un lieu-dit sans nom de voie. */
  street: string | null;
  /** Lieu-dit, quand la proposition en est un (pas de voie). */
  locality: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

export type AddressSearchResponse = { suggestions: AddressSuggestion[] };
