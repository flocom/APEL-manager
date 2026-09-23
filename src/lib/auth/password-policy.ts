/**
 * Ce qu'on accepte comme nouveau mot de passe.
 *
 * Huit caractères suffisaient, et « 12345678 » passait. Or un compte de
 * l'espace de gestion ouvre les coordonnées des familles, les comptes de
 * l'association et, pour un organisateur, l'envoi d'e-mails en son nom.
 *
 * La règle suit la recommandation de la CNIL (délibération 2022-100) pour un
 * mot de passe protégé par une limitation des tentatives — ce que fait
 * désormais la connexion : au moins dix caractères, plutôt que huit, parce
 * qu'on n'impose ni majuscule, ni chiffre, ni symbole. Ces règles-là poussent
 * vers « Motdepasse1! », que toute liste d'attaque essaie en premier ; mieux
 * vaut une phrase de quelques mots, longue et facile à retenir. À la place, on
 * refuse ce qu'un attaquant essaie d'abord : les mots de passe les plus
 * courants, les suites et répétitions, l'adresse e-mail, le nom de
 * l'association ou de l'école.
 *
 * Ne s'applique qu'au choix d'un mot de passe (premier compte, confirmation
 * d'une demande, réinitialisation, changement) : un mot de passe déjà en place
 * continue d'ouvrir la session, on ne l'apprend qu'à sa connexion suivante et
 * on n'a aucune raison d'enfermer quelqu'un dehors.
 *
 * Module pur : les formulaires peuvent en reprendre la longueur minimale.
 */

export const PASSWORD_MIN_LENGTH = 10;
/**
 * bcrypt ne lit que les 72 premiers octets ; 200 caractères laissent la place
 * à une longue phrase sans servir à envoyer des mégaoctets au hachage.
 */
export const PASSWORD_MAX_LENGTH = 200;

/** Le rappel affiché sous chaque champ « nouveau mot de passe ». */
export const PASSWORD_HINT =
  "10 caractères minimum. Évitez les mots de passe courants : une phrase de quelques mots est plus sûre et plus facile à retenir.";

/**
 * Les mots de passe que les listes d'attaque essaient en premier, ramenés à
 * leur « cœur » (minuscules, sans accents, sans chiffres ni symboles autour) :
 * « Azerty123! » et « azerty » tombent ensemble. Les classiques
 * internationaux, et ceux qu'on retrouve dans les fuites françaises.
 */
const COURANTS = new Set([
  // Mots et claviers
  "password", "passw0rd", "motdepasse", "mdp", "azerty", "azertyuiop",
  "qwerty", "qwertyuiop", "qwertz", "azer", "admin", "administrateur",
  "administrator", "root", "welcome", "bienvenue", "letmein", "login",
  "connexion", "changeme", "secret", "motdepass", "passe", "default",
  "master", "access", "abc", "test", "testtest", "user", "utilisateur",
  "apel", "apelmanager", "ecole", "association", "parents", "parent",
  "famille", "enfants", "enfant", "bureau", "tresorier", "president",
  "secretaire", "benevole", "benevoles", "college", "lycee", "maternelle",
  "primaire", "classe", "maitresse", "maitre", "directeur", "directrice",
  // Prénoms, surnoms et mots doux
  "doudou", "chouchou", "loulou", "nounours", "bebe", "cheri", "cherie",
  "amour", "jetaime", "tequiero", "iloveyou", "princesse", "prince",
  "mamour", "moncoeur", "papa", "maman", "mamie", "papi", "papy", "tata",
  "tonton", "nicolas", "julien", "camille", "thomas", "marie", "sophie",
  "celine", "nathalie", "isabelle", "stephanie", "sandrine", "caroline",
  "christophe", "sebastien", "alexandre", "maxime", "lucas", "hugo",
  "emma", "lea", "chloe", "manon", "jade", "louise", "alice", "michael",
  "jennifer", "jessica", "daniel", "charlie", "jordan", "ashley",
  // Choses de tous les jours
  "soleil", "marseille", "paris", "lyon", "toulouse", "bordeaux",
  "france", "football", "foot", "olympique", "psg", "om", "chocolat",
  "doudoune", "coucou", "salut", "bonjour", "merci", "vacances", "noel",
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet",
  "aout", "septembre", "octobre", "novembre", "decembre", "lundi",
  "dimanche", "printemps", "ete", "automne", "hiver", "chat", "chien",
  "minou", "titi", "toto", "tintin", "pokemon", "pikachu", "naruto",
  "starwars", "batman", "superman", "spiderman", "dragon", "monkey",
  "shadow", "sunshine", "freedom", "whatever", "trustno", "ninja",
  "princess",
  "baseball", "hockey", "soccer", "tigger", "cookie", "banane", "orange",
  "fleur", "papillon", "licorne", "etoile", "nuage", "musique", "voiture",
  "moto", "maison", "jardin", "internet", "ordinateur", "google",
  "facebook", "gmail", "hotmail", "free", "sfr", "bouygues",
  "iphone", "samsung", "apple", "windows", "linux",
  // Le haut des listes internationales, que les attaques essaient d'abord
  "hello", "helloworld", "hellokitty", "summer", "winter", "spring",
  "autumn", "love", "loveyou", "loveme", "lovely", "iloveu", "computer",
  "killer", "hunter", "ranger", "buster", "flower", "pepper", "ginger",
  "cheese", "silver", "matrix", "mustang", "harley", "jesus", "joshua",
  "maggie", "yankees", "biteme", "fuckyou", "michelle", "jordan",
  "qazwsx", "zaqxsw", "amitie", "bisous", "calin", "doudounette",
]);

