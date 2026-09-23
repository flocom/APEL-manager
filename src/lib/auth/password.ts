import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** La forme d'une empreinte bcrypt : préfixe, coût, sel et hachage (60 signes). */
const EMPREINTE_BCRYPT = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Vérifie un mot de passe, toujours au prix d'un vrai calcul bcrypt.
 *
 * Sans empreinte utilisable — pas de compte à cette adresse, champ vide, ou
 * valeur qui n'est pas une empreinte bcrypt, qu'une importation aurait pu
 * laisser —, la comparaison se fait contre le leurre, puis la réponse est
 * « non ». bcrypt, lui, répond tout de suite face à une empreinte absente ou
 * mal formée : la réponse arrivait alors en quelques millisecondes au lieu
 * d'une centaine, et le chronomètre disait quelles adresses ont un compte —
 * ce que le formulaire de demande de compte prend tant de soin à taire.
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash || !EMPREINTE_BCRYPT.test(hash)) {
    await bcrypt.compare(password, await dummyPasswordHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * L'empreinte leurre, au même coût que les vraies.
 *
 * Calculée ici, avec `SALT_ROUNDS`, plutôt qu'écrite en dur : un coût relevé
 * un jour la suit d'office, et le leurre ne redevient pas plus rapide que les
 * vraies empreintes. Son mot de passe est tiré au hasard, puis oublié :
 * personne ne peut s'en servir pour entrer.
 */
let leurre: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  leurre ??= bcrypt.hash(randomBytes(32).toString("hex"), SALT_ROUNDS);
  return leurre;
}
