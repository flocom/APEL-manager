import "server-only";

import { createHmac } from "node:crypto";

import { and, eq, lt, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { deriveKeyFromAuthSecret } from "@/lib/auth/secrets";
import { rateLimitIpKey } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Le limiteur de débit, commun à tout ce qui se déclenche sans compte ou fait
 * partir des messages : connexion, mot de passe oublié, formulaires publics,
 * enregistrement OAuth, diffusions de l'équipe.
 *
 * En base plutôt qu'en mémoire : le compteur d'un processus ne voit pas celui
 * du voisin (plusieurs conteneurs, fonctions Vercel), et repart de zéro à
 * chaque redémarrage — exactement quand un abus le provoque. Un compteur par
 * seau, clé et fenêtre fixe, avancé par un seul `insert … on conflict` : deux
 * requêtes simultanées ne lisent jamais le même compte.
 *
 * La fenêtre est fixe, alignée sur sa durée. À la jonction de deux fenêtres, un
 * abus peut donc passer jusqu'à deux fois le plafond ; les seuils sont choisis
 * assez bas pour que ce double reste inoffensif, et cela évite une seconde
 * lecture à chaque appel.
 */

export interface RateLimitRule {
  /** Nom du seau, stable : il fait partie de la clé en base. */
  bucket: string;
  /** Nombre d'appels admis dans la fenêtre. */
  limit: number;
  windowSeconds: number;
}

const MINUTE = 60;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/**
 * Les plafonds, réunis ici pour se lire d'un coup d'œil. Une association de
 * parents compte quelques dizaines de membres et quelques centaines de
 * familles : chaque seuil laisse passer de loin l'usage normal, y compris un
 * soir d'assemblée générale où tout le monde partage le wifi de l'école — ou
 * la même adresse IP d'un opérateur mobile —, et n'arrête qu'une machine qui
 * insiste.
 *
 * Un plafond posé sur l'adresse e-mail seule se retourne contre sa
 * propriétaire : n'importe qui peut la taper dix fois et la tenir dehors. Les
 * seuils serrés portent donc sur le couple adresse + connexion ; l'adresse
 * seule n'a qu'un plafond large, qu'une seule machine ne peut pas atteindre.
 */
export const PLAFONDS = {
  /**
   * Mots de passe essayés pour une même adresse depuis une même connexion.
   * Dix par quart d'heure laissent le temps de retrouver le bon. Le compte se
   * fait sur l'adresse saisie, qu'elle ait un compte ou non : sinon le refus
   * dirait lesquelles existent.
   */
  connexionAdresseIp: { bucket: "connexion:adresse-ip", limit: 10, windowSeconds: 15 * MINUTE },
  /**
   * Toutes connexions confondues, pour une même adresse : arrête une attaque
   * répartie sur beaucoup de machines. Une seule n'y verse que ses dix essais
   * (voir `passwordAttemptStages`) : il en faut dix pour bloquer la
   * propriétaire, qui retrouve alors l'accès par « Mot de passe oublié ».
   */
  connexionAdresse: { bucket: "connexion:adresse", limit: 100, windowSeconds: 15 * MINUTE },
  /** Essais depuis une même connexion, toutes adresses confondues. */
  connexionIp: { bucket: "connexion:ip", limit: 30, windowSeconds: 15 * MINUTE },

  /** « Mot de passe oublié » depuis une même connexion. */
  oubliIp: { bucket: "oubli:ip", limit: 10, windowSeconds: HEURE },
  /**
   * Liens de réinitialisation pour une même adresse, demandés depuis une même
   * connexion. Chacun part vers une boîte que l'auteur de la demande ne
   * possède peut-être pas.
   */
  oubliAdresseIpHeure: { bucket: "oubli:adresse-ip:h", limit: 3, windowSeconds: HEURE },
  oubliAdresseIpJour: { bucket: "oubli:adresse-ip:j", limit: 6, windowSeconds: JOUR },
  /**
   * Le plafond de la boîte elle-même, toutes connexions confondues. Plus haut
   * que le précédent : une seule machine ne peut plus, à elle seule, priver
   * quelqu'un de lien pour le reste de la journée.
   */
  oubliAdresseJour: { bucket: "oubli:adresse:j", limit: 15, windowSeconds: JOUR },

  /** Messages au bureau (contact, adhésion) depuis une même connexion. */
  messageIpHeure: { bucket: "message:ip:h", limit: 5, windowSeconds: HEURE },
  messageIpJour: { bucket: "message:ip:j", limit: 20, windowSeconds: JOUR },
  /** Accusés de réception envoyés à une même adresse saisie. */
  accuseAdresseJour: { bucket: "accuse:adresse", limit: 3, windowSeconds: JOUR },

  /**
   * Inscriptions de bénévoles et réponses aux réunions depuis une même
   * connexion. Le soir où le bureau projette le QR code de la kermesse en
   * assemblée générale, trente familles s'inscrivent depuis le wifi de
   * l'école dans la même heure : douze les arrêtait. Quarante laissent passer
   * cette salle ; un robot qui viderait les créneaux reste borné par leur
   * capacité, le plafond par adresse et, s'il est activé, reCAPTCHA.
   */
  inscriptionIpHeure: { bucket: "inscription:ip:h", limit: 40, windowSeconds: HEURE },
  inscriptionIpJour: { bucket: "inscription:ip:j", limit: 150, windowSeconds: JOUR },
  /**
   * Confirmations (avec lien de retrait) envoyées à une même adresse. Au-delà,
   * l'inscription ou la réponse est prise, seul l'e-mail ne part plus.
   */
  confirmationAdresseJour: { bucket: "confirmation:adresse", limit: 8, windowSeconds: JOUR },
  /**
   * Demandes de compte pour une même boîte aux lettres (voir `emailKey`) :
   * « parent+1@… », « p.a.r.e.n.t@gmail.com » comptent ensemble. Refus muet,
   * comme le contrôle par adresse exacte qu'il complète.
   */
  demandeCompteBoiteJour: { bucket: "demande-compte:boite", limit: 3, windowSeconds: JOUR },

  /**
   * Enregistrements de clients OAuth (RFC 7591), ouverts à tous. Le total
   * n'avance que pour un enregistrement admis par connexion : il faut une
   * vingtaine de machines pour l'épuiser, et un client jamais utilisé part au
   * ménage du lendemain (`purgeOAuthGarbage`).
   */
  oauthEnregistrementIp: { bucket: "oauth:enregistrement:ip", limit: 10, windowSeconds: HEURE },
  oauthEnregistrementTotal: { bucket: "oauth:enregistrement", limit: 200, windowSeconds: HEURE },

  /**
   * Diffusions de l'équipe. Un envoi légitime ne se répète pas cinq fois dans
   * la journée ; un compte détourné, ou un double clic obstiné, si.
   */
  messageEvenement: { bucket: "diffusion:evenement", limit: 5, windowSeconds: JOUR },
  annulationEvenement: { bucket: "diffusion:annulation", limit: 3, windowSeconds: JOUR },
  diffusionCompte: { bucket: "diffusion:compte", limit: 20, windowSeconds: JOUR },
  diffusionEquipe: { bucket: "diffusion:equipe", limit: 5, windowSeconds: JOUR },
  notificationAppareil: { bucket: "diffusion:appareil", limit: 30, windowSeconds: JOUR },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitVerdict =
  | { ok: true; count: number }
  | { ok: false; count: number; retryAfterSeconds: number };

/**
 * Empreinte de ce qui est compté. HMAC plutôt que simple SHA-256 : une adresse
 * e-mail se devine, et son empreinte nue se retrouverait en quelques essais.
 * Le seau entre dans le calcul, pour qu'une même adresse ne donne pas la même
 * clé d'un usage à l'autre.
 */
function empreinte(bucket: string, key: string): string {
  return createHmac("sha256", deriveKeyFromAuthSecret("limiteur-de-debit"))
    .update(`${bucket}\u0000${key}`)
    .digest("base64url")
    .slice(0, 32);
}

function fenetre(rule: RateLimitRule, now = Date.now()) {
  const duree = rule.windowSeconds * 1000;
  const debut = Math.floor(now / duree) * duree;
  return { debut: new Date(debut), fin: new Date(debut + duree) };
}

function verdict(count: number, fin: Date, seuil: number): RateLimitVerdict {
  if (count <= seuil) return { ok: true, count };
  return {
    ok: false,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((fin.getTime() - Date.now()) / 1000)),
  };
}

/**
 * Compte un appel, et dit s'il dépasse le plafond. L'appel refusé est compté
 * lui aussi : insister ne rapproche pas de la fin du blocage, mais la fenêtre
 * reste fixe, donc elle finit à l'heure dite.
 *
 * Compter d'abord, décider ensuite : lire le compteur puis ne l'avancer
 * qu'après coup laissait trois cents requêtes simultanées lire toutes le même
 * « 2 » et passer ensemble. Ici chaque requête reçoit son propre numéro.
 *
 * Sans clé (pas d'adresse IP connue), rien n'est compté : toutes les requêtes
 * partageraient sinon la même case, et le plafond par connexion deviendrait
 * un plafond général bien plus bas.
 */
export async function hitRateLimit(
  rule: RateLimitRule,
  key: string | null | undefined,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  if (!key) return { ok: true, count: 0 };
  const { debut, fin } = fenetre(rule, now);
  const [ligne] = await db
    .insert(rateLimits)
    .values({
      bucket: rule.bucket,
      key: empreinte(rule.bucket, key),
      windowStart: debut,
      expiresAt: fin,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  return verdict(Number(ligne?.count ?? 1), fin, rule.limit);
}

export type RateLimitEntry = readonly [RateLimitRule, string | null | undefined];

/**
 * Plusieurs plafonds sur un même sujet (par heure et par jour). Tous sont
 * comptés, même quand le premier refuse déjà : sinon un abus arrêté par
 * l'heure n'avancerait jamais le compteur du jour.
 *
 * Pour des sujets différents — la connexion, puis l'adresse, puis le total —,
 * c'est `hitRateLimitStages` : un refus de l'un ne doit pas entamer l'autre.
 */
export async function hitRateLimits(
  entries: ReadonlyArray<RateLimitEntry>,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  const verdicts = await Promise.all(
    entries.map(([rule, key]) => hitRateLimit(rule, key, now)),
  );
  const refus = verdicts.filter(
    (v): v is Extract<RateLimitVerdict, { ok: false }> => !v.ok,
  );
  if (refus.length === 0) return { ok: true, count: 0 };
  // Le plus long des délais : réessayer plus tôt serait refusé par l'autre.
  return refus.reduce((a, b) =>
    b.retryAfterSeconds > a.retryAfterSeconds ? b : a,
  );
}

export interface CountedAttempt {
  verdict: RateLimitVerdict;
  /**
   * Rend l'appel aux compteurs qui l'ont compté : pour la connexion, qui ne
   * garde que les échecs, une fois le bon mot de passe reconnu.
   */
  release: () => Promise<void>;
}

/**
 * Des plafonds emboîtés, comptés l'un après l'autre : la connexion d'abord,
 * puis l'adresse vue depuis cette connexion, puis l'adresse ou le service
 * tout entiers. Le premier qui refuse arrête la chaîne, et les suivants ne
 * voient pas l'appel.
 *
 * Tout compter d'un coup laissait une seule machine, déjà refusée chez elle,
 * continuer d'avancer le compteur commun : soixante et une requêtes
 * suffisaient à fermer l'enregistrement OAuth à tout le monde, et cent
 * connexions ratées à tenir une adresse dehors depuis n'importe où. Ainsi,
 * une machine ne verse au plafond commun que ce que le sien lui accorde.
 */
export async function hitRateLimitStages(
  etapes: ReadonlyArray<ReadonlyArray<RateLimitEntry>>,
): Promise<CountedAttempt> {
  // Un seul instant pour tout l'appel : rendu plus tard, il retombe dans la
  // fenêtre où il a été compté, même si l'heure a tourné entre-temps.
  const instant = Date.now();
  const comptes: RateLimitEntry[] = [];
  const release = () => releaseRateLimits(comptes, instant);
  for (const etape of etapes) {
    const v = await hitRateLimits(etape, instant);
    comptes.push(...etape);
    if (!v.ok) return { verdict: v, release };
  }
  return { verdict: { ok: true, count: 0 }, release };
}

/** Décompte un appel déjà compté, dans la fenêtre où il l'a été. */
async function releaseRateLimits(
  entries: ReadonlyArray<RateLimitEntry>,
  instant: number,
): Promise<void> {
  await Promise.all(
    entries.map(async ([rule, key]) => {
      if (!key) return;
      await db
        .update(rateLimits)
        .set({ count: sql`greatest(${rateLimits.count} - 1, 0)` })
        .where(
          and(
            eq(rateLimits.bucket, rule.bucket),
            eq(rateLimits.key, empreinte(rule.bucket, key)),
            eq(rateLimits.windowStart, fenetre(rule, instant).debut),
          ),
        );
    }),
  );
}

/** Remet un compteur à zéro, toutes fenêtres confondues. */
export async function clearRateLimit(
  rule: RateLimitRule,
  key: string | null | undefined,
): Promise<void> {
  if (!key) return;
  await db
    .delete(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, rule.bucket),
        eq(rateLimits.key, empreinte(rule.bucket, key)),
      ),
    );
}

/** Clé d'une connexion pour le limiteur, ou `null` si l'IP est inconnue. */
export function ipKey(ip: string | null): string | null {
  return rateLimitIpKey(ip);
}

/**
 * Clé d'une boîte aux lettres : ce qui compte, c'est la boîte où arrivent les
 * messages, pas la façon d'écrire son adresse.
 *
 * Casse et espaces ne changent rien. L'étiquette « +… » non plus, quel que
 * soit le domaine : `parent+1@…`, `parent+2@…` arrivent au même endroit, et
 * chacune avait son propre plafond. Chez Gmail, les points sont ignorés et
 * googlemail.com vaut gmail.com. Pour la clé du limiteur seulement : l'adresse
 * enregistrée, elle, reste telle qu'on l'a saisie.
 */
export function emailKey(email: string | null | undefined): string | null {
  const valeur = email?.trim().toLowerCase();
  if (!valeur) return null;
  const arobase = valeur.lastIndexOf("@");
  if (arobase <= 0) return valeur;
  let locale = valeur.slice(0, arobase);
  let domaine = valeur.slice(arobase + 1);
  const plus = locale.indexOf("+");
  if (plus > 0) locale = locale.slice(0, plus);
  if (domaine === "googlemail.com") domaine = "gmail.com";
  if (domaine === "gmail.com") locale = locale.replace(/\./g, "");
  return locale ? `${locale}@${domaine}` : valeur;
}

/**
 * Clé d'une adresse vue depuis une connexion. Sans IP connue, c'est
 * l'adresse seule : on ne distingue plus l'attaquant de la propriétaire, et
 * le plafond serré reprend toute l'adresse plutôt que de disparaître.
 */
function adresseDepuisConnexion(
  email: string | null | undefined,
  ip: string | null,
): string | null {
  const adresse = emailKey(email);
  if (!adresse) return null;
  return `${adresse}\u0000${ip ?? "ip-inconnue"}`;
}

/**
 * Les étapes d'un essai de mot de passe (connexion, changement de mot de
 * passe) : la connexion, puis l'adresse depuis cette connexion, puis
 * l'adresse partout. Dans cet ordre, la machine d'un attaquant bute sur ses
 * propres plafonds bien avant d'atteindre celui qui fermerait l'adresse à
 * sa propriétaire.
 */
export function passwordAttemptStages(
  email: string,
  ip: string | null,
): RateLimitEntry[][] {
  return [
    [[PLAFONDS.connexionIp, ip]],
    [[PLAFONDS.connexionAdresseIp, adresseDepuisConnexion(email, ip)]],
    [[PLAFONDS.connexionAdresse, emailKey(email)]],
  ];
}

/**
 * Efface les essais de mot de passe comptés pour une adresse, une fois que sa
 * propriétaire a prouvé qu'elle tient la boîte (lien de réinitialisation, de
 * confirmation). Sans quoi le blocage posé par quelqu'un d'autre survivait au
 * nouveau mot de passe, et le message qui renvoie vers « Mot de passe
 * oublié » menait à une impasse. Les compteurs d'une autre connexion, celle
 * de l'attaquant, restent en place.
 */
export async function clearPasswordAttempts(
  email: string,
  ip: string | null,
): Promise<void> {
  await Promise.all([
    clearRateLimit(PLAFONDS.connexionAdresse, emailKey(email)),
    clearRateLimit(
      PLAFONDS.connexionAdresseIp,
      adresseDepuisConnexion(email, ip),
    ),
  ]);
}

/**
 * Les étapes d'une demande de lien « mot de passe oublié » pour une adresse :
 * depuis cette connexion (par heure et par jour), puis pour la boîte tout
 * entière.
 */
export function forgotAddressStages(
  email: string,
  ip: string | null,
): RateLimitEntry[][] {
  const depuisConnexion = adresseDepuisConnexion(email, ip);
  return [
    [
      [PLAFONDS.oubliAdresseIpHeure, depuisConnexion],
      [PLAFONDS.oubliAdresseIpJour, depuisConnexion],
    ],
    [[PLAFONDS.oubliAdresseJour, emailKey(email)]],
  ];
}

/** « dans 12 minutes », « dans 3 heures », pour les messages de refus. */
export function delaiLisible(secondes: number): string {
  if (secondes < 90) return "dans une minute";
  const minutes = Math.ceil(secondes / 60);
  if (minutes < 90) return `dans ${minutes} minutes`;
  const heures = Math.ceil(minutes / 60);
  return heures >= 24 ? "demain" : `dans ${heures} heures`;
}

/**
 * Le refus à renvoyer : 429, `Retry-After`, et un message qui dit quand
 * réessayer. `handleApiError` le transforme en réponse.
 */
export function rateLimitError(
  refus: Extract<RateLimitVerdict, { ok: false }>,
  message: string,
): HttpError {
  return new HttpError(429, message, {
    retryAfterSeconds: refus.retryAfterSeconds,
  });
}

/** Efface les compteurs des fenêtres closes. Appelée par le cron quotidien. */
export async function purgeExpiredRateLimits(): Promise<number> {
  // Compté en base : après un abus, ces lignes se comptent par milliers, et
  // les rapatrier une à une pour les dénombrer ne servirait à rien.
  const [resultat] = await db.execute<{ n: number }>(sql`
    with effaces as (
      delete from ${rateLimits}
      where ${lt(rateLimits.expiresAt, new Date())}
      returning 1
    )
    select count(*)::int as n from effaces
  `);
  return Number(resultat?.n ?? 0);
}

/**
 * Les diffusions de l'équipe : message aux bénévoles, annulation, message à
 * tous les comptes ou aux adhérents, notification sur appareil.
 *
 * Chacune part vers des dizaines, parfois des centaines d'adresses, depuis
 * celle de l'association. Rien n'empêchait de la relancer à l'infini — un
 * double clic obstiné, un compte d'organisateur détourné, une annulation
 * basculée dix fois — et c'est la réputation d'envoi de l'association qui en
 * payait le prix, puis la confiance des familles dans ses messages.
 *
 * Le plafond par événement protège ceux qui reçoivent ; celui par compte
 * protège l'association d'un seul expéditeur. Partagé entre l'écran et le
 * serveur MCP : les deux passent par ici.
 */
export type BroadcastKind =
  | { type: "evenement"; eventId: string }
  | { type: "annulation"; eventId: string }
  | { type: "equipe" }
  | { type: "appareil" };

function reglesDiffusion(userId: string, kind: BroadcastKind) {
  const parCompte: RateLimitRule =
    kind.type === "appareil"
      ? PLAFONDS.notificationAppareil
      : kind.type === "equipe"
        ? PLAFONDS.diffusionEquipe
        : PLAFONDS.diffusionCompte;
  const entrees: Array<readonly [RateLimitRule, string]> = [[parCompte, userId]];
  if (kind.type === "evenement") {
    entrees.push([PLAFONDS.messageEvenement, kind.eventId]);
  }
  if (kind.type === "annulation") {
    entrees.push([PLAFONDS.annulationEvenement, kind.eventId]);
  }
  return { parCompte, entrees };
}

/** Le refus à opposer, ou `null` si la diffusion passe. */
function refusDiffusion(
  kind: BroadcastKind,
  parCompte: RateLimitRule,
  compte: RateLimitVerdict,
  evenement: RateLimitVerdict | undefined,
): HttpError | null {
  const delai = (v: Extract<RateLimitVerdict, { ok: false }>) =>
    delaiLisible(v.retryAfterSeconds);

  if (evenement && !evenement.ok) {
    return rateLimitError(
      evenement,
      kind.type === "annulation"
        ? `Les inscrits ont déjà été prévenus ${PLAFONDS.annulationEvenement.limit} fois aujourd’hui d’une annulation de cet événement. Rien n’a été modifié : réessayez ${delai(evenement)}.`
        : `Les bénévoles de cet événement ont déjà reçu ${PLAFONDS.messageEvenement.limit} messages aujourd’hui : réessayez ${delai(evenement)}. Pour une urgence, appelez-les — leurs numéros figurent sous chaque créneau.`,
    );
  }
  if (!compte.ok) {
    return rateLimitError(
      compte,
      kind.type === "appareil"
        ? `Vous avez déjà envoyé ${parCompte.limit} notifications aujourd’hui : réessayez ${delai(compte)}.`
        : kind.type === "equipe"
          ? `Vous avez déjà écrit ${parCompte.limit} fois à tout le monde aujourd’hui : réessayez ${delai(compte)}.`
          : `Vous avez déjà fait partir ${parCompte.limit} diffusions aujourd’hui : réessayez ${delai(compte)}. Cette limite protège la réputation d’envoi de l’association.`,
    );
  }
  return null;
}

/**
 * Réserve une diffusion : la compte, et refuse si le plafond est atteint.
 * Rend de quoi la décompter, à appeler quand l'envoi n'a finalement touché
 * personne (transport en panne, aucun destinataire) : une tentative qui n'a
 * prévenu personne ne doit pas entamer le quota, sinon l'envoi suivant, le
 * vrai, serait refusé au motif de messages que personne n'a reçus.
 *
 * Réserver avant d'envoyer plutôt que compter après : deux envois lancés au
 * même instant ne peuvent pas passer tous les deux sous le plafond.
 * Un refus n'est pas compté non plus : insister n'envoie rien.
 */
export async function assertBroadcastAllowed(
  userId: string,
  kind: BroadcastKind,
): Promise<() => Promise<void>> {
  const instant = Date.now();
  const { parCompte, entrees } = reglesDiffusion(userId, kind);
  const [compte, evenement] = await Promise.all(
    entrees.map(([rule, key]) => hitRateLimit(rule, key, instant)),
  );
  const rendre = () => releaseRateLimits(entrees, instant);
  const refus = refusDiffusion(kind, parCompte, compte, evenement);
  if (refus) {
    await rendre();
    throw refus;
  }
  return rendre;
}

/**
 * Lit un compteur sans l'avancer : dit si un appel de plus passerait.
 * Pour les gestes dont on ne sait pas encore, au moment du contrôle, s'ils
 * aboutiront (voir `checkBroadcastAllowed`).
 */
export async function peekRateLimit(
  rule: RateLimitRule,
  key: string | null | undefined,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  if (!key) return { ok: true, count: 0 };
  const { debut, fin } = fenetre(rule, now);
  const [ligne] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, rule.bucket),
        eq(rateLimits.key, empreinte(rule.bucket, key)),
        eq(rateLimits.windowStart, debut),
      ),
    )
    .limit(1);
  return verdict(Number(ligne?.count ?? 0) + 1, fin, rule.limit);
}

/**
 * Vérifie qu'une diffusion passerait, sans la compter : l'appelant la compte
 * ensuite avec `recordBroadcast`, une fois sûr qu'elle a prévenu quelqu'un.
 * Réservé aux gestes déjà protégés des doublons simultanés par ailleurs —
 * l'annulation, dont le contrôle de version ne laisse passer qu'une requête.
 */
export async function checkBroadcastAllowed(
  userId: string,
  kind: BroadcastKind,
): Promise<void> {
  const { parCompte, entrees } = reglesDiffusion(userId, kind);
  const [compte, evenement] = await Promise.all(
    entrees.map(([rule, key]) => peekRateLimit(rule, key)),
  );
  const refus = refusDiffusion(kind, parCompte, compte, evenement);
  if (refus) throw refus;
}

/** Compte une diffusion partie (voir `checkBroadcastAllowed`). */
export async function recordBroadcast(
  userId: string,
  kind: BroadcastKind,
): Promise<void> {
  const { entrees } = reglesDiffusion(userId, kind);
  await hitRateLimits(entrees);
}
