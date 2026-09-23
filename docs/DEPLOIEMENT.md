# Déploiement — Vercel + Neon

Ce guide explique comment mettre APEL Manager en ligne sur **Vercel** avec une
base **Neon Postgres**, activer les modules associatifs et configurer les
e-mails sortants.

L'identité de l'association (nom, établissement, e-mail de contact, numéro RNA)
n'est pas versionnée : elle se saisit après le déploiement dans **Tableau de
bord → Configuration**.

---

## 1. Base de données Neon

1. Créer un projet sur [neon.tech](https://neon.tech).
2. Dans **Dashboard → Connection Details**, copier la **connection string**
   *pooled* (elle contient `-pooler` dans le hostname). Exemple :
   ```
   postgresql://user:password@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   C'est la valeur de `DATABASE_URL`.

### Créer ou mettre à jour les tables

Après chaque installation ou mise à jour du projet, synchroniser le schéma
Drizzle avec Neon :

```bash
npm ci
npm run db:migrate
```

Cette commande applique dans l’ordre les migrations versionnées des modules
**Adhérents**, **Comptabilité**, **Documents**, ainsi que les réglages généraux
et mail. Elles restent disponibles dans [`drizzle/`](../drizzle/) pour audit.

> Effectuer une sauvegarde de la base avant toute migration en production.

---

## 2. Déploiement Vercel

1. Sur [vercel.com](https://vercel.com), **Add New → Project**, importer
   `flocom/APEL-manager`. Le framework Next.js est détecté automatiquement.
2. Renseigner les **variables d'environnement** (section ci-dessous).
3. **Deploy**. Le `vercel.json` configure déjà le Cron quotidien des rappels.

> ⚠️ Après le premier déploiement, pensez à définir `APP_URL` avec
> l'URL réelle (ex. `https://apel-manager.vercel.app`) puis redéployez, pour que
> les liens dans les e-mails et les liens d'inscription soient corrects.

---

## 3. Variables d'environnement

Les noms ci-dessous sont les mêmes que dans `.env.example` et dans Docker
Compose. Ils sont réservés à la configuration indispensable au démarrage ; les
réglages métier et de messagerie sont enregistrés depuis
`/dashboard/settings`.

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string *pooled* Neon |
| `AUTH_SECRET` | ✅ | Secret de signature des sessions (≥ 32 caractères). Générer : `openssl rand -base64 32` |
| `OAUTH_SECRET` | ⭐ recommandé | Secret dédié au consentement OAuth du serveur MCP. Si absent, `AUTH_SECRET` est utilisé |
| `SETTINGS_ENCRYPTION_KEY` | ✅ | Chiffre les secrets saisis dans l'interface, notamment Resend/SMTP. Chaîne stable de 32 caractères minimum ; générer avec `openssl rand -base64 32` |
| `APP_URL` | ⭐ recommandé | URL publique du site, configurable à l'exécution, ex. `https://apel-manager.vercel.app` |
| `OAUTH_ISSUER` | ⛔ optionnel | Origine HTTPS de l'autorité OAuth si elle diffère de `APP_URL` |
| `MCP_RESOURCE_URL` | ⛔ optionnel | URL HTTPS exacte du connecteur, terminée par `/api/mcp`, si elle doit être surchargée |
| `CRON_SECRET` | ✅ | Protège l'endpoint de rappels (qui refuse de s'exécuter sans). Vercel l'envoie automatiquement au Cron. `openssl rand -base64 32` |
| `DATABASE_POOL_MAX` | ⛔ optionnel | Taille du pool par processus ; conserver une valeur faible en serverless |

`SETTINGS_ENCRYPTION_KEY` doit rester **strictement identique** entre les
déploiements. La changer rendrait illisibles les clés et mots de passe déjà
enregistrés ; il faudrait alors les saisir à nouveau.

L’identité de l’association, les fenêtres de rappel, Telegram, Resend et SMTP
se configurent dans **Tableau de bord → Configuration**. Ne copiez jamais leurs
identifiants dans les variables d’environnement : ils sont chiffrés avant leur
stockage.

---

## 4. Courrier sortant

### Configuration depuis l'interface

1. Définir `SETTINGS_ENCRYPTION_KEY` dans le `.env` local et dans les variables
   Vercel, puis redéployer.
2. Exécuter `npm run db:migrate` pour appliquer les migrations.
3. Se connecter avec un compte administrateur puis ouvrir
   **Tableau de bord → Configuration** (`/dashboard/settings`).
4. Choisir **Resend** ou **SMTP**, puis renseigner les champs affichés :
   clé API Resend ou hôte, port, TLS, identifiant et mot de passe SMTP.