/**
 * Mots de passe refusés tels quels, chiffres compris : ceux dont le cœur
 * ne reste pas (ils ne contiennent aucune lettre).
 */
const COURANTS_EXACTS = new Set([
  "1234567890", "0123456789", "9876543210", "1122334455", "1234512345",
  "1234554321", "0000000000", "1111111111", "1212121212", "1231231234",
  "147258369", "1478963250", "7894561230", "0612345678", "0102030405",
  "01234567890", "12345678910", "123456789a", "a123456789",
]);

/**
 * Suites qu'un doigt parcourt sans réfléchir, dans les deux sens : rangées et
 * colonnes du clavier, et les zigzags entre deux rangées (« 1q2w3e4r5t »,
 * « zaq12wsx ») qui figurent parmi les mots de passe les plus fréquents des
 * fuites, à longueur égale.
 */
const SUITES = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789012345678901234567890",
  "azertyuiopqsdfghjklmwxcvbn",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
  "1aqw2zsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
  "a1z2e3r4t5y6u7i8o9p0",
  "1a2z3e4r5t6y7u8i9o0p",
  "1q2w3e4r5t6y7u8i9o0p",
  "q1w2e3r4t5y6u7i8o9p0",
  "a1b2c3d4e5f6g7h8i9j0",
  "1a2b3c4d5e6f7g8h9i0j",
  "zaq12wsxcde34rfvbgt56yhnmju78ik",
  "zaq1xsw2cde3vfr4bgt5nhy6mju7",
  "wqa12zsxcde34rfvbgt56yhn",
  "qazwsxedcrfvtgbyhnujmikolp",
  "aqwzsxedcrfvtgbyhnujkilomp",
  "qweasdzxcrtyfghvbnuiojklm",
  "azeqsdwxcrtyfghvbnuiojklp",
  "123qweasdzxc",
  "123azeqsdwxc",
  "&é\"'(-è_çà)=",
];

/**
 * Les chiffres tapés avec Maj sur un clavier QWERTY : « !@#$%^&*() » est
 * « 1234567890 » pour le doigt qui le tape, et les listes d'attaque le savent.
 */
const CHIFFRES_DECALES: Record<string, string> = {
  "!": "1", "@": "2", "#": "3", $: "4", "%": "5",
  "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
};

