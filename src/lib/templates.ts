/**
 * Modèles de check-list par défaut, utilisés pour amorcer la base la première
 * fois (bouton « Importer les modèles par défaut »). Une fois importés, les
 * modèles sont stockés en base et entièrement modifiables depuis le tableau de
 * bord (Modèles).
 */

import { emptyToNull } from "@/lib/utils";

export interface TemplateTask {
  title: string;
  leadTimeDays: number;
  description?: string;
}

/** Normalise les tâches d'un modèle (retire les descriptions vides). */
export function normalizeTemplateTasks(
  tasks: { title: string; leadTimeDays: number; description?: string }[],
): TemplateTask[] {
  return tasks.map((t) => {
    const description = emptyToNull(t.description ?? null);
    return description
      ? { title: t.title, leadTimeDays: t.leadTimeDays, description }
      : { title: t.title, leadTimeDays: t.leadTimeDays };
  });
}

export interface DefaultTemplate {
  name: string;
  description: string;
  tasks: TemplateTask[];
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Vide-grenier",
    description: "Organisation d'un vide-grenier / brocante.",
    tasks: [
      { title: "Déclarer la manifestation en mairie", leadTimeDays: 45 },
      { title: "Réserver l'emplacement et le matériel (tables, barrières)", leadTimeDays: 40 },
      { title: "Ouvrir les inscriptions des exposants", leadTimeDays: 35 },
      { title: "Communiquer (affiches, réseaux sociaux, presse locale)", leadTimeDays: 30 },
      { title: "Organiser la buvette et la restauration", leadTimeDays: 21 },
      { title: "Recruter les bénévoles", leadTimeDays: 14 },
      { title: "Préparer le plan des emplacements", leadTimeDays: 7 },
      { title: "Préparer la caisse et la monnaie", leadTimeDays: 2 },
      { title: "Installer le site la veille / le matin", leadTimeDays: 1 },
    ],
  },
  {
    name: "Kermesse",
    description: "Kermesse de fin d'année avec stands et spectacle.",
    tasks: [
      { title: "Définir le thème et les stands", leadTimeDays: 60 },
      { title: "Réserver matériel et structures (chapiteaux, sono)", leadTimeDays: 45 },
      { title: "Préparer les lots de tombola", leadTimeDays: 40 },
      { title: "Organiser le spectacle des enfants avec les enseignants", leadTimeDays: 35 },
      { title: "Communiquer auprès des familles", leadTimeDays: 25 },
      { title: "Recruter les bénévoles pour les stands", leadTimeDays: 21 },
      { title: "Prévoir la buvette et la restauration", leadTimeDays: 14 },
      { title: "Imprimer les tickets et la signalétique", leadTimeDays: 7 },
      { title: "Installer les stands la veille", leadTimeDays: 1 },
    ],
  },
  {
    name: "Journée du Père Noël",
    description: "Venue du Père Noël, goûter et photos.",
    tasks: [
      { title: "Réserver le Père Noël (costume / intervenant)", leadTimeDays: 40 },
      { title: "Commander les cadeaux / friandises", leadTimeDays: 30 },
      { title: "Organiser le goûter (chocolat chaud, gâteaux)", leadTimeDays: 21 },
      { title: "Prévoir le coin photos et la décoration", leadTimeDays: 14 },
      { title: "Informer les familles et recueillir les présences", leadTimeDays: 10 },
      { title: "Recruter les bénévoles", leadTimeDays: 7 },
      { title: "Préparer la salle la veille", leadTimeDays: 1 },
    ],
  },
  {
    name: "Vente (pizzas, gâteaux…)",
    description: "Vente de produits au profit de l'école.",
    tasks: [
      { title: "Choisir le fournisseur et les produits", leadTimeDays: 30 },
      { title: "Fixer les prix et la marge", leadTimeDays: 25 },
      { title: "Préparer et diffuser le bon de commande", leadTimeDays: 21 },
      { title: "Collecter les commandes et les paiements", leadTimeDays: 10 },
      { title: "Passer la commande groupée au fournisseur", leadTimeDays: 7 },
      { title: "Organiser la distribution (créneaux, bénévoles)", leadTimeDays: 3 },
      { title: "Faire le bilan financier", leadTimeDays: 0 },
    ],
  },
  {
    name: "Loto",
    description: "Soirée loto avec lots et restauration.",
    tasks: [
      { title: "Réserver la salle", leadTimeDays: 60 },
      { title: "Constituer les lots (partenaires, dons)", leadTimeDays: 45 },
      { title: "Déclarer le loto en préfecture/mairie si nécessaire", leadTimeDays: 30 },
      { title: "Communiquer et faire la billetterie", leadTimeDays: 21 },
      { title: "Organiser la buvette et la restauration", leadTimeDays: 14 },
      { title: "Préparer le matériel (boulier, grilles, micro)", leadTimeDays: 7 },
      { title: "Installer la salle la veille", leadTimeDays: 1 },
    ],
  },
];