5. Renseigner le nom d'expéditeur, l'adresse d'envoi et l'adresse de réponse,
   puis activer l'envoi.
6. Utiliser le formulaire de test de la page avant d'activer les communications
   réelles.

La clé Resend et le mot de passe SMTP sont chiffrés côté serveur avant leur
stockage. L'interface ne les réaffiche jamais en clair. Ne jamais les inscrire
dans Git, les journaux ou une capture d'écran.

Le mot de passe SMTP ne vaut que pour le serveur pour lequel il a été saisi :
changer le fournisseur, l'hôte, le port ou l'identifiant sans le saisir de
nouveau l'efface, depuis l'interface comme depuis le connecteur MCP. Et il ne
circule jamais en clair : hors relais local (`localhost`, conteneur Docker),
le serveur doit accepter TLS dès la connexion (port 465) ou STARTTLS (port
587), avec un certificat valide ; un relais qui ne le propose pas est refusé.

Un déploiement Docker, plutôt que Vercel, installe l'image publiée par ce
dépôt : [`DOCKER.md`](DOCKER.md) décrit comment figer une version par son
empreinte et vérifier sa signature, et ce que l'on accepte en laissant la mise
à jour automatique installer chaque nouvelle image.

### Passage ultérieur au nom de domaine

En phase de test, Resend permet l'utilisation de son expéditeur de démonstration.
Avant la mise en production :

1. ajouter le futur domaine dans Resend ;
2. publier les enregistrements DNS SPF/DKIM demandés ;
3. attendre que le domaine soit marqué comme vérifié ;
4. renseigner ce domaine et une adresse correspondante dans
   **Configuration**, par exemple
   `Nom de l'association <contact@votre-domaine.fr>` ;
5. envoyer un nouveau message de test.

Un relais SMTP peut être utilisé à la place de Resend sans modifier ni
redéployer l'application.

### Telegram

Dans **Configuration**, activez Telegram puis saisissez le token fourni par
**@BotFather**. Le token est chiffré et n’est jamais réaffiché. Chaque membre
qui souhaite recevoir les rappels démarre une conversation avec le bot puis
renseigne son Chat ID dans son compte.

Les délais de rappel des tâches et des créneaux bénévoles se règlent au même
endroit et prennent effet sans redéploiement.

## 5. Modules de gestion associative

Les quatre volets sont accessibles depuis le tableau de bord après application
du schéma avec `npm run db:push`.

### Adhérents

Le volet **Adhérents** conserve l'identité, les coordonnées, l'adresse, le
statut, l'année scolaire et le suivi de cotisation. Ces données sont distinctes
des comptes de connexion et doivent être gérées conformément aux obligations
RGPD de l'association.

### Comptabilité

Le volet **Comptabilité** suit les recettes et dépenses en centimes, les comptes
banque/caisse, les catégories et les justificatifs. Les écritures peuvent être
préparées en brouillon puis validées. Sauvegarder régulièrement la base et
réserver les accès aux responsables autorisés.

### Documents

Le volet **Documents** centralise les procès-verbaux d'assemblée générale, les
attestations liées à un adhérent et les autres archives. Les statuts
**brouillon**, **final** et **archivé** permettent de maîtriser leur cycle de
vie.

L'identité imprimée en en-tête et en pied de ces documents (nom de
l'association, établissement et numéro RNA) provient de **Configuration**. Le
numéro RNA reste facultatif : s'il est vide, il n'apparaît pas sur les
documents.

## 6. Le Cron de rappels

- Configuré dans [`vercel.json`](../vercel.json) : exécution quotidienne à 7h00
  UTC sur `/api/cron/notifications`.
- Vercel ajoute automatiquement l'en-tête `Authorization: Bearer $CRON_SECRET`
  si `CRON_SECRET` est défini ; l'endpoint refuse les appels non autorisés.
- Pour tester manuellement : `curl -H "Authorization: Bearer <CRON_SECRET>" https://votre-site/api/cron/notifications`

---

## 7. Premier compte administrateur

Le **premier compte créé** via `/register` reçoit automatiquement le rôle
**administrateur**, et entre tout de suite.

Ensuite, `/register` ne crée plus qu'une **demande** :

1. La personne saisit son nom et son adresse. Un lien, valable 3 jours, part à
   cette adresse ; c'est en l'ouvrant qu'elle choisit son mot de passe. Une
   demande jamais confirmée ne crée aucun compte, n'apparaît nulle part et
   s'efface à son expiration (cron quotidien). Les demandes passent donc par la
   messagerie : tant qu'aucun fournisseur d'e-mail n'est configuré (ou qu'il
   est désactivé), la page d'inscription l'indique et cache le formulaire, et
   l'API `POST /api/auth/register` refuse la demande par une erreur 503 au
   lieu d'accepter une demande qu'aucun lien ne pourrait confirmer. Le tout
   premier compte, lui, n'a pas besoin de messagerie.