/** Ramène les chiffres « décalés » (voir `CHIFFRES_DECALES`) aux chiffres. */
function redecaler(valeur: string): string {
  return valeur.replace(/[!@#$%^&*()]/g, (signe) => CHIFFRES_DECALES[signe]);
}

/** Minuscules, sans accents. */
function simplifier(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Les substitutions « l33t » les plus courantes, ramenées aux lettres. */
function delirer(valeur: string): string {
  return valeur
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t");
}

/** Les lettres seules : « Apel-Saint-Joseph 2026 » → « apelsaintjoseph ». */
function lettres(valeur: string): string {
  return simplifier(valeur).replace(/[^a-z]/g, "");
}

function estDansUneSuite(valeur: string): boolean {
  return SUITES.some((brute) => {
    const suite = simplifier(brute);
    const inverse = [...suite].reverse().join("");
    return suite.includes(valeur) || inverse.includes(valeur);
  });
}

/**
 * Presque une suite : « 1234567891 », « 12345678900 », « x123456789 » — une
 * suite du clavier ou de l'alphabet à un ou deux signes près. Ce sont les
 * variantes qu'on tape quand « 1234567890 » est refusé, et les listes
 * d'attaque les essaient juste après. Le plus long passage suivi d'une suite
 * doit couvrir tout le mot de passe sauf deux signes au plus.
 */
function presqueUneSuite(valeur: string): boolean {
  // Au-delà, ce n'est plus « presque » la plus longue des suites.
  if (valeur.length > 40) return false;
  let plusLong = 0;
  for (let debut = 0; debut < valeur.length - plusLong; debut++) {
    // Tout passage d'une suite est lui-même dans la suite : on peut étendre
    // tant que ça tient, sans revenir en arrière.
    let fin = debut + plusLong + 1;
    while (fin <= valeur.length && estDansUneSuite(valeur.slice(debut, fin))) {
      plusLong = fin - debut;
      fin++;
    }
  }
  return plusLong >= 6 && plusLong >= valeur.length - 2;
}

/**
 * Découpe en morceaux de lettres ou de chiffres (les séparateurs tombent) et
 * dit si chacun est prévisible : suite du clavier ou de l'alphabet d'au moins
 * trois signes, mot courant (l33t compris), ou redite d'un morceau déjà vu. Il
 * en faut au moins deux : un seul morceau est déjà jugé plus haut.
 *
 * Un morceau court et banal (« le », « de ») rend le tout imprévisible : une
 * vraie phrase — « le chat de ma voisine » — passe donc toujours.
 */
function queDesMorceauxPrevisibles(simple: string): boolean {
  const morceaux = simple.match(/[a-z]+|[0-9]+/g) ?? [];
  if (morceaux.length < 2) return false;
  return morceaux.every(
    (morceau, i) =>
      (morceau.length >= 3 && estDansUneSuite(morceau)) ||
      COURANTS.has(morceau) ||
      COURANTS.has(delirer(morceau)) ||
      morceaux.slice(0, i).includes(morceau),
  );
}

/**
 * Le mot de passe n'est-il fait que d'un morceau de l'adresse (le prénom, le
 * nom : « jean », « dupont » pour jean.dupont@…), à des chiffres, des
 * symboles ou un mot courant près ? « Dupont12345 » et « dupont2026!! » sont
 * les premiers essais de qui connaît l'adresse.
 *
 * Seulement quand il ne reste presque rien d'autre : une phrase qui contient
 * le prénom de son auteur — « Jean aime les tartes aux pommes » — reste un
 * bon mot de passe, et la refuser découragerait justement les phrases.
 */
function reprendUnMorceauDeLAdresse(password: string, locale: string): boolean {
  const morceaux = locale
    .split(/[._+-]+/)
    .map(lettres)
    .filter((morceau) => morceau.length >= 4);
  if (morceaux.length === 0) return false;
  const lettresDuMotDePasse = lettres(password);
  if (!morceaux.some((morceau) => lettresDuMotDePasse.includes(morceau))) {
    return false;
  }
  let reste = lettresDuMotDePasse;
  for (const morceau of morceaux) reste = reste.split(morceau).join("");
  return (
    reste.length < 4 ||
    COURANTS.has(reste) ||
    COURANTS.has(delirer(reste)) ||
    estDansUneSuite(reste)
  );
}

export interface PasswordContext {
  /** L'adresse du compte : son début ne fait pas un mot de passe. */
  email?: string | null;
  /** Noms que tout le monde connaît ici : association, école, application. */
  names?: Array<string | null | undefined>;
}

/**
 * Pourquoi ce mot de passe est refusé, ou `null` s'il convient. Le message
 * s'affiche tel quel sous le formulaire.
 */
export function passwordProblem(
  password: string,
  context: PasswordContext = {},
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }

  const simple = simplifier(password);
  const courant =
    "Ce mot de passe fait partie des plus courants, ceux qu’un attaquant essaie en premier. Choisissez-en un autre — une phrase de quelques mots, par exemple.";

  if (new Set(simple).size < 5) {
    return "Ce mot de passe répète trop peu de caractères différents. Choisissez-en un moins prévisible — une phrase de quelques mots, par exemple.";
  }
  // Un motif répété : « abcabcabca », « 1234512345 », « aze123aze123 ».
  // Le motif peut aller jusqu'à la moitié du mot de passe : limité à cinq
  // signes, il laissait passer tout ce qui se répète en plus long.
  const motif = simple.match(
    new RegExp(`^(.{1,${Math.floor(simple.length / 2)}}?)\\1+`),
  );
  if (motif && motif[0].length >= simple.length - 3) {
    return "Ce mot de passe répète un même motif. Choisissez-en un moins prévisible — une phrase de quelques mots, par exemple.";
  }
  // Les chiffres tapés avec Maj (« !@#$%^&*() ») valent les chiffres pour
  // les contrôles de suites : sinon « !@#$%^&*() » passait, alors que c'est
  // « 1234567890 » pour les doigts comme pour les listes d'attaque.
  const decale = redecaler(simple);
  if (
    estDansUneSuite(simple) ||
    estDansUneSuite(decale) ||
    presqueUneSuite(simple) ||
    presqueUneSuite(decale)
  ) {
    return "Ce mot de passe suit une suite du clavier ou de l’alphabet. Choisissez-en un moins prévisible — une phrase de quelques mots, par exemple.";
  }
  if (COURANTS_EXACTS.has(simple) || COURANTS_EXACTS.has(decale)) {
    return courant;
  }

  // Le cœur : ce qui reste une fois ôtés les chiffres et symboles de début
  // et de fin (« Azerty2026! » → « azerty »), puis les substitutions l33t
  // défaites (« P@ssw0rd » → « password »). Dans cet ordre : défaire le l33t
  // d'abord changerait les chiffres de fin en lettres, et « ab12345678 »
  // passerait pour un mot.
  const coeur = delirer(simple.replace(/^[^a-z]+|[^a-z]+$/g, ""));
  const coeurSansSeparateurs = coeur.replace(/[^a-z]/g, "");
  if (
    COURANTS.has(coeur) ||
    COURANTS.has(coeurSansSeparateurs) ||
    (coeurSansSeparateurs.length >= 3 && estDansUneSuite(coeurSansSeparateurs))
  ) {
    return courant;
  }
  // Un mot courant redoublé : « passwordpassword », « Azerty_Azerty »,
  // « Motdepasse2026Motdepasse ». Les listes d'attaque essaient chaque mot
  // doublé juste après le mot seul. Lu sur les lettres seules, avec et sans
  // le l33t défait : « Password1Password1 » garde ses « 1 » comme chiffres.
  for (const lettresSeules of [lettres(password), lettres(delirer(simple))]) {
    const unite = lettresSeules.match(/^(.{3,}?)\1+$/)?.[1];
    if (unite && (COURANTS.has(unite) || estDansUneSuite(unite))) {
      return courant;
    }
  }
  // Rien que des morceaux prévisibles mis bout à bout : « qwer1234qwer »,
  // « abcd1234efgh », « soleil-soleil-2026 » n'ont chacun que des suites du
  // clavier, des mots courants ou des redites d'un morceau précédent.
  if (queDesMorceauxPrevisibles(simple) || queDesMorceauxPrevisibles(decale)) {
    return courant;
  }
  // Un cœur de deux lettres noyé dans des chiffres : « ab12345678 ».
  if (coeurSansSeparateurs.length < 3 && /\d{6,}/.test(decale)) {
    const chiffres = decale.replace(/\D/g, "");
    if (estDansUneSuite(chiffres) || new Set(chiffres).size <= 2) {
      return courant;
    }
  }

  const email = simplifier(context.email?.trim() ?? "");
  const locale = email.split("@")[0] ?? "";
  const localeLettres = lettres(locale);
  if (
    (locale.length >= 4 && simple.includes(locale)) ||
    (localeLettres.length >= 4 &&
      (lettres(password).includes(localeLettres) ||
        localeLettres === coeurSansSeparateurs)) ||
    reprendUnMorceauDeLAdresse(password, locale)
  ) {
    return "Le mot de passe ne doit pas reprendre votre adresse e-mail : c’est la première chose qu’on essaie.";
  }

  for (const nom of context.names ?? []) {
    const nomLettres = lettres(nom ?? "");
    if (nomLettres.length < 4) continue;
    const mots = simplifier(nom ?? "")
      .split(/[^a-z]+/)
      .filter((mot) => mot.length >= 4);
    if (
      lettres(password).includes(nomLettres) ||
      mots.includes(coeurSansSeparateurs) ||
      (coeurSansSeparateurs.length >= 4 &&
        nomLettres.includes(coeurSansSeparateurs))
    ) {
      return "Le mot de passe ne doit pas reprendre le nom de l’association ou de l’école : tout le monde le connaît.";
    }
  }

  return null;
}
