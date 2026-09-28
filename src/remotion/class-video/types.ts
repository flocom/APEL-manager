/**
 * Contrat entre l'éditeur (src/components/communication/…) et la composition
 * Remotion de la vidéo de présentation de l'APEL aux parents.
 *
 * Elle s'appelait d'abord « vidéo des classes » : les noms de code
 * (`class-video`, `ClassVideo`, `video_classes` en base) sont restés, pour ne
 * pas perdre ce qui a déjà été enregistré.
 *
 * Tout ce que la vidéo affiche arrive par ces props : la composition ne lit
 * jamais la base ni l'API. C'est ce qui permet de la prévisualiser dans le
 * Player et de l'exporter dans le navigateur (renderMediaOnWeb) avec
 * exactement les mêmes données.
 */

/** Couleurs tirées du logo de l'école, ou palette par défaut sans logo. */
export type VideoPalette = {
  /** Couleur dominante du logo : fonds principaux. */
  primary: string;
  /** Seconde couleur du logo : formes, rubans. */
  secondary: string;
  /** Couleur vive pour les accents (chiffres, étincelles). */
  accent: string;
  /** Teinte très foncée dérivée de primary : texte sur fond clair. */
  dark: string;
  /** Teinte très claire dérivée de primary : fonds doux. */
  light: string;
};

export type VoiceClip = {
  /** Fichier audio (mp3) servi par /api/uploads/media-…, ou blob: en local. */
  url: string;
  durationInSeconds: number;
};

/**
 * Ordre et identité des scènes, sur le fil de la présentation qu'un parent du
 * bureau fait en réunion de rentrée :
 * - intro : l'accroche (« L'APEL, c'est nous. Et ça peut être vous. ») ;
 * - apel : qui nous sommes (des parents bénévoles, des temps forts) ;
 * - agenda : les rendez-vous de l'année, le prochain en tête ;
 * - site : tout est sur le site ;
 * - benevolat : venir prêter main-forte, à son rythme ;
 * - bienfaits : ce que les contributions financent (projets, équipement,
 *   souvenirs) ;
 * - lien : l'APEL fait le lien avec l'école et aide au besoin ;
 * - membre : devenir membre, participer aux décisions ;
 * - chiffres : quelques chiffres (facultatif) ;
 * - membres : l'équipe ;
 * - fin : les deux portes (devenir membre, prêter main-forte), le site, le
 *   QR code et la cotisation.
 */
export const CLASS_VIDEO_SCENE_IDS = [
  "intro",
  "apel",
  "agenda",
  "site",
  "benevolat",
  "bienfaits",
  "lien",
  "membre",
  "chiffres",
  "membres",
  "fin",
] as const;

export type ClassVideoSceneId = (typeof CLASS_VIDEO_SCENE_IDS)[number];

export type ClassVideoScene = {
  id: ClassVideoSceneId;
  /** Grand texte à l'écran (quelques mots). */
  title: string;
  /** Petite ligne sous le titre, facultative (chaîne vide = rien). */
  subtitle: string;
  /** Voix off de la scène, si elle a été générée. */
  voice: VoiceClip | null;
};

export type ClassVideoPhoto = {
  url: string;
  /** Légende courte : « Le voyage à Paris des CM2 », « Les nouveaux ballons ». */
  caption: string;
};

export type ClassVideoMember = {
  /** Photo du membre ; sans photo, la vidéo dessine un avatar à ses initiales. */
  url: string | null;
  /** Prénom (ou prénom + initiale). */
  name: string;
  /** « Présidente », « Trésorier », « Parent bénévole »… (peut être vide). */
  role: string;
};

export type ClassVideoEvent = {
  title: string;
  /** Date lisible : « samedi 18 octobre ». */
  dateLabel: string;
};

export type ClassVideoAgenda = {
  /** Nombre de rendez-vous publiés sur l'année scolaire. */
  total: number;
  /** Le prochain rendez-vous à venir, ou null s'il n'y en a plus. */
  next: ClassVideoEvent | null;
  /** Quelques rendez-vous suivants (4 au plus), après `next`. */
  upcoming: ClassVideoEvent[];
};

export type ClassVideoFigure = {
  value: number;
  /** « familles adhérentes », « événements cette année », « € pour les sorties »… */
  label: string;
};

export type ClassVideoProps = {
  associationName: string;
  schoolName: string;
  /** URL du logo de l'école (image matricielle), ou null. */
  logoUrl: string | null;
  palette: VideoPalette;
  /**
   * Scènes retenues, dans l'ordre de CLASS_VIDEO_SCENE_IDS. Une scène absente
   * n'est pas jouée : « bienfaits » sans photo ni temps fort, « chiffres »
   * sans chiffre, « membres » sans membre.
   */
  scenes: ClassVideoScene[];
  /** Photos des bienfaits (achats, voyages financés…), jouées dans « bienfaits ». */
  benefits: ClassVideoPhoto[];
  /**
   * Ce que financent les contributions, montré dans « bienfaits » quand il
   * n'y a pas assez de photos : « Des projets pour l'école », « De
   * l'équipement », « Des souvenirs ».
   */
  highlights: string[];
  /** Rendez-vous de l'année scolaire, joués dans « agenda ». */
  agenda: ClassVideoAgenda;
  /**
   * Adresse du site telle qu'on l'affiche, sans schéma ni chemin :
   * « apel-ndf.fr ». Jouée dans « site » et à la fin ; vide sans adresse
   * publique configurée.
   */
  siteLabel: string;
  /** Chiffres clés, joués dans « chiffres » (3 au plus sont montrés). */
  figures: ClassVideoFigure[];
  /** Membres du bureau et bénévoles, joués dans « membres ». */
  members: ClassVideoMember[];
  /** Adresse affichée à la fin (page « Nous rejoindre »), sans schéma. */
  joinLabel: string;
  /**
   * La même adresse, complète (`https://…/rejoindre`), encodée dans le QR code
   * de l'écran final. Chaîne vide quand l'adresse publique du site n'est pas
   * configurée : pas de QR code plutôt qu'un code qui mène nulle part.
   */
  joinUrl: string;
  /**
   * Cotisation publiée, prête à afficher : « 23 € par famille », « 18 € ».
   * null quand l'association n'en publie pas.
   */
  membershipFee: string | null;
  /** Fond musical (généré ou importé), joué en boucle sous la voix. */
  music: { url: string; volume: number } | null;
  /** Bruitages générés (pop, whoosh, étincelle), ou null pour aucun. */
  sfx: { pop: string; whoosh: string; sparkle: string } | null;
};

export const CLASS_VIDEO_FPS = 30;
export const CLASS_VIDEO_WIDTH = 1920;
export const CLASS_VIDEO_HEIGHT = 1080;
