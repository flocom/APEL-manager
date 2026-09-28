import { z } from "zod";

import {
  CLASS_VIDEO_SCENE_IDS,
  type ClassVideoProps,
  type ClassVideoSceneId,
  type VideoPalette,
} from "@/remotion/class-video/types";

/**
 * La vidéo de présentation de l'APEL aux parents : ce que le bureau
 * enregistre, ce que l'application sait déjà de l'association, et l'assemblage
 * des deux en props pour la composition Remotion.
 *
 * Elle s'appelait d'abord « vidéo des classes » ; `video_classes` est resté
 * comme clé en base pour ne pas perdre ce qui a déjà été enregistré.
 *
 * Rien n'est à écrire pour obtenir une première vidéo : les textes par défaut
 * sont tirés des données (nom de l'école, événements de l'année, nombre de
 * familles). Le bureau ne remplace que ce qu'il veut, scène par scène.
 */

export const CLASS_VIDEO_KIND = "video_classes";

const MEDIA_URL =
  /^\/api\/uploads\/media-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]{0,139}$/;

/** Fichier du scope `media`, et rien d'autre : ni URL externe, ni autre scope. */
export const mediaUrlSchema = z
  .string()
  .trim()
  .regex(MEDIA_URL, "Importez le fichier depuis cet écran.");

export const SCENE_LABELS: Record<ClassVideoSceneId, string> = {
  intro: "Accroche",
  apel: "Qui sommes-nous ?",
  agenda: "Les rendez-vous de l'année",
  site: "Tout est sur le site",
  benevolat: "Prêter main-forte",
  bienfaits: "Grâce à vous",
  lien: "Le lien avec l'école",
  membre: "Devenir membre",
  chiffres: "L'APEL en chiffres",
  membres: "L'équipe",
  fin: "Conclusion",
};

const voiceSchema = z.object({
  url: mediaUrlSchema,
  durationInSeconds: z.number().positive().max(120),
  /**
   * Le texte lu : si le bureau modifie la phrase ensuite, l'écran sait que la
   * voix n'y correspond plus et propose de la régénérer.
   */
  text: z.string().max(600),
  /** Voix de synthèse, ou voix d'un parent enregistrée dans l'écran. */
  source: z.enum(["synthese", "enregistrement"]).default("synthese"),
});

const sceneSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().trim().max(80),
  subtitle: z.string().trim().max(140),
  voiceText: z.string().trim().max(600),
  voice: voiceSchema.nullable().default(null),
});

export type ClassVideoSceneContent = z.infer<typeof sceneSchema>;

export const classVideoContentSchema = z.object({
  /** Textes modifiés par le bureau ; une scène absente garde ses textes par défaut. */
  scenes: z
    .object(
      Object.fromEntries(
        CLASS_VIDEO_SCENE_IDS.map((id) => [id, sceneSchema.optional()]),
      ) as Record<ClassVideoSceneId, z.ZodOptional<typeof sceneSchema>>,
    )
    .default({}),
  benefits: z
    .array(
      z.object({
        url: mediaUrlSchema,
        caption: z.string().trim().max(90).default(""),
      }),
    )
    .max(24)
    .default([]),
  members: z
    .array(
      z.object({
        url: mediaUrlSchema.nullable().default(null),
        name: z.string().trim().min(1).max(40),
        role: z.string().trim().max(40).default(""),
      }),
    )
    .max(16)
    .default([]),
  music: z
    .object({
      mode: z.enum(["generated", "upload", "none"]).default("generated"),
      url: mediaUrlSchema.nullable().default(null),
      volume: z.number().min(0).max(1).default(0.35),
    })
    .default({}),
  sfx: z.boolean().default(true),
  /**
   * Attestation du bureau : les personnes (et les parents des enfants) qui
   * apparaissent sur les photos ont donné leur accord. La vidéo ne s'exporte
   * pas avec des photos tant qu'elle n'est pas cochée.
   */
  photoConsent: z.boolean().default(false),
});

export type ClassVideoContent = z.infer<typeof classVideoContentSchema>;

/** Contenu enregistré, lu avec tolérance : un champ abîmé retombe sur sa valeur par défaut. */
export function parseClassVideoContent(raw: unknown): ClassVideoContent {
  const parsed = classVideoContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : classVideoContentSchema.parse({});
}

