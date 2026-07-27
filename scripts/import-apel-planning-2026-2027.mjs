import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL est requis.");
}

const sql = neon(databaseUrl);

const UNIT_IN_DAYS = {
  days: 1,
  weeks: 7,
  months: 30,
};

function task(title, leadTimeValue, leadTimeUnit, description) {
  return {
    title,
    leadTimeDays: leadTimeValue * UNIT_IN_DAYS[leadTimeUnit],
    leadTimeValue,
    leadTimeUnit,
    ...(description ? { description } : {}),
  };
}

const templates = [
  {
    name: "Vide-grenier",
    description:
      "Organisation du vide-grenier APEL avant les vacances de la Toussaint, de préférence un dimanche à la salle Audubon.",
    tasks: [
      task(
        "Valider la date et la salle Audubon",
        6,
        "months",
        "Privilégier un dimanche avant les vacances de la Toussaint. La proximité du marché d’Audubon peut attirer des visiteurs supplémentaires.",
      ),
      task(
        "Réserver la salle pour deux jours",
        6,
        "months",
        "Réserver la veille pour l’installation et le jour de l’événement pour l’accueil du public.",
      ),
      task(
        "Confirmer la capacité et le format des tables",
        4,
        "months",
        "Obtenir le nombre exact de tables disponibles et leur format. À Audubon, compter environ 1,80 m par table.",
      ),
      task(
        "Définir les règles pour les portants",
        3,
        "months",
        "Accepter les portants, mais prévoir l’achat d’une table supplémentaire si un portant occupe l’équivalent d’un emplacement de table.",
      ),
      task(
        "Préparer les supports de communication",
        2,
        "months",
        "Préparer les affiches, les publications Facebook et une séquence de deux e-mails.",
      ),
      task(
        "Lancer les affiches, Facebook et le premier e-mail",
        6,
        "weeks",
        "Diffuser la première vague de communication et ouvrir les inscriptions.",
      ),
      task(
        "Envoyer le second e-mail de relance",
        2,
        "weeks",
        "Relancer les familles et les exposants avec les dernières informations pratiques.",
      ),
      task(
        "Définir l’offre snack",
        1,
        "months",
        "Prévoir du sucré et des boissons sans alcool : sodas, thé et café. Éviter les sandwichs, qui génèrent trop de pertes pour une faible demande.",
      ),
      task(
        "Solliciter des gâteaux auprès des familles",
        3,
        "weeks",
        "Demander aux familles de contribuer au stand sucré avec des gâteaux.",
      ),
      task(
        "Acheter les boissons et consommables",
        1,
        "weeks",
        "Préparer les softs, le thé, le café, les gobelets, serviettes et consommables du snack.",
      ),
      task(
        "Préparer la salle et les emplacements",
        1,
        "days",
        "Installer les tables et matérialiser les emplacements la veille de l’événement.",
      ),
    ],
  },
  {
    name: "Vente de gâteaux Bijou & locale",
    description:
      "Vente de gâteaux avec une offre Bijou complétée progressivement par des produits locaux pour augmenter la marge et soutenir les producteurs du territoire.",
    tasks: [
      task(
        "Contacter Bijou en début d’année scolaire",
        3,
        "months",
        "Demander si l’école bénéficie d’une promotion cette année ; les promotions tournent entre les écoles d’une année à l’autre.",
      ),
      task(
        "Récupérer le catalogue et les produits de l’année",
        3,
        "months",
        "Télécharger ou demander la gamme annuelle disponible sur le site de Bijou.",
      ),
      task(
        "Rechercher un fournisseur local complémentaire",
        4,
        "months",
        "Identifier un vendeur local permettant de mixer l’offre Bijou avec des produits locaux. Objectif à terme : réduire la dépendance à Bijou et augmenter le bénéfice.",
      ),
      task(
        "Construire l’offre mixte et calculer les marges",
        10,
        "weeks",
        "Sélectionner les références Bijou et locales, fixer les prix et vérifier la marge attendue.",
      ),
      task(
        "Préparer les supports de communication",
        2,
        "months",
        "Préparer les affiches, les publications Facebook et une séquence de deux e-mails.",
      ),
      task(
        "Ouvrir les commandes",
        6,
        "weeks",
        "Diffuser l’offre et le bon de commande aux familles.",
      ),
      task(
        "Envoyer la relance et clôturer les commandes",
        3,
        "weeks",
        "Envoyer le second e-mail, consolider les quantités et transmettre la commande aux fournisseurs.",
      ),
      task(
        "Organiser le déchargement",
        1,
        "weeks",
        "Prévoir une ou deux personnes pour aider le livreur à décharger.",
      ),
      task(
        "Organiser le dispatch des produits",
        1,
        "weeks",
        "Prévoir deux à trois personnes maximum pour trier et distribuer efficacement les commandes.",
      ),
    ],
  },
  {
    name: "Vente de sapins de Noël",
    description:
      "Partenariat avec Botanic au Château-d’Olonne. L’opération a généré environ 200 € de bénéfice en 2025.",
    tasks: [
      task(
        "Renouveler le partenariat avec Botanic",
        3,
        "months",
        "Contacter Botanic au Château-d’Olonne et confirmer le fonctionnement, les dates, les bons et la rémunération de l’APEL.",
      ),
      task(
        "Valider les règles de vente",
        2,
        "months",
        "Formaliser un parcours uniquement par bons. Ne pas organiser de vente directe sur place afin d’éviter les erreurs récurrentes.",
      ),
      task(
        "Préparer les bons de commande",
        1,
        "months",
        "Vérifier les informations pratiques, les références de sapins et le mécanisme d’attribution du bénéfice.",
      ),
      task(
        "Distribuer les bons mi-novembre",
        3,
        "weeks",
        "Remettre les bons aux familles vers la mi-novembre et expliquer clairement le retrait chez Botanic.",
      ),
      task(
        "Relancer les familles",
        1,
        "weeks",
        "Effectuer une relance courte sans mettre en place de vente manuelle sur site.",
      ),
      task(
        "Faire le bilan de l’opération",
        0,
        "days",
        "Comparer les ventes et le bénéfice au repère 2025 d’environ 200 €.",
      ),
    ],
  },
  {
    name: "Vente de saucissons",
    description:
      "Vente de saucissons avec une offre attractive, historiquement positionnée à 10 € les quatre, et recherche d’un fournisseur plus coopératif.",
    tasks: [
      task(
        "Identifier un nouveau fournisseur",
        3,
        "months",
        "Rechercher une alternative au Verger de Vendée, qui ne propose pas de tarif préférentiel adapté à l’opération.",
      ),
      task(
        "Négocier les tarifs et vérifier la marge",
        2,
        "months",
        "Comparer les conditions fournisseurs et tester la viabilité du repère commercial de 10 € les quatre saucissons.",
      ),
      task(
        "Sélectionner les goûts",
        6,
        "weeks",
        "Conserver une gamme de goûts très attractive, identifiée comme un point fort de la vente.",
      ),
      task(
        "Préparer et lancer la communication",
        1,
        "months",
        "Préparer les supports et communiquer un mois avant la distribution.",
      ),
      task(
        "Consolider les commandes",
        2,
        "weeks",
        "Totaliser les quantités, confirmer la commande fournisseur et préparer le plan de dispatch.",
      ),
      task(
        "Mobiliser deux à trois personnes",
        1,
        "weeks",
        "Prévoir deux à trois bénévoles pour réceptionner, trier et distribuer les saucissons.",
      ),
    ],
  },
  {
    name: "Boom de l’APEL",
    description:
      "Boom familiale au Stella avec décoration, bar, animations récurrentes et concours de déguisements.",
    tasks: [
      task(
        "Réserver le Stella",
        6,
        "months",
        "Réserver la salle suffisamment tôt et confirmer les horaires d’accès pour la préparation du matin.",
      ),
      task(
        "Préparer l’identité « Boom » du Stella",
        2,
        "months",
        "Définir la signalétique et les éléments visuels qui transforment clairement le lieu pour la boom.",
      ),
      task(
        "Demander l’autorisation de débit de boissons",
        2,
        "months",
        "Déposer auprès de la mairie la demande nécessaire pour servir de la bière pendant l’événement.",
      ),
      task(
        "Réserver les fûts auprès de la Cervoiserie",
        1,
        "months",
        "Prévoir une petite réservation : les commandes de bière restent limitées.",
      ),
      task(
        "Préparer les supports de communication",
        2,
        "months",
        "Préparer les affiches, les publications Facebook et une séquence de deux e-mails.",
      ),
      task(
        "Recruter les bénévoles",
        1,
        "months",
        "Prévoir au moins cinq personnes le matin, puis cinq à sept personnes l’après-midi pour la caisse, le bar et l’animation.",
      ),
      task(
        "Construire le fil rouge d’animation",
        1,
        "months",
        "Prévoir toutes les 1 h 30 à 2 h une chanson accompagnée d’une chorégraphie.",
      ),
      task(
        "Organiser les concours de déguisements",
        1,
        "months",
        "Prévoir un concours enfant et un concours adulte, avec un lot distinct pour chaque gagnant.",
      ),
      task(
        "Inventorier et compléter la décoration",
        1,
        "months",
        "Prévoir : ballons au sol, souffleur, guirlandes fanions de 10 m, gros ballons NDF à l’entrée et rideau de franges à l’entrée de la salle.",
      ),
      task(
        "Solliciter les gâteaux des familles",
        3,
        "weeks",
        "Intégrer la demande de gâteaux à la communication destinée aux familles.",
      ),
      task(
        "Faire les courses",
        2,
        "weeks",
        "Finaliser les quantités pour le bar, le goûter, les consommables, les lots et la décoration.",
      ),
      task(
        "Préparer la playlist hors ligne",
        1,
        "weeks",
        "Utiliser l’IA pour proposer la playlist, effectuer une vérification humaine, la télécharger en local et couper le Wi-Fi pendant la diffusion pour éviter les ajouts automatiques.",
      ),
      task(
        "Installer la salle",
        0,
        "days",
        "Mobiliser l’équipe du matin pour la décoration, le bar, la caisse et les tests audio.",
      ),
    ],
  },
  {
    name: "Kermesse",
    description:
      "Kermesse de fin d’année de Notre-Dame des Flots, enrichie des retours d’expérience 2026.",
    tasks: [
      task(
        "Lancer la prospection des lots",
        6,
        "months",
        "Démarcher instituts de beauté et Rituals, boulangeries, JouéClub, hôtels dont Roche Noire, opticiens et boutiques du centre-ville pour des lots ou bons de réduction.",
      ),
      task(
        "Réserver le photobooth",
        6,
        "months",
        "Le photobooth a très bien fonctionné ; le réserver six mois à l’avance.",
      ),
      task(
        "Réserver le tir laser biathlon",
        6,
        "months",
        "Étudier et réserver une animation de tir laser biathlon, par exemple auprès d’Archipel Événement.",
      ),
      task(
        "Réserver le château gonflable",
        4,
        "months",
        "Prévoir un modèle adapté aux plus petits ; cette animation a très bien fonctionné.",
      ),
      task(
        "Confirmer le glacier O’Kiosk",
        3,
        "months",
        "Renouveler si possible l’opération. Repère 2026 : environ 800 € de chiffre d’affaires pour le glacier et 100 € reversés à l’APEL.",
      ),
      task(
        "Créer la billetterie repas HelloAsso",
        2,
        "months",
        "Créer la campagne HelloAsso et le parcours de réservation des repas.",
      ),
      task(
        "Préparer la pêche à la ligne",
        2,
        "months",
        "Prévoir environ 700 € d’achats chez Action. Favoriser les petits avions à monter, pistolets à eau et bulles. Éviter les sifflets déroulants et les balles avec bracelet. Cibler surtout les plus jeunes.",
      ),
      task(
        "Préparer les jeux et animations",
        2,
        "months",
        "Prévoir chamboule-tout avec de vraies boîtes, château gonflable petits, corn hole, popcorn et autres stands. Éviter le chamboule-tout avec personnages, moins apprécié.",
      ),
      task(
        "Organiser les enveloppes et tickets numérotés",
        2,
        "months",
        "Confier si possible le pilotage des enveloppes à une personne dédiée, définir un créneau d’une heure et prévoir des tickets numérotés. Repère 2026 : environ 250 enveloppes vendues.",
      ),
      task(
        "Prévoir deux TPE",
        1,
        "months",
        "Vérifier la disponibilité, la charge, la connexion et les comptes associés aux deux terminaux de paiement.",
      ),
      task(
        "Doubler la quantité de jetons",
        1,
        "months",
        "Commander ou préparer deux fois plus de jetons que lors de l’édition précédente.",
      ),
      task(
        "Finaliser les horaires des stands",
        1,
        "months",
        "Maintenir les stands jusqu’à 13 h le matin et organiser une pause de 13 h à 14 h 45.",
      ),
      task(
        "Préparer l’appel aux volontaires",
        1,
        "months",
        "Demander des volontaires pour les gâteaux, le montage, le démontage et le prêt de barnums.",
      ),
      task(
        "Préparer l’affichage des résultats",
        1,
        "months",
        "Imprimer les résultats des enveloppes en double ou en triple afin qu’ils restent visibles à plusieurs endroits.",
      ),
      task(
        "Ajuster le candy bar",
        1,
        "months",
        "Acheter des sachets de bonbons déjà préparés et conserver les invendus pour le vide-grenier ; la demande pendant la kermesse est faible.",
      ),
      task(
        "Centraliser les courses chez Promocash",
        2,
        "weeks",
        "Acheter auprès d’un seul fournisseur pour simplifier la logistique, notamment le fromage pour les adultes et les boissons pour les enfants.",
      ),
      task(
        "Préparer le popcorn et les consommables",
        1,
        "weeks",
        "Reconduire le stand popcorn et vérifier les stocks, contenants et branchements nécessaires.",
      ),
    ],
  },
  {
    name: "Venue du Père Noël",
    description:
      "Venue du Père Noël à l’école avec chocolats et prises de parole courtes dans chaque classe.",
    tasks: [
      task(
        "Trouver le Père Noël",
        3,
        "months",
        "Identifier et confirmer la personne qui incarnera le Père Noël, ainsi que le costume et les disponibilités.",
      ),
      task(
        "Demander des lots de chocolats",
        2,
        "months",
        "Solliciter Super U et E.Leclerc pour obtenir des dons ou lots de chocolats.",
      ),
      task(
        "Planifier le passage dans les classes",
        1,
        "months",
        "Coordonner un ordre de passage fluide avec l’équipe enseignante.",
      ),
      task(
        "Préparer les discours",
        2,
        "weeks",
        "Rédiger un discours court et adapté pour chaque classe.",
      ),
      task(
        "Préparer les chocolats et le costume",
        1,
        "days",
        "Répartir les lots par classe et vérifier tous les accessoires avant la venue.",
      ),
    ],
  },
  {
    name: "Loto",
    description:
      "Loto organisé avec le prestataire AIO, avec un objectif indicatif de 50 % de bénéfice sur le chiffre d’affaires.",
    tasks: [
      task(
        "Contacter le prestataire AIO",
        6,
        "months",
        "Confirmer les disponibilités, la formule, le matériel inclus, les contraintes et les conditions financières.",
      ),
      task(
        "Réserver la salle",
        4,
        "months",
        "Choisir une salle adaptée à la jauge visée et confirmer les horaires d’installation et de rangement.",
      ),
      task(
        "Valider le budget et l’objectif de marge",
        3,
        "months",
        "Construire le budget prévisionnel et tester l’objectif de 50 % de bénéfice sur le chiffre d’affaires.",
      ),
      task(
        "Constituer les lots",
        3,
        "months",
        "Utiliser la trame de prospection des lots et compléter par les lots éventuellement fournis par AIO.",
      ),
      task(
        "Préparer la communication et la billetterie",
        2,
        "months",
        "Préparer les affiches, les réseaux sociaux, les e-mails et le parcours de réservation.",
      ),
      task(
        "Organiser les bénévoles et la logistique",
        1,
        "months",
        "Répartir l’accueil, la caisse, le contrôle, la buvette et le rangement.",
      ),
      task(
        "Confirmer le déroulé avec AIO",
        1,
        "weeks",
        "Valider les horaires, le matériel, l’animateur, les lots et les derniers besoins techniques.",
      ),
    ],
  },
  {
    name: "Pizza Les Chardons",
    description:
      "Vente à reconduire seulement si une proposition de valeur convaincante peut enrayer la baisse des commandes.",
    tasks: [
      task(
        "Décider si l’opération doit être reconduite",
        3,
        "months",
        "Analyser les ventes précédentes et la baisse de la demande avant de confirmer l’événement.",
      ),
      task(
        "Définir un argument fort pour les parents",
        2,
        "months",
        "Construire une vraie raison d’acheter : nouveauté, prix, formule, produit exclusif ou bénéfice concret pour l’école.",
      ),
      task(
        "Négocier l’offre avec Les Chardons",
        2,
        "months",
        "Valider les références, les tarifs, la marge, les quantités minimales et la logistique.",
      ),
      task(
        "Préparer la communication",
        1,
        "months",
        "Présenter clairement l’argument choisi et simplifier le bon de commande.",
      ),
      task(
        "Clôturer et transmettre les commandes",
        2,
        "weeks",
        "Consolider les quantités et confirmer la commande au partenaire.",
      ),
      task(
        "Organiser la distribution",
        1,
        "weeks",
        "Prévoir le stockage, les créneaux et les bénévoles nécessaires.",
      ),
    ],
  },
  {
    name: "Prospection de lots",
    description:
      "Trame réutilisable pour constituer les lots de la kermesse, du loto et des autres opérations APEL.",
    tasks: [
      task(
        "Définir la liste des lots et la contrepartie proposée",
        6,
        "months",
        "Préparer un message de sollicitation court, la présentation de l’APEL et les contreparties de visibilité.",
      ),
      task(
        "Contacter les instituts de beauté et Rituals",
        6,
        "months",
        "Demander des produits, coffrets ou bons cadeaux.",
      ),
      task(
        "Contacter les boulangeries",
        6,
        "months",
        "Demander des bons d’achat, produits ou lots.",
      ),
      task(
        "Contacter JouéClub",
        6,
        "months",
        "Solliciter des jeux, jouets ou bons d’achat.",
      ),
      task(
        "Contacter les hôtels",
        6,
        "months",
        "Solliciter notamment l’Hôtel Roche Noire et d’autres établissements locaux pour des nuits, petits-déjeuners ou prestations.",
      ),
      task(
        "Contacter les opticiens",
        6,
        "months",
        "Demander des accessoires, bons ou participations aux lots.",
      ),
      task(
        "Prospecter les boutiques du centre-ville",
        6,
        "months",
        "Demander des produits et bons de réduction auprès des commerçants.",
      ),
      task(
        "Relancer les partenaires",
        4,
        "months",
        "Effectuer une relance ciblée et suivre les réponses dans un tableau unique.",
      ),
      task(
        "Inventorier et valoriser les lots",
        1,
        "months",
        "Centraliser les dons, estimer leur valeur et les répartir entre les différentes animations.",
      ),
    ],
  },
];

