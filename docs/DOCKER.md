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

Les valeurs par défaut permettent un démarrage local immédiat. Pour conserver
une configuration explicite, créer un fichier hors du dépôt, par exemple
`.env.docker`, puis l'utiliser ainsi :

```bash
docker compose --env-file .env.docker up --build -d
```

Exemple :

```dotenv
DOCKER_POSTGRES_DB=apel_manager
DOCKER_POSTGRES_USER=apel
DOCKER_POSTGRES_PASSWORD=un-mot-de-passe-long-et-unique

DOCKER_AUTH_SECRET=une-valeur-aleatoire-stable-de-32-caracteres-minimum
DOCKER_OAUTH_SECRET=une-autre-valeur-aleatoire-stable-de-32-caracteres
DOCKER_SETTINGS_ENCRYPTION_KEY=une-cle-de-chiffrement-stable-de-32-caracteres
DOCKER_CRON_SECRET=un-secret-cron-stable-de-32-caracteres-minimum

DOCKER_APP_URL=http://localhost:3000
DOCKER_CONTACT_EMAIL=contact@example.org
```

Les noms destinés à Compose commencent volontairement par `DOCKER_`. Le fichier
`.env` utilisé en développement local ne peut ainsi pas détourner par
inadvertance le conteneur vers une base Neon ou réutiliser ses secrets. Les
fichiers `.env*` sont exclus du contexte de construction Docker : les secrets
ne sont jamais intégrés à l'image. S'ils sont omis, quatre valeurs aléatoires
sont créées dans `app_config`; elles restent stables tant que ce volume est
conservé.

`DOCKER_APP_URL` alimente `APP_URL` à l'exécution ainsi que l'ancien nom
`NEXT_PUBLIC_APP_URL` pour compatibilité. Les valeurs de marque destinées au
navigateur sont intégrées au bundle lors de la construction ; après leur
modification, relancer avec `--build`.

### Courrier

Par défaut, l'application utilise le SMTP de Mailpit :

```dotenv
DOCKER_MAIL_PROVIDER=smtp
DOCKER_SMTP_HOST=mailpit
DOCKER_SMTP_PORT=1025
DOCKER_SMTP_SECURE=false
DOCKER_SMTP_FROM=APEL Notre Dame des Flots <noreply@localhost>
```

Mailpit capture les messages mais ne les remet pas sur Internet. Pour les
envois réels, renseigner les paramètres d'un relais SMTP externe ou définir
`DOCKER_MAIL_PROVIDER=resend`, puis configurer Resend depuis le tableau de bord.
L'interface Mailpit peut être masquée en production en retirant son mapping
`ports` ou en le limitant à l'adresse `127.0.0.1`.

### Pièces jointes

Les justificatifs et documents signés sont stockés dans `uploads_data` et ne
sont accessibles qu'après authentification. La limite est de 15 Mo par défaut.
Si `DOCKER_UPLOAD_MAX_BYTES` est augmenté, adapter aussi
`DOCKER_CADDY_MAX_UPLOAD_SIZE`. Les imports annulés ou remplacés sont supprimés
par le scheduler après 24 heures, délai configurable avec
`DOCKER_UPLOAD_ORPHAN_MAX_AGE_HOURS`.

### Scheduler

L'heure est exprimée en UTC et peut être modifiée :

```dotenv
DOCKER_SCHEDULER_HOUR_UTC=7
DOCKER_SCHEDULER_MINUTE_UTC=0
```

Pour un test unique au démarrage du scheduler :

```dotenv
DOCKER_RUN_CRON_ON_START=true
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
DOCKER_CADDY_SITE_ADDRESS=apel.example.org
DOCKER_HTTP_PORT=80
DOCKER_HTTPS_PORT=443
DOCKER_APP_URL=https://apel.example.org
DOCKER_OAUTH_ISSUER=https://apel.example.org
DOCKER_MCP_RESOURCE_URL=https://apel.example.org/api/mcp
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
jour importante.