/** Ce que l'application sait déjà, calculé côté serveur. */
export type ClassVideoSource = {
  associationName: string;
  schoolName: string;
  logoUrl: string | null;
  palette: VideoPalette;
  /** Adresse de la page « Nous rejoindre », sans schéma : « apel-ndf.fr/rejoindre ». */
  joinLabel: string;
  /** La même, complète, pour le QR code de la fin ; vide si le site n'a pas d'adresse publique. */
  joinUrl: string;
  /** Cotisation publiée, prête à afficher (« 23 € par famille »), ou null. */
  membershipFee: string | null;
  /** Événements publiés de l'année scolaire en cours, dans l'ordre du calendrier. */
  recentEvents: string[];
  /** Rendez-vous de l'année : total, prochain, et quelques suivants. */
  agenda: ClassVideoProps["agenda"];
  /** Adresse du site, sans schéma : « apel-ndf.fr » ; vide sans adresse publique. */
  siteLabel: string;
  /** Chiffres assez parlants pour être montrés (les trop petits sont écartés). */
  figures: { key: "familles" | "benevoles" | "evenements"; value: number; label: string }[];
  /** Membres de l'équipe proposés par défaut (prénoms des comptes du bureau). */
  suggestedMembers: { name: string; role: string }[];
};

/** « la kermesse, le marché de Noël et le carnaval » */
function listeFrancaise(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

/** « Boom de l'APEL » → « boom de l'APEL » : l'intitulé reprend sa place dans la phrase. */
function minusculeInitiale(titre: string): string {
  return titre.charAt(0).toLocaleLowerCase("fr-FR") + titre.slice(1);
}

/**
 * Textes par défaut de chaque scène, écrits pour des parents sur le fil de la
 * présentation qu'un parent du bureau fait en réunion de rentrée : qui nous
 * sommes, les rendez-vous de l'année, le site, venir prêter main-forte, ce
 * que les contributions financent, le lien avec l'école, devenir membre.
 *
 * La voix off ne lit jamais l'adresse du site : « apel tiret n d f point f r »
 * ne s'écoute pas. Elle est à l'écran, et dans le QR code.
 */
export function defaultSceneTexts(
  source: ClassVideoSource,
): Record<ClassVideoSceneId, Omit<ClassVideoSceneContent, "voice" | "enabled">> {
  const { total, next, upcoming } = source.agenda;
  const figure = (key: ClassVideoSource["figures"][number]["key"]) =>
    source.figures.find((f) => f.key === key)?.value ?? 0;
  const chiffres = [
    figure("familles") > 0 ? `${figure("familles")} familles` : null,
    figure("benevoles") > 0 ? `${figure("benevoles")} bénévoles` : null,
    figure("evenements") > 0 ? `${figure("evenements")} rendez-vous` : null,
  ].filter((v): v is string => v !== null);
  const suivants = upcoming.slice(0, 3).map((e) => minusculeInitiale(e.title));

  return {
    intro: {
      title: "L'APEL, c'est nous.",
      subtitle: "Et ça peut être vous.",
      voiceText: "L'APEL, c'est nous. Et ça peut être vous aussi.",
    },
    apel: {
      title: "Des parents bénévoles",
      subtitle: "Des temps forts toute l'année, pour les enfants et pour l'école",
      voiceText:
        "Nous sommes des parents bénévoles qui organisent, tout au long de l'année, des temps forts pour les enfants et pour la vie de l'école.",
    },
    agenda: {
      title: total > 1 ? `${total} rendez-vous cette année` : "Des rendez-vous toute l'année",
      subtitle: next ? "Le prochain arrive très bientôt" : "",
      voiceText: [
        total > 1 ? `Il y en a déjà ${total} de prévus cette année.` : "",
        next ? `Le prochain arrive très bientôt : ${minusculeInitiale(next.title)}, ${next.dateLabel}.` : "",
        suivants.length > 0 ? `Et aussi ${listeFrancaise(suivants)}.` : "",
      ]
        .filter(Boolean)
        .join(" ") || "Toute l'année, nous organisons des temps forts pour les enfants.",
    },
    site: {
      title: "Tout est sur le site",
      subtitle: "Dates, inscriptions, adhésion",
      voiceText:
        "Vous retrouvez tous les événements sur notre site : les dates, les inscriptions, et l'adhésion.",
    },
    benevolat: {
      title: "Venez prêter main-forte",
      subtitle: "À votre rythme, sur le créneau de votre choix",
      voiceText:
        "Vous pouvez donner un coup de main simplement, à votre rythme, sur le créneau qui vous convient. C'est l'occasion idéale de rencontrer d'autres parents.",
    },
    bienfaits: {
      title: "Grâce à vous",
      subtitle: "Des projets, de l'équipement, des souvenirs",
      voiceText:
        "Et c'est grâce à vous, et à vos contributions, que nous finançons des projets pour l'école, de l'équipement et de beaux souvenirs.",
    },
    lien: {
      title: "On est là pour vous",
      subtitle: "Le lien entre les familles et l'école",
      voiceText:
        "L'APEL fait aussi le lien entre les familles et l'école, même sur les sujets délicats. N'hésitez jamais à venir nous voir.",
    },
    membre: {
      title: "Devenez membre",
      subtitle: "Décidez, proposez, organisez avec nous",
      voiceText:
        "Envie de vous impliquer davantage, de participer aux décisions ou de donner vie à vos idées ? Devenez membre : nous nous réunissons plusieurs fois par an.",
    },
    chiffres: {
      title: "L'APEL en chiffres",
      subtitle: "",
      voiceText:
        chiffres.length > 0
          ? `Cette année, c'est déjà ${listeFrancaise(chiffres)} !`
          : "Chaque année, de nouvelles familles nous rejoignent !",
    },
    membres: {
      title: "L'équipe",
      subtitle: "Des parents à votre écoute",
      voiceText: "Voici l'équipe, à votre écoute.",
    },
    fin: {
      title: "Rejoignez-nous !",
      subtitle: "Merci de votre attention",
      // Le QR code n'existe que si le site a une adresse publique : la voix
      // n'invite à le scanner que dans ce cas.
      voiceText: source.joinUrl
        ? "Devenir membre, prêter main-forte : tout est sur notre site. Il suffit de scanner le code. Merci de votre attention !"
        : "Devenir membre, prêter main-forte : tout est sur notre site. Merci de votre attention !",
    },
  };
}

/**
 * Ce que financent les contributions, montré quand le bureau n'a pas (encore)
 * mis de photos : les trois mots de la présentation.
 */
const BENEFIT_HIGHLIGHTS = [
  "Des projets pour l'école",
  "De l'équipement",
  "Des souvenirs",
];

/** Une scène telle qu'elle sera jouée : textes du bureau, ou textes par défaut. */
export function resolvedScene(
  id: ClassVideoSceneId,
  content: ClassVideoContent,
  source: ClassVideoSource,
): ClassVideoSceneContent {
  const saved = content.scenes[id];
  if (saved) return saved;
  return { ...defaultSceneTexts(source)[id], enabled: true, voice: null };
}

/** La voix enregistrée ne vaut que pour le texte qu'elle lit. */
export function voiceIsCurrent(scene: ClassVideoSceneContent): boolean {
  return scene.voice !== null && scene.voice.text === scene.voiceText;
}

/**
 * Assemble les props de la composition. Les fichiers audio générés dans le
 * navigateur (musique, bruitages) arrivent en `blob:` ; tout le reste est déjà
 * dans le contenu ou la source.
 */
export function buildClassVideoProps(
  content: ClassVideoContent,
  source: ClassVideoSource,
  audio: {
    generatedMusicUrl: string | null;
    sfx: ClassVideoProps["sfx"];
  },
): ClassVideoProps {
  const benefits = content.photoConsent ? content.benefits : [];
  const members = content.members.map((m) => ({
    url: content.photoConsent ? m.url : null,
    name: m.name,
    role: m.role,
  }));
  const figures = source.figures
    .filter((f) => f.value > 0)
    .map((f) => ({ value: f.value, label: f.label }));

  const scenes = CLASS_VIDEO_SCENE_IDS.map((id) => ({
    id,
    scene: resolvedScene(id, content, source),
  }))
    .filter(({ id, scene }) => {
      if (!scene.enabled) return false;
      // Une scène sans matière n'est pas jouée, plutôt que de montrer un écran vide.
      if (id === "agenda") return source.agenda.total > 0 || source.agenda.next !== null;
      if (id === "chiffres") return figures.length > 0;
      if (id === "membres") return members.length > 0;
      return true;
    })
    .map(({ id, scene }) => ({
      id,
      title: scene.title,
      subtitle: scene.subtitle,
      voice:
        scene.voice && voiceIsCurrent(scene)
          ? {
              url: scene.voice.url,
              durationInSeconds: scene.voice.durationInSeconds,
            }
          : null,
    }));

  const music =
    content.music.mode === "upload" && content.music.url
      ? { url: content.music.url, volume: content.music.volume }
      : content.music.mode === "generated" && audio.generatedMusicUrl
        ? { url: audio.generatedMusicUrl, volume: content.music.volume }
        : null;

  return {
    associationName: source.associationName,
    schoolName: source.schoolName,
    logoUrl: source.logoUrl,
    palette: source.palette,
    scenes,
    benefits,
    highlights: BENEFIT_HIGHLIGHTS,
    agenda: source.agenda,
    siteLabel: source.siteLabel,
    figures,
    members,
    joinLabel: source.joinLabel,
    joinUrl: source.joinUrl,
    membershipFee: source.membershipFee,
    music,
    sfx: content.sfx ? audio.sfx : null,
  };
}
