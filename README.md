<p align="center">
  <img
    src="./public/logo.svg"
    alt="APEL Manager"
    width="96"
  />
</p>

<h1 align="center">APEL Manager</h1>

<p align="center">
  <strong>Le tableau de bord d’une association de parents d’élèves.</strong><br />
  Événements, bénévoles, adhérents, comptabilité et documents réunis dans une
  seule application.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

Application de gestion pour une **APEL** (association de parents d’élèves de
l’enseignement libre) ou toute association scolaire équivalente. Elle centralise
le travail de l’équipe, de la préparation d’un événement jusqu’au suivi
administratif et financier.

Le dépôt ne contient **aucune donnée d’association** : identité, coordonnées,
numéro RNA, événements, adhérents et écritures comptables vivent uniquement dans
la base de l’instance déployée et se saisissent depuis l’application.

## Fonctionnalités

- **Événements et calendrier** — fiches détaillées, export iCalendar, modèles
  réutilisables et inscriptions publiques des bénévoles.
- **Check-lists opérationnelles** — échéances relatives en jours, semaines ou
  mois, responsables, descriptions mises en forme et réorganisation par
  glisser-déposer.
- **Membres et adhérents** — rôles administrateur, organisateur et membre,
  coordonnées, année scolaire, statut et suivi des cotisations.
- **Comptabilité associative** — recettes, dépenses, comptes, catégories,
  validation des écritures et justificatifs privés.
- **Documents officiels** — procès-verbaux d’AG, attestations et archives avec
  pièces jointes protégées.
- **Communication** — e-mails via Resend ou SMTP, notifications Telegram et
  rappels automatiques des tâches.
- **Intégration Claude.ai** — serveur MCP distant sécurisé par OAuth 2.1 et PKCE
  pour piloter les modules selon les droits du compte.

## Démarrage en une commande

Docker Engine et Docker Compose sont les seuls prérequis :

```bash
git clone https://github.com/flocom/APEL-manager.git
cd APEL-manager
docker compose up --build -d
```

| Service | Adresse locale |
|---|---|
| Application | [http://localhost:3000](http://localhost:3000) |
| Boîte e-mail Mailpit | [http://localhost:8025](http://localhost:8025) |
| État de santé | [http://localhost:3000/api/health](http://localhost:3000/api/health) |

Au premier lancement, les secrets internes sont générés, PostgreSQL est
initialisé et les migrations sont appliquées automatiquement. Le **premier
compte créé** depuis `/register` devient administrateur. Il peut ensuite ouvrir
**Configuration** pour renseigner l’identité officielle (nom de l’association,
établissement, e-mail de contact, numéro RNA), les fenêtres de rappel, Telegram
et le fournisseur e-mail.

Les données restent conservées après un `docker compose down`. Pour arrêter la
stack :

```bash
docker compose down
```

## Personnaliser l’identité visuelle

Le logo livré (`public/logo.svg`) est volontairement neutre. Pour afficher celui
de votre association, remplacez ce fichier par le vôtre en conservant le même
nom : aucune modification de code n’est nécessaire. Si le logo ne doit pas être
publié, gardez-le hors du dépôt (montez-le en volume ou ajoutez-le à
`.gitignore` sur votre fork privé).

## Stack Docker complète

| Conteneur | Rôle |
|---|---|
| `app` | Application Next.js 15 et migrations Drizzle |
| `db` | PostgreSQL 16 avec stockage persistant |
| `scheduler` | Rappels quotidiens et nettoyage des imports abandonnés |
| `mailpit` | Serveur SMTP local et boîte de contrôle |
| `caddy` | Reverse proxy HTTP/HTTPS et certificats TLS automatiques |

Des volumes dédiés conservent la base, les pièces jointes, les secrets générés,
les e-mails locaux et les certificats. La procédure de configuration, de
sauvegarde et de mise en production est détaillée dans
[`docs/DOCKER.md`](docs/DOCKER.md).

## Mise en production

Copiez le modèle unique, renseignez les paramètres d’infrastructure, puis
démarrez l’instance. Docker Compose charge automatiquement `.env` :

```bash
cp .env.example .env
docker compose up --build -d
```

Caddy peut obtenir automatiquement un certificat TLS dès qu’un domaine public
pointe vers le serveur. Le choix de **Resend** ou d’un relais **SMTP**, ses
identifiants et l’expéditeur se règlent exclusivement dans **Tableau de bord →
Configuration**. Mailpit reste inclus pour les essais locaux ; sélectionnez
SMTP avec l’hôte `mailpit` et le port `1025`.

Le `.env` ne contient que ce dont l’application a besoin avant de pouvoir lire
la base : URL publique, accès PostgreSQL, secrets de sessions/chiffrement,
stockage, orchestration et ports. L’identité, les rappels, Telegram et la
messagerie se règlent dans l’application. Les mêmes noms d’environnement sont
utilisés en exécution directe, dans Docker et chez un hébergeur.

Claude.ai doit joindre une URL HTTPS publique. Le connecteur personnalisé
utilise alors l’adresse :

```text
https://votre-domaine.fr/api/mcp
```

Consultez [`docs/MCP_CLAUDE.md`](docs/MCP_CLAUDE.md) pour l’authentification et
la connexion du serveur MCP.

## Développement local

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Renseignez au minimum `DATABASE_URL`, `AUTH_SECRET` et
`SETTINGS_ENCRYPTION_KEY` dans `.env`. L’application accepte toute base
PostgreSQL compatible ; le guide Vercel utilise Neon.

> Ne versionnez jamais de données réelles : dumps de base, exports d’adhérents,
> plannings internes, pièces comptables ou fichiers `.env` renseignés.

## Documentation

- [Déploiement Docker complet](docs/DOCKER.md)
- [Connexion MCP à Claude.ai](docs/MCP_CLAUDE.md)
- [Alternative Vercel + Neon](docs/DEPLOIEMENT.md)
