/**
 * Vues partagées par les écrans de la comptabilité (écritures, catégories,
 * import des relevés). À part des composants pour qu'ils puissent s'importer
 * les uns les autres sans dépendance circulaire.
 */

export type AccountingEntryType = "income" | "expense";

export interface AccountingCategoryView {
  id: string;
  name: string;
  type: AccountingEntryType;
  description: string | null;
  isActive: boolean;
  /** Écritures rattachées, tous statuts : ce qui empêche la suppression. */
  entryCount: number;
  /** Total des écritures validées de la catégorie. */
  postedTotalCents: number;
}

export interface AccountingEventView {
  id: string;
  title: string;
  startAt: string;
}

/** Réponse des routes de catégorie (création, modification). */
export interface AccountingCategoryPayload {
  id: string;
  name: string;
  type: AccountingEntryType;
  description: string | null;
  isActive: boolean;
}

/**
 * Fusionne une catégorie renvoyée par le serveur dans la liste locale : la
 * catégorie créée apparaît aussitôt dans les listes déroulantes, sans attendre
 * le rechargement de la page (qui la ramènera de toute façon).
 */
export function upsertCategory(
  list: AccountingCategoryView[],
  category: AccountingCategoryPayload,
): AccountingCategoryView[] {
  // Champs repris un à un : la route renvoie la ligne entière (dates…).
  const fields = {
    id: category.id,
    name: category.name,
    type: category.type,
    description: category.description,
    isActive: category.isActive,
  };
  if (list.some((item) => item.id === category.id)) {
    return list.map((item) =>
      item.id === category.id ? { ...item, ...fields } : item,
    );
  }
  return [...list, { ...fields, entryCount: 0, postedTotalCents: 0 }].sort(
    (left, right) => left.name.localeCompare(right.name, "fr"),
  );
}
