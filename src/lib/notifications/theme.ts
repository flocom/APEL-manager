/**
 * Les briques de mise en page des e-mails.
 *
 * Un e-mail n'est pas une page web. Outlook pour Windows rend le HTML avec le
 * moteur de Word : ni flexbox, ni grille, ni `position`, ni `max-width`, ni
 * `margin:auto`, et les marges d'un `<div>` y sont fantaisistes. Gmail, lui,
 * réécrit le document et jette fréquemment ce qui n'est pas en style en ligne.
 * D'où la discipline de ce fichier, qu'il faut tenir en le modifiant :
 *
 * - la mise en page passe par des `<table role="presentation">`, jamais par des
 *   `<div>` empilés ; les largeurs sont en pixels, en attribut *et* en style ;
 *   les espacements sont des `padding` de cellule, pas des marges ;
 * - tout le style est en ligne — aucune feuille, aucune balise `<style>`,
 *   aucune requête média : ce qui n'est pas en ligne peut disparaître ;
 * - les couleurs de fond sont doublées par un attribut `bgcolor`, que le
 *   moteur de Word comprend mieux que `background-color` ;
 * - `border-radius` et `box-shadow` sont décoratifs : Outlook les ignore et
 *   affiche des angles droits, ce qui reste correct. On ne s'en sert jamais
 *   pour porter une information ;
 * - pas de `-apple-system` dans la pile de polices : le moteur de Word peut
 *   rejeter la déclaration entière et retomber en Times New Roman.
 *
 * Toute la palette vient de celle du site (tailwind.config.ts), pour que les
 * messages et l'application se ressemblent.
 */

/** Pile de polices sûre : Outlook trouve Segoe UI, les autres leur équivalent. */
export const POLICE =
  "'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const COULEURS = {
  /** Fond de la page, derrière la carte blanche. */
  page: "#e8f0f7",
  carte: "#ffffff",
  /** Bandeau d'en-tête (brand-700). */
  bandeau: "#075d8d",
  /** Titres (brand-950). */
  titre: "#082a40",
  /** Texte courant (slate-800) : 12,6:1 sur blanc. */
  texte: "#1e293b",
  /** Texte secondaire (slate-600) : 7,6:1 sur blanc. */
  discret: "#475569",
  bordure: "#dbe7f0",
  /** Fond des encadrés (brand-50 adouci). */
  encadre: "#f3f8fc",
  /** Turquoise des bonnes nouvelles (sea-700) : 6,2:1 sur blanc. */
  accent: "#0e6d68",
  accentFond: "#ecfdf9",
  /** Corail des alertes (coral-700) : 8,6:1 sur blanc. */
  alerte: "#783746",
  alerteFond: "#faf3f4",
  lien: "#075d8d",
} as const;

/** Échappe les valeurs non maîtrisées (nom, titres…) injectées dans le HTML. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Échappe puis rend les retours à la ligne.
 *
 * `white-space:pre-wrap` n'existe pas dans le moteur de Word : un message
 * recopié tel quel y arrivait en un seul bloc. Un `<br>` fonctionne partout.
 */
export function escLignes(value: string): string {
  return esc(value).replace(/\r?\n/g, "<br />");
}

/** Un paragraphe de texte courant. */
export function p(contenu: string, style = ""): string {
  return `<p style="margin:0 0 16px;font-family:${POLICE};font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:${COULEURS.texte};${style}">${contenu}</p>`;
}

/** Une ligne discrète : mention légale, précision, signature. */
export function pDiscret(contenu: string): string {
  return `<p style="margin:0 0 16px;font-family:${POLICE};font-size:14px;line-height:21px;mso-line-height-rule:exactly;color:${COULEURS.discret};">${contenu}</p>`;
}

/** Un intertitre à l'intérieur du message. */
export function section(titre: string, couleur: string = COULEURS.titre): string {
  return `<p style="margin:28px 0 10px;font-family:${POLICE};font-size:18px;line-height:24px;mso-line-height-rule:exactly;font-weight:bold;color:${couleur};">${titre}</p>`;
}

