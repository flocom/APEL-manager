import "server-only";

import { secretWeakness } from "@/lib/auth/secrets";
import { baseUrlProblem, configuredBaseUrl } from "@/lib/base-url";

/**
 * Les défauts de configuration qui affaiblissent la sécurité sans empêcher
 * l'application de tourner.
 *
 * Aucun ne la fait s'arrêter : une installation existante, avec un secret un
 * peu court ou sans APP_URL, doit continuer de servir ses membres. Mais ils
 * ne doivent pas non plus passer inaperçus : le journal les écrit au
 * démarrage (instrumentation.ts), et l'écran Configuration comme l'accueil du
 * tableau de bord les montrent aux administrateurs, qui peuvent les corriger.
 */
export interface SecurityConfigWarning {
  id: string;
  titre: string;
  detail: string;
}

function estLocale(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

export function securityConfigWarnings(): SecurityConfigWarning[] {
  const avertissements: SecurityConfigWarning[] = [];

  const adresse = baseUrlProblem();
  if (adresse) {
    avertissements.push({
      id: "app-url",
      titre: "Adresse publique du site non configurée",
      detail: `${adresse}. Les liens envoyés par e-mail ne viennent que de cette adresse, jamais de la requête : sans elle, les e-mails de réinitialisation de mot de passe, de confirmation de compte et les liens de désinscription ne partent pas, et les demandes de compte sont fermées. Définissez APP_URL (par exemple https://apel.example.org) puis redémarrez l’application.`,
    });
  } else {
    const base = configuredBaseUrl();
    if (
      base.startsWith("http:") &&
      !estLocale(base) &&
      process.env.NODE_ENV === "production"
    ) {
      avertissements.push({
        id: "app-url-http",
        titre: "Adresse publique en http://",
        detail:
          "APP_URL commence par http:// : les liens des e-mails ne sont pas chiffrés, et le cookie de session n’est protégé que si le reverse proxy annonce HTTPS. Passez le site en HTTPS et mettez APP_URL à jour.",
      });
    }
  }

  const session = secretWeakness(process.env.AUTH_SECRET);
  if (session) {
    avertissements.push({
      id: "auth-secret",
      titre: "Secret de session trop faible",
      detail: `AUTH_SECRET est trop faible : ${session}. Il signe les sessions : qui le devine peut se connecter sous n’importe quel compte. Remplacez-le par une chaîne aléatoire d’au moins 32 caractères (par exemple « openssl rand -base64 32 ») puis redémarrez : chacun devra se reconnecter une fois${
        process.env.SETTINGS_ENCRYPTION_KEY?.trim()
          ? ""
          : ", et les identifiants chiffrés (messagerie, Telegram, reCAPTCHA) seront à ressaisir dans Configuration, faute de SETTINGS_ENCRYPTION_KEY"
      }.`,
    });
  }

  const oauth = process.env.OAUTH_SECRET?.trim();
  const faiblesseOauth = oauth ? secretWeakness(oauth) : null;
  if (faiblesseOauth) {
    avertissements.push({
      id: "oauth-secret",
      titre: "Secret OAuth trop faible",
      detail: `OAUTH_SECRET est trop faible : ${faiblesseOauth}. Il signe les autorisations données aux connecteurs MCP ; en dessous de 32 caractères, ces autorisations échouent. Remplacez-le par une chaîne aléatoire d’au moins 32 caractères.`,
    });
  }

  const chiffrement = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (chiffrement && chiffrement.length < 32) {
    avertissements.push({
      id: "settings-encryption-key",
      titre: "Clé de chiffrement trop courte",
      detail:
        "SETTINGS_ENCRYPTION_KEY compte moins de 32 caractères : les identifiants saisis dans Configuration ne peuvent pas être chiffrés. Attention, la changer rend illisibles ceux qui l’ont été avec l’ancienne : ils seront à ressaisir dans Configuration.",
    });
  }

  return avertissements;
}