const eventsToImport = [
  {
    title: "Vide-grenier",
    startAt: "2026-10-11T09:00:00+02:00",
    endAt: "2026-10-11T18:00:00+02:00",
    location: "Salle Audubon, Les Sables-d’Olonne",
    template: "Vide-grenier",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Dimanche précédant les vacances de la Toussaint, qui commencent le 17 octobre 2026 dans l’académie de Nantes. Réserver également la salle le samedi 10 octobre pour l’installation. La proximité du marché du dimanche à Audubon peut attirer des visiteurs.",
  },
  {
    title: "Vente de sapins de Noël",
    startAt: "2026-12-05T09:00:00+01:00",
    endAt: "2026-12-05T18:00:00+01:00",
    location: "Botanic, Château-d’Olonne",
    template: "Vente de sapins de Noël",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Opération par bons en partenariat avec Botanic. Ne pas organiser de vente directe sur place. Repère 2025 : environ 200 € de bénéfice.",
  },
  {
    title: "Vente de gâteaux Bijou & locale",
    startAt: "2026-12-11T16:30:00+01:00",
    endAt: "2026-12-11T19:00:00+01:00",
    location: "École Notre-Dame des Flots",
    template: "Vente de gâteaux Bijou & locale",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Distribution d’une offre Bijou complétée, si possible, par un producteur local afin d’augmenter la marge et d’acheter local.",
    slots: [
      {
        title: "Aide au déchargement",
        description: "Aider le livreur à décharger et contrôler les colis.",
        startAt: "2026-12-11T15:30:00+01:00",
        endAt: "2026-12-11T16:30:00+01:00",
        capacity: 2,
      },
      {
        title: "Dispatch des commandes",
        description: "Trier les produits et remettre les commandes aux familles.",
        startAt: "2026-12-11T16:15:00+01:00",
        endAt: "2026-12-11T19:00:00+01:00",
        capacity: 3,
      },
    ],
  },
  {
    title: "Venue du Père Noël",
    startAt: "2026-12-18T09:00:00+01:00",
    endAt: "2026-12-18T12:00:00+01:00",
    location: "École Notre-Dame des Flots",
    template: "Venue du Père Noël",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Dernier vendredi avant les vacances de Noël : passage du Père Noël dans les classes, chocolats et discours courts.",
  },
  {
    title: "Loto",
    startAt: "2027-01-30T19:00:00+01:00",
    endAt: "2027-01-30T23:30:00+01:00",
    location: "Lieu à confirmer",
    template: "Loto",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Organisation avec le prestataire AIO. Objectif indicatif : 50 % de bénéfice sur le chiffre d’affaires.",
  },
  {
    title: "Vente de saucissons",
    startAt: "2027-02-12T16:30:00+01:00",
    endAt: "2027-02-12T19:00:00+01:00",
    location: "École Notre-Dame des Flots",
    template: "Vente de saucissons",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Distribution d’une offre attractive de saucissons, avec recherche d’un fournisseur plus favorable. Repère commercial historique : 10 € les quatre.",
    slots: [
      {
        title: "Réception et distribution des saucissons",
        description: "Réceptionner, trier et distribuer les commandes.",
        startAt: "2027-02-12T15:45:00+01:00",
        endAt: "2027-02-12T19:00:00+01:00",
        capacity: 3,
      },
    ],
  },
  {
    title: "Boom de l’APEL",
    startAt: "2027-02-13T14:00:00+01:00",
    endAt: "2027-02-13T20:00:00+01:00",
    location: "Le Stella",
    template: "Boom de l’APEL",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Boom familiale avec bar, décoration complète, concours de déguisements enfant et adulte, et animation fil rouge.",
    slots: [
      {
        title: "Préparation de la salle",
        description: "Décoration, installation du bar et de la caisse, tests audio.",
        startAt: "2027-02-13T09:00:00+01:00",
        endAt: "2027-02-13T13:00:00+01:00",
        capacity: 5,
      },
      {
        title: "Caisse, bar et animation",
        description: "Assurer la caisse, le bar, l’accueil et les animations.",
        startAt: "2027-02-13T13:30:00+01:00",
        endAt: "2027-02-13T20:30:00+01:00",
        capacity: 7,
      },
    ],
  },
  {
    title: "Pizza Les Chardons",
    startAt: "2027-05-07T16:30:00+02:00",
    endAt: "2027-05-07T19:00:00+02:00",
    location: "École Notre-Dame des Flots",
    template: "Pizza Les Chardons",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Événement volontairement laissé en brouillon : la demande baisse et l’opération ne doit être reconduite qu’avec un argument réellement convaincant pour les parents.",
  },
  {
    title: "Kermesse",
    startAt: "2027-06-27T10:00:00+02:00",
    endAt: "2027-06-27T18:00:00+02:00",
    location: "École Notre-Dame des Flots",
    template: "Kermesse",
    description:
      "DATE PROPOSÉE — À CONFIRMER. Édition 2027 préparée à partir des retours 2026 : deux TPE, davantage de jetons, stands jusqu’à 13 h, pause 13 h–14 h 45, photobooth, pêche à la ligne, château gonflable, corn hole, glacier, popcorn et tir laser biathlon.",
  },
];