/**
 * La fiche : des couples libellé / valeur dans un encadré.
 *
 * Remplace les `<ul><li>Date : <strong>…</strong></li></ul>` d'avant, dont
 * l'indentation et les puces varient d'un client à l'autre — et qui
 * ressemblaient à une liste de courses plutôt qu'à une fiche de rendez-vous.
 * Les lignes sans valeur sont retirées : pas de « Lieu : » vide.
 *
 * `word-break` autorise la coupure des adresses longues. Sans elle, une
 * adresse e-mail insécable imposait au tableau une largeur minimale qui
 * débordait d'un écran de téléphone — mesuré à 353 px pour une fenêtre de
 * 320. Outlook l'ignore, mais il n'a jamais 320 px de large.
 */
export function fiche(
  lignes: { label: string; valeur: string | null | undefined }[],
): string {
  const remplies = lignes.filter((l) => l.valeur);
  if (remplies.length === 0) return "";
  const rangs = remplies
    .map(
      (l, i) => `
            <tr>
              <td width="34%" style="width:34%;padding:${i === 0 ? "0" : "10px"} 10px 0 0;font-family:${POLICE};font-size:14px;line-height:21px;mso-line-height-rule:exactly;color:${COULEURS.discret};vertical-align:top;word-break:break-word;">${l.label}</td>
              <td style="padding:${i === 0 ? "0" : "10px"} 0 0 0;font-family:${POLICE};font-size:16px;line-height:22px;mso-line-height-rule:exactly;color:${COULEURS.titre};font-weight:bold;vertical-align:top;word-break:break-word;overflow-wrap:break-word;">${l.valeur}</td>
            </tr>`,
    )
    .join("");
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.encadre}" style="width:100%;margin:0 0 20px;background-color:${COULEURS.encadre};border:1px solid ${COULEURS.bordure};border-radius:10px;">
        <tr>
          <td style="padding:18px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${rangs}
            </table>
          </td>
        </tr>
      </table>`;
}

/**
 * Le bouton d'action.
 *
 * Une cellule de tableau colorée plutôt qu'un `<a>` avec du `padding` : le
 * moteur de Word n'applique pas le remplissage d'un lien en ligne, et le
 * bouton s'y réduisait à du texte souligné. Les angles arrondis restent
 * décoratifs — Outlook affichera un rectangle, ce qui va très bien.
 */
export function bouton(
  href: string,
  label: string,
  couleur: string = COULEURS.bandeau,
): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">
        <tr>
          <td align="center" bgcolor="${couleur}" style="background-color:${couleur};border-radius:8px;">
            <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
          </td>
        </tr>
      </table>`;
}

/** Le message d'un tiers, recopié : filet coloré à gauche, fond légèrement teinté. */
export function citation(texteHtml: string): string {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px;">
        <tr>
          <td width="4" bgcolor="${COULEURS.bandeau}" style="width:4px;background-color:${COULEURS.bandeau};font-size:0;line-height:0;">&nbsp;</td>
          <td bgcolor="${COULEURS.encadre}" style="padding:16px 18px;background-color:${COULEURS.encadre};font-family:${POLICE};font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${COULEURS.discret};">${texteHtml}</td>
        </tr>
      </table>`;
}

/** Une information à ne pas manquer : places restantes, consigne, alerte. */
export function encart(
  texteHtml: string,
  ton: "accent" | "alerte" = "accent",
): string {
  const [couleur, fond] =
    ton === "alerte"
      ? [COULEURS.alerte, COULEURS.alerteFond]
      : [COULEURS.accent, COULEURS.accentFond];
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${fond}" style="width:100%;margin:0 0 20px;background-color:${fond};border-radius:10px;">
        <tr>
          <td style="padding:14px 18px;font-family:${POLICE};font-size:16px;line-height:23px;mso-line-height-rule:exactly;font-weight:bold;color:${couleur};">${texteHtml}</td>
        </tr>
      </table>`;
}

/** Un lien dans le corps du texte, coloré comme sur le site. */
export function lien(href: string, label: string): string {
  return `<a href="${href}" style="color:${COULEURS.lien};text-decoration:underline;">${label}</a>`;
}