2. Une fois l'adresse confirmée, le compte existe **en attente de validation** :
   il peut se connecter, mais ne voit qu'une page qui le lui dit, et l'API comme
   le serveur MCP lui répondent 403.
3. Un administrateur le valide ou le refuse (le compte est alors supprimé) en
   tête de l'écran **Utilisateurs**, où chaque demande affiche une adresse
   confirmée par son titulaire — le nom, lui, est celui qu'il a saisi. Il en
   est prévenu par un compteur dans le menu, un bandeau sur le tableau de bord
   et, **quel que soit le réglage « Avis d'inscription »**, par un e-mail
   quotidien tant qu'un compte attend : la rubrique en tête du récapitulatif
   en mode « Un récapitulatif par jour », un court rappel à part dans les
   autres modes (jamais les deux le même jour). Ce message va à l'adresse de
   contact ; sans adresse de contact, à chaque administrateur. En mode « Un
   e-mail à chaque inscription », un avis part en plus dès qu'une adresse est
   confirmée. Un compte validé entre avec le rôle *Membre* ; l'administrateur
   peut ensuite le promouvoir en *Organisateur* ou *Administrateur*.

`/register` répond la même chose, que l'adresse soit nouvelle ou déjà inscrite :
c'est l'e-mail, reçu par le seul titulaire de l'adresse, qui dit la différence
(un lien de confirmation, ou un rappel qu'un compte existe).

Pour que le formulaire ne serve pas à inonder une boîte au nom de
l'association, les demandes sont plafonnées (valeurs fixées dans
`src/lib/services/account-requests.ts`) :

| Plafond | Valeur | Quand il est atteint |
|---|---|---|
| Toutes connexions confondues | 50 demandes par heure glissante | Réponse **429** « réessayez dans une heure » (en-tête `Retry-After: 3600`) ; rien n'est enregistré ni envoyé. |
| Par connexion (adresse IP) | 10 demandes par heure glissante | Réponse **429**, même forme. Ne s'applique que si l'application connaît l'IP du visiteur (`X-Forwarded-For` ou `X-Real-IP` posé par le reverse proxy) ; sans elle, seul le plafond général joue. |
| Par adresse e-mail | 3 demandes par 24 h glissantes | **Silencieux** : la réponse reste « demande transmise », mais la 4ᵉ demande et les suivantes ne font partir aucun e-mail. Répondre autrement dirait que l'adresse a déjà servi. |
| Comptes en attente de validation | 50 comptes | **Silencieux**, comme ci-dessus : aucun lien de confirmation ne part tant que le bureau n'a pas fait redescendre la file sous ce seuil. |

Les deux plafonds de l'heure ne regardent pas l'adresse saisie : les dire
n'apprend rien sur les comptes. Toute demande acceptée compte dans ces
plafonds, même si elle reste ensuite sans suite. Chaque refus est compté par
motif, sans adresse ni IP, et l'écran **Utilisateurs** comme le récapitulatif
quotidien les présentent motif par motif ; ceux dus aux comptes en attente
disent que le formulaire reste fermé tant qu'ils ne sont pas traités. L'avis
immédiat au bureau, enfin, se tait au-delà de 5 nouveaux comptes en une
heure ; le rappel quotidien prend le relais.

Définissez `APP_URL` : sans elle, les liens envoyés par e-mail (confirmation,
réinitialisation du mot de passe) sont construits à partir de l'en-tête `Host`
de la requête.

Lors de la mise à jour qui introduit cette validation, tous les comptes déjà
existants sont tenus pour validés : personne n'est enfermé dehors.

## Rôles & permissions

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris adhérents, comptabilité, configuration, comptes et rôles |
| **Organisateur** | Créer / modifier les événements, tâches, créneaux et documents ; assigner des utilisateurs ; voir les coordonnées des bénévoles et des invités aux réunions |
| **Membre** | Consulter, gérer l'avancement de ses tâches assignées, s'inscrire comme bénévole ; voit le nom des bénévoles, jamais leurs coordonnées |

Le registre des adhérents (noms, coordonnées, téléphones des fiches) reste
réservé aux administrateurs, y compris lorsqu'il alimente d'autres écrans.

La procédure complète de connexion du serveur MCP à Claude.ai est décrite dans
[`MCP_CLAUDE.md`](MCP_CLAUDE.md).