function normalize(value) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function sameInstant(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function dueAt(startAt, leadTimeDays) {
  return new Date(
    new Date(startAt).getTime() - leadTimeDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}

async function addAudit(actorUserId, action, entityType, entityId, details) {
  await sql`
    insert into audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      source,
      details
    )
    values (
      ${actorUserId},
      ${action},
      ${entityType},
      ${entityId},
      'web',
      ${JSON.stringify(details)}::jsonb
    )
  `;
}

const [actor] = await sql`
  select id
  from users
  where role in ('admin', 'manager')
  order by case when role = 'admin' then 0 else 1 end, created_at
  limit 1
`;
const actorUserId = actor?.id ?? null;

const existingTemplates = await sql`
  select id, name, version
  from checklist_templates
  order by created_at
`;
const existingEvents = await sql`
  select id, title, start_at
  from events
  order by created_at
`;

if (process.argv.includes("--verify")) {
  const plannedTemplates = existingTemplates.filter((item) =>
    templates.some((template) => normalize(template.name) === normalize(item.name)),
  );
  const plannedEvents = existingEvents.filter((item) =>
    eventsToImport.some(
      (event) =>
        normalize(event.title) === normalize(item.title) &&
        sameInstant(event.startAt, item.start_at),
    ),
  );
  const taskCounts = await sql`
    select event_id, count(*)::int as count
    from tasks
    group by event_id
  `;
  const slotCounts = await sql`
    select event_id, count(*)::int as count
    from volunteer_slots
    group by event_id
  `;
  const taskCountByEvent = new Map(
    taskCounts.map((item) => [item.event_id, Number(item.count)]),
  );
  const slotCountByEvent = new Map(
    slotCounts.map((item) => [item.event_id, Number(item.count)]),
  );
  const duplicateTemplateNames = Object.entries(
    existingTemplates.reduce((counts, item) => {
      const key = normalize(item.name);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  ).filter(([, count]) => count > 1);
  const duplicatePlannedEvents = eventsToImport.filter((event) => {
    const count = existingEvents.filter(
      (item) =>
        normalize(event.title) === normalize(item.title) &&
        sameInstant(event.startAt, item.start_at),
    ).length;
    return count > 1;
  });

  console.log(
    JSON.stringify(
      {
        templatesExpected: templates.length,
        templatesMatched: plannedTemplates.length,
        eventsExpected: eventsToImport.length,
        eventsMatched: plannedEvents.length,
        tasksMatched: plannedEvents.reduce(
          (sum, event) => sum + (taskCountByEvent.get(event.id) ?? 0),
          0,
        ),
        slotsMatched: plannedEvents.reduce(
          (sum, event) => sum + (slotCountByEvent.get(event.id) ?? 0),
          0,
        ),
        duplicateTemplateNames,
        duplicatePlannedEvents: duplicatePlannedEvents.map(
          (event) => `${event.title} — ${event.startAt}`,
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

for (const template of templates) {
  const matches = existingTemplates.filter(
    (item) => normalize(item.name) === normalize(template.name),
  );
  if (matches.length > 1) {
    throw new Error(
      `Import arrêté : plusieurs modèles portent le nom « ${template.name} ».`,
    );
  }
}

for (const event of eventsToImport) {
  const matches = existingEvents.filter(
    (item) =>
      normalize(item.title) === normalize(event.title) &&
      sameInstant(item.start_at, event.startAt),
  );
  if (matches.length > 1) {
    throw new Error(
      `Import arrêté : plusieurs événements correspondent à « ${event.title} » le ${event.startAt}.`,
    );
  }
}

const templateIds = new Map();
let templatesCreated = 0;
let templatesUpdated = 0;

for (const template of templates) {
  const match = existingTemplates.find(
    (item) => normalize(item.name) === normalize(template.name),
  );
  let templateId;

  if (match) {
    const [updated] = await sql`
      update checklist_templates
      set
        name = ${template.name},
        description = ${template.description},
        tasks = ${JSON.stringify(template.tasks)}::jsonb,
        version = version + 1
      where id = ${match.id}
      returning id
    `;
    templateId = updated.id;
    templatesUpdated += 1;
    await addAudit(
      actorUserId,
      "template.import_update",
      "checklist_template",
      templateId,
      { source: "Notes APEL 2026-2027", taskCount: template.tasks.length },
    );
  } else {
    const [created] = await sql`
      insert into checklist_templates (name, description, tasks)
      values (
        ${template.name},
        ${template.description},
        ${JSON.stringify(template.tasks)}::jsonb
      )
      returning id
    `;
    templateId = created.id;
    templatesCreated += 1;
    await addAudit(
      actorUserId,
      "template.import_create",
      "checklist_template",
      templateId,
      { source: "Notes APEL 2026-2027", taskCount: template.tasks.length },
    );
  }

  templateIds.set(template.name, templateId);
}

let eventsCreated = 0;
let eventsReused = 0;
let tasksCreated = 0;
let slotsCreated = 0;
const eventResults = [];

for (const event of eventsToImport) {
  let current = existingEvents.find(
    (item) =>
      normalize(item.title) === normalize(event.title) &&
      sameInstant(item.start_at, event.startAt),
  );

  if (!current) {
    const [created] = await sql`
      insert into events (
        title,
        description,
        location,
        start_at,
        end_at,
        status,
        share_token,
        created_by
      )
      values (
        ${event.title},
        ${event.description},
        ${event.location},
        ${event.startAt}::timestamptz,
        ${event.endAt}::timestamptz,
        'draft',
        ${randomBytes(12).toString("base64url")},
        ${actorUserId}
      )
      returning id, title, start_at
    `;
    current = created;
    existingEvents.push(created);
    eventsCreated += 1;
    await addAudit(actorUserId, "event.import_create", "event", current.id, {
      source: "Notes APEL 2026-2027",
      proposedDate: true,
      status: "draft",
    });
  } else {
    eventsReused += 1;
  }

  const template = templates.find((item) => item.name === event.template);
  if (!template || !templateIds.has(event.template)) {
    throw new Error(`Modèle introuvable pour « ${event.title} ».`);
  }

  const currentTasks = await sql`
    select title
    from tasks
    where event_id = ${current.id}
  `;
  const currentTaskNames = new Set(
    currentTasks.map((item) => normalize(item.title)),
  );

  for (const [position, item] of template.tasks.entries()) {
    if (currentTaskNames.has(normalize(item.title))) continue;

    await sql`
      insert into tasks (
        event_id,
        title,
        description,
        lead_time_days,
        lead_time_value,
        lead_time_unit,
        due_at,
        position
      )
      values (
        ${current.id},
        ${item.title},
        ${item.description ?? null},
        ${item.leadTimeDays},
        ${item.leadTimeValue},
        ${item.leadTimeUnit}::task_lead_time_unit,
        ${dueAt(event.startAt, item.leadTimeDays)}::timestamptz,
        ${position}
      )
    `;
    tasksCreated += 1;
  }

  if (event.slots) {
    const currentSlots = await sql`
      select title
      from volunteer_slots
      where event_id = ${current.id}
    `;
    const currentSlotNames = new Set(
      currentSlots.map((item) => normalize(item.title)),
    );

    for (const slot of event.slots) {
      if (currentSlotNames.has(normalize(slot.title))) continue;

      await sql`
        insert into volunteer_slots (
          event_id,
          title,
          description,
          start_at,
          end_at,
          capacity
        )
        values (
          ${current.id},
          ${slot.title},
          ${slot.description},
          ${slot.startAt}::timestamptz,
          ${slot.endAt}::timestamptz,
          ${slot.capacity}
        )
      `;
      slotsCreated += 1;
    }
  }

  const [{ count: eventTaskCount }] = await sql`
    select count(*)::int as count
    from tasks
    where event_id = ${current.id}
  `;
  eventResults.push({
    title: event.title,
    startAt: new Date(event.startAt).toISOString(),
    taskCount: Number(eventTaskCount),
  });
}

await addAudit(actorUserId, "planning.import_complete", "planning", null, {
  schoolYear: "2026-2027",
  templatesCreated,
  templatesUpdated,
  eventsCreated,
  eventsReused,
  tasksCreated,
  slotsCreated,
});

console.log(
  JSON.stringify(
    {
      templatesCreated,
      templatesUpdated,
      eventsCreated,
      eventsReused,
      tasksCreated,
      slotsCreated,
      events: eventResults,
    },
    null,
    2,
  ),
);
