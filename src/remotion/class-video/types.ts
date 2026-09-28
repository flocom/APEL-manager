/**
 * Contrat entre l'éditeur (src/components/communication/…) et la composition
 * Remotion de la vidéo présentée aux classes.
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
 * Ordre et identité des scènes. Les quatre « piliers » disent ce que fait
 * l'APEL : donner vie à l'école, faire sourire, créer des souvenirs,
 * rassembler.
 */
export const CLASS_VIDEO_SCENE_IDS = [
  "intro",
  "apel",
  "vie",
  "sourire",
  "souvenirs",
  "rassembler",
  "bienfaits",
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
   * Temps forts tirés des données (noms d'événements passés, dépenses pour
   * l'école), montrés dans « bienfaits » quand il n'y a pas assez de photos.
   */
  highlights: string[];
  /** Chiffres clés, joués dans « chiffres » (3 au plus sont montrés). */
  figures: ClassVideoFigure[];
  /** Membres du bureau et bénévoles, joués dans « membres ». */
  members: ClassVideoMember[];
  /** Adresse affichée à la fin (page « Nous rejoindre »), sans schéma. */
  joinLabel: string;
  /** Fond musical (généré ou importé), joué en boucle sous la voix. */
  music: { url: string; volume: number } | null;
  /** Bruitages générés (pop, whoosh, étincelle), ou null pour aucun. */
  sfx: { pop: string; whoosh: string; sparkle: string } | null;
};

export const CLASS_VIDEO_FPS = 30;
export const CLASS_VIDEO_WIDTH = 1920;
export const CLASS_VIDEO_HEIGHT = 1080;
