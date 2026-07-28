# Déploiement Docker complet

Cette configuration exécute toute l'infrastructure nécessaire à APEL Manager :

- l'application Next.js ;
- PostgreSQL 16 avec stockage persistant ;
- les migrations Drizzle automatiques ;
- le scheduler quotidien des notifications ;
- Mailpit pour capturer et contrôler les e-mails en local ;
- Caddy comme reverse proxy HTTP/HTTPS ;
- un volume privé pour les pièces jointes.

## Démarrage

Docker Engine avec le plugin Docker Compose est le seul prérequis.

```bash
docker compose up --build -d
docker compose ps
```

L'application est disponible sur
[http://localhost:3000](http://localhost:3000) et l'interface Mailpit sur
[http://localhost:8025](http://localhost:8025).

Au premier démarrage, le conteneur :

1. attend que PostgreSQL soit prêt ;
2. génère les secrets internes absents dans le volume `app_config` ;
3. applique dans l'ordre les migrations versionnées du dossier `drizzle/` ;
4. démarre Next.js sous un utilisateur non privilégié.

Le premier compte créé depuis `/register` devient administrateur.

## Services

| Service | Rôle |
|---|---|
| `app` | Application Next.js sur le port interne 3000 |
| `db` | PostgreSQL 16, non exposé sur l'hôte |
| `scheduler` | Appelle le cron de notifications chaque jour à 07:00 UTC |
| `mailpit` | Serveur SMTP local et boîte de contrôle sur le port 8025 |
| `caddy` | Point d'entrée HTTP/HTTPS et terminaison TLS |

Commandes de diagnostic :

```bash
docker compose logs -f app scheduler
docker compose exec app node scripts/migrate.mjs
curl --fail http://localhost:3000/api/health
```

## Données persistantes

| Volume | Contenu |
|---|---|
| `postgres_data` | Base de données complète |
| `uploads_data` | Justificatifs comptables et documents importés |
| `app_config` | Secrets générés automatiquement et conservés entre les redémarrages |
| `mailpit_data` | Messages capturés par Mailpit |
| `caddy_data` | Certificats TLS et état ACME |
| `caddy_config` | État de configuration Caddy |

`docker compose down` arrête les services sans supprimer ces données.

> `docker compose down -v` supprime définitivement la base, les pièces jointes,
> les messages Mailpit, les certificats et les secrets. Cette commande ne doit
> être utilisée que pour réinitialiser volontairement l'instance.

### Sauvegarde de PostgreSQL

```bash
docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > apel-manager.dump
```

Les volumes `uploads_data` et `app_config` doivent être inclus séparément dans
la stratégie de sauvegarde de l'hôte.

## Configuration

Un seul modèle de configuration est utilisé dans toutes les situations :
`.env.example`. Copiez-le en `.env` à la racine ; Docker Compose le charge
automatiquement, sans option supplémentaire :

```bash
cp .env.example .env
docker compose up --build -d
```

Les noms ne changent pas entre une exécution directe avec Node.js, Docker et un
hébergeur. Le fichier contient uniquement la configuration indispensable avant
que l'application puisse accéder à ses réglages en base :

- `APP_URL` et les éventuelles URL OAuth/MCP ;
- `DATABASE_URL` ou les paramètres du PostgreSQL inclus ;
- les secrets de session, OAuth, chiffrement et cron ;
- les limites de stockage, horaires techniques et ports exposés.

Les paramètres métier ne vont pas dans `.env`. L’identité officielle, les
fenêtres de rappel, Telegram, le fournisseur de courrier, ses identifiants et
l’expéditeur se règlent dans `/dashboard/settings`.

Les fichiers `.env*` sont exclus du contexte de construction Docker : les
secrets ne sont jamais intégrés à l'image. Si `AUTH_SECRET`, `OAUTH_SECRET`,
`SETTINGS_ENCRYPTION_KEY` ou `CRON_SECRET` sont vides, le point d'entrée Docker
les génère dans `app_config`. Ils restent stables tant que ce volume est
conservé.

En production, il est préférable de définir explicitement ces quatre secrets
avec des valeurs aléatoires d'au moins 32 caractères. Il faut impérativement
conserver `SETTINGS_ENCRYPTION_KEY` : la changer rend les identifiants Resend ou
SMTP déjà chiffrés illisibles.

Lorsqu’un secret est fourni, le point d’entrée le conserve aussi dans
`app_config`. S’il diffère ensuite de la valeur persistée, le conteneur refuse
de démarrer afin d’éviter une rotation involontaire.

### Mise à niveau depuis les variables `DOCKER_*`

Une ancienne installation peut conserver ses valeurs, mais doit renommer les
clés dans son unique `.env` avant de recréer les conteneurs :

- `DOCKER_APP_URL` → `APP_URL` ;
- `DOCKER_DATABASE_URL` → `DATABASE_URL` ;
- `DOCKER_POSTGRES_DB`, `DOCKER_POSTGRES_USER`,
  `DOCKER_POSTGRES_PASSWORD` → les mêmes noms sans préfixe ;
- `DOCKER_AUTH_SECRET`, `DOCKER_OAUTH_SECRET`,
  `DOCKER_SETTINGS_ENCRYPTION_KEY`, `DOCKER_CRON_SECRET` → les mêmes noms sans
  préfixe, avec **exactement les mêmes valeurs** ;
- les variables Caddy, ports, stockage et scheduler → les mêmes noms sans
  préfixe.

Si les quatre secrets étaient laissés vides et générés automatiquement, les
laisser vides et conserver le volume `app_config`. Sauvegardez PostgreSQL,
`app_config` et `uploads_data`, puis utilisez `docker compose up -d --build
--force-recreate`. Ne lancez jamais `docker compose down -v` pendant cette mise
à niveau.

### Base de données

Avec `DATABASE_URL=""`, le conteneur utilise automatiquement le PostgreSQL
inclus et construit sa connexion à partir des variables canoniques :

```dotenv
POSTGRES_DB=apel_manager
POSTGRES_USER=apel
POSTGRES_PASSWORD=un-mot-de-passe-long-et-unique
```

Une `DATABASE_URL` explicite reste prioritaire, par exemple pour utiliser Neon
ou un PostgreSQL externe. En exécution directe hors Docker, elle doit toujours
pointer vers une base accessible.

### Courrier

Le courrier sortant ne dépend plus de variables d'environnement. Connectez-vous
avec un compte administrateur, ouvrez **Tableau de bord → Configuration**, puis
choisissez :

- **Resend** : clé API, expéditeur, adresse de réponse et domaine ;
- **SMTP** : hôte, port, TLS, identifiant, mot de passe et expéditeur.

Pour un test local entièrement contenu dans Docker, choisissez SMTP avec l'hôte
`mailpit`, le port `1025`, TLS désactivé et aucun identifiant. Les messages
apparaissent sur [http://localhost:8025](http://localhost:8025) sans être remis
sur Internet.

Les secrets saisis dans Configuration sont chiffrés avec
`SETTINGS_ENCRYPTION_KEY`. L'interface Mailpit peut être masquée en production
en retirant son mapping `ports` ou en le limitant à l'adresse `127.0.0.1`.

### Pièces jointes

Les justificatifs et documents signés sont stockés dans `uploads_data` et ne
sont accessibles qu'après authentification. La limite est de 15 Mo par défaut.
Si `UPLOAD_MAX_BYTES` est augmenté, adapter aussi
`CADDY_MAX_UPLOAD_SIZE`. Les imports annulés ou remplacés sont supprimés
par le scheduler après 24 heures, délai configurable avec
`UPLOAD_ORPHAN_MAX_AGE_HOURS`.

### Scheduler

L'heure est exprimée en UTC et peut être modifiée :

```dotenv
SCHEDULER_HOUR_UTC=7
SCHEDULER_MINUTE_UTC=0
```

Pour un test unique au démarrage du scheduler :

```dotenv
RUN_CRON_ON_START=true
```

L'appel est authentifié avec `CRON_SECRET`. Le scheduler réessaie les erreurs
temporaires et recalcule chaque prochaine échéance, sans dérive horaire.

## Domaine public et HTTPS

En local, Caddy répond volontairement en HTTP sur le port 3000. Pour une
instance publique :

1. faire pointer les enregistrements DNS `A`/`AAAA` du domaine vers le serveur ;
2. ouvrir les ports entrants 80 et 443 ;
3. définir les valeurs suivantes ;
4. reconstruire puis redémarrer les services.

```dotenv
CADDY_SITE_ADDRESS=apel.example.org
HTTP_PORT=80
HTTPS_PORT=443
APP_URL=https://apel.example.org
OAUTH_ISSUER=https://apel.example.org
MCP_RESOURCE_URL=https://apel.example.org/api/mcp
```

Sans préfixe `http://` dans `CADDY_SITE_ADDRESS`, Caddy obtient et renouvelle
automatiquement le certificat public. Son volume `caddy_data` doit être
conservé.

Claude.ai ne peut pas joindre une adresse `localhost` ou une adresse privée.
Le serveur MCP nécessite donc inévitablement un domaine public avec un
certificat HTTPS valide. Une fois le DNS et Caddy opérationnels, le connecteur
Claude.ai doit cibler :

```text
https://apel.example.org/api/mcp
```

## Mise à jour

```bash
git pull
docker compose up --build -d
docker image prune
```

Les migrations sont rejouées de manière idempotente avant chaque démarrage de
l'application. Sauvegarder PostgreSQL et les pièces jointes avant une mise à
jour importante. Ne supprimez jamais les volumes `postgres_data`,
`uploads_data` et `app_config` pendant une mise à jour : ils contiennent
respectivement les données, les pièces jointes et les secrets capables de
déchiffrer les réglages enregistrés.
