# Déploiement Docker complet

Cette configuration exécute toute l'infrastructure nécessaire à APEL Manager :

- l'application Next.js ;
- PostgreSQL 16 avec stockage persistant ;
- les migrations Drizzle automatiques ;
- le scheduler quotidien des notifications ;
- Mailpit, facultatif, pour capturer les e-mails lors des essais locaux ;
- Caddy comme reverse proxy HTTP/HTTPS ;
- un volume privé pour les pièces jointes.

## Démarrage

Docker Engine avec le plugin Docker Compose est le seul prérequis.

```bash
docker compose up --build -d
docker compose ps
```

L'application est disponible sur
[http://localhost:3000](http://localhost:3000).

Pour des essais sans envoyer de vrais e-mails, démarrez aussi la boîte de
capture Mailpit, puis ouvrez [http://localhost:8025](http://localhost:8025) :

```bash
docker compose --profile mailpit up --build -d
```

Au premier démarrage, le conteneur :

1. attend que PostgreSQL soit prêt ;
2. génère les secrets internes absents dans le volume `app_config` ;
3. applique dans l'ordre les migrations versionnées du dossier `drizzle/` ;
4. démarre Next.js sous un utilisateur non privilégié.

Le premier compte créé depuis `/register` devient administrateur. Les suivants
confirment leur adresse par e-mail — il faut donc configurer la messagerie —,
puis restent en attente jusqu'à leur validation par un administrateur.

## Services

| Service | Rôle |
|---|---|
| `app` | Application Next.js sur le port interne 3000 |
| `db` | PostgreSQL 16, non exposé sur l'hôte |
| `scheduler` | Appelle le cron de notifications chaque jour à 07:00 UTC |
| `mailpit` | Facultatif (profil `mailpit`) : serveur SMTP d'essai et boîte de contrôle sur `127.0.0.1:8025` |
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

Les secrets saisis dans Configuration sont chiffrés avec
`SETTINGS_ENCRYPTION_KEY`. Deux règles protègent le mot de passe SMTP :

- **il ne suit pas un changement de serveur.** Modifier le fournisseur, l'hôte,
  le port ou l'identifiant sans saisir de nouveau mot de passe efface celui qui
  était enregistré — depuis l'écran comme depuis le connecteur MCP. Sans cette
  règle, quiconque pouvait modifier les réglages sans connaître le mot de passe
  n'avait qu'à désigner son propre serveur et demander un e-mail de test pour
  le recevoir ;
- **il ne circule jamais en clair.** Hors relais local, la connexion doit être
  chiffrée : TLS dès la connexion (souvent port 465) ou STARTTLS (souvent
  port 587), certificat vérifié. Un serveur qui ne propose pas STARTTLS est
  refusé. Seuls échappent à cette exigence `localhost`, les adresses
  `127.x.x.x` et `::1`, `host.docker.internal` et les noms sans point d'un
  service du réseau Compose, comme `mailpit`.

#### Mailpit, pour les essais seulement

Mailpit capture les messages sans jamais les distribuer, et tout ce qui y
arrive se lit dans son interface : liens de réinitialisation de mot de passe et
de confirmation de compte compris. Il ne démarre donc que sur demande, avec le
profil `mailpit` :

```bash
docker compose --profile mailpit up -d
# ou, durablement, dans .env, en gardant les profils déjà listés :
# COMPOSE_PROFILES="mailpit", ou "autoupdate,mailpit" si autoupdate y figurait
```

Choisissez ensuite SMTP avec l'hôte `mailpit`, le port `1025`, TLS désactivé et
aucun identifiant. Les messages apparaissent sur
[http://localhost:8025](http://localhost:8025) sans être remis sur Internet.

Cette interface n'écoute que sur `127.0.0.1` de la machine hôte. Depuis un
autre poste, passez par un tunnel SSH plutôt que de la publier :

```bash
ssh -L 8025:127.0.0.1:8025 utilisateur@serveur
```

Pour exiger en plus un mot de passe, renseignez
`MAILPIT_UI_AUTH="utilisateur:mot-de-passe"` dans `.env`. N'utilisez jamais
Mailpit comme relais d'une instance ouverte aux familles : les messages ne
partiraient pas, et chacun resterait lisible dans la boîte.

#### Installation antérieure : l'ancien conteneur Mailpit

Jusqu'à cette version, Mailpit démarrait avec toute installation et publiait
son interface sur toutes les adresses du serveur (`0.0.0.0:8025`). Le passage
sous profil ne l'arrête pas : Compose ignore complètement un service dont le
profil est inactif, et `docker compose up -d`, même avec `--remove-orphans`,
laisse l'ancien conteneur tourner, toujours publié. L'application recréée
reste sur le même réseau, où le nom `mailpit` désigne encore ce conteneur :
une instance qui y relayait son courrier continue donc d'envoyer sans erreur,
et chaque lien de réinitialisation reste lisible par quiconque atteint le
port 8025. L'`updater` n'y change rien : il remplace les images de `app` et
`scheduler`, jamais `compose.yaml` ni les autres conteneurs. Une instance qui
n'a pas refait de `git pull` fait encore tourner l'ancien `compose.yaml`,
donc l'ancien Mailpit.

Sur toute installation antérieure, après le `git pull` :

1. Vérifiez si l'ancienne interface est encore exposée :

   ```bash
   docker ps --filter name=mailpit --format '{{.Names}} {{.Ports}}'
   ```

   Aucune ligne : rien à faire. Des ports qui commencent par `0.0.0.0:`
   (souvent suivis de `[::]:`), par exemple `0.0.0.0:8025->8025/tcp` :
   l'interface est ouverte à tout le réseau, passez à l'étape 2 ou 3.
   `127.0.0.1:8025->8025/tcp` : le conteneur a déjà été recréé.

2. **Mailpit ne sert pas** (le cas de toute instance ouverte aux familles).
   Ouvrez d'abord **Configuration → Serveur d'envoi** : si l'hôte SMTP est
   `mailpit`, aucun message n'a jamais atteint les familles. Choisissez Resend
   ou un vrai relais SMTP et envoyez un e-mail de test avant d'aller plus loin,
   sans quoi chaque envoi échouera une fois le conteneur retiré
   (« getaddrinfo ENOTFOUND mailpit »). Arrêtez et supprimez ensuite le
   conteneur ; `--profile mailpit` rend le service visible à Compose le temps
   de la commande :

   ```bash
   docker compose --profile mailpit rm -sf mailpit
   ```

   Le volume `mailpit_data` conserve les messages capturés, adresses des
   destinataires comprises. Supprimez-le aussi : `docker volume ls --filter
   name=mailpit_data` donne son nom exact, préfixé par celui du projet, puis
   `docker volume rm <nom>`.

3. **Mailpit sert aux essais.** Ajoutez `mailpit` à `COMPOSE_PROFILES` dans
   `.env`, sans retirer les profils déjà présents (par exemple
   `COMPOSE_PROFILES="autoupdate,mailpit"`), puis recréez le conteneur avec le
   nouveau fichier :

   ```bash
   docker compose --profile mailpit up -d mailpit
   ```

   Relancez la commande de l'étape 1 : elle doit maintenant afficher
   `127.0.0.1:8025->8025/tcp`, et plus aucun `0.0.0.0:`.

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

Chaque évolution de `main` déclenche la publication d'une image sur GHCR
(`ghcr.io/flocom/apel-manager:latest`), via le workflow
[`docker-publish.yml`](../.github/workflows/docker-publish.yml). Chaque image
publiée est signée sans clé (Sigstore) par ce workflow : on peut donc vérifier,
avant de l'installer, qu'elle sort bien de ce dépôt (voir plus bas). Quatre
façons de la récupérer, de la plus automatique à la plus contrôlée.

### Automatique

Le service `updater` surveille l'image publiée et remplace `app` et `scheduler`
dès qu'une nouvelle version paraît. Il est inactif tant qu'il n'est pas demandé
explicitement dans `.env` :

```env
COMPOSE_PROFILES="autoupdate"
WATCHTOWER_POLL_INTERVAL="3600"
```

```bash
docker compose up -d
```

Un bouton **Appliquer maintenant** apparaît dans **Configuration → Version et
mises à jour** dès qu'une version plus récente est publiée, pour l'installer
sans attendre le prochain contrôle. Il n'y a rien à configurer : l'API de
déclenchement de l'`updater` demande un jeton, que l'entrypoint de
l'application génère au premier démarrage et conserve dans le volume
`app_config`. Le conteneur `updater-token`, lancé par le même profil, s'assure
qu'il existe avant que l'`updater` ne démarre et le relise. Le port de
l'`updater` n'est jamais publié sur l'hôte, il n'est joignable que depuis le
réseau Compose.

Renseigner `WATCHTOWER_HTTP_API_TOKEN` dans `.env` impose une valeur à la place
de celle qui est générée. C'est facultatif et sans effet sur la sécurité du
déclenchement.

Déroulé d'une mise à jour : l'`updater` détecte l'image, la télécharge, recrée
les conteneurs, l'entrypoint applique les migrations, puis Caddy réachemine le
trafic. Les requêtes reçues pendant la bascule patientent au lieu d'échouer
(`lb_try_duration` dans le Caddyfile). Aucune intervention n'est nécessaire.

Seuls `app` et `scheduler` portent le label
`com.centurylinklabs.watchtower.enable` : PostgreSQL, Caddy et Mailpit ne sont
jamais remplacés automatiquement.

L'`updater` ne met à jour que des images : `compose.yaml` vit sur le serveur et
reste tel quel. Après un `git pull` qui le modifie, `docker compose pull &&
docker compose up -d` applique le nouveau fichier avec la dernière image. Deux
réglages sensibles s'y trouvent, que `docker compose logs updater` permet de
contrôler :

- `WATCHTOWER_HTTP_API_PERIODIC_POLLS` : activer l'API de déclenchement suffit
  à supprimer le contrôle périodique. Les logs doivent afficher
  `Scheduling first run: …` et non `Periodic runs are not enabled.`
- `DOCKER_API_VERSION` : sans elle, Watchtower s'adresse au démon dans une
  version d'API que les moteurs récents refusent
  (« client version 1.25 is too old »).

Cette commande n'arrête pas un service que le nouveau fichier place sous un
profil inactif : son ancien conteneur continue de tourner tel quel. C'est le
cas de Mailpit ; si l'installation précède son passage sous profil, suivez
« Installation antérieure » dans la partie Courrier.

> L'`updater` a besoin d'accéder à `/var/run/docker.sock`, ce qui équivaut à un
> accès root sur l'hôte. À réserver à une machine dont les accès sont
> maîtrisés. Pour vous en passer, laissez `COMPOSE_PROFILES` vide et utilisez
> l'une des méthodes ci-dessous.

#### Ce que l'on accepte avec la mise à jour automatique

Le confort est réel : un correctif de sécurité publié le matin tourne sur
toutes les instances dans l'heure, sans que personne n'ait à s'en occuper. En
contrepartie, l'instance installe **tout** ce qui paraît sous l'étiquette
`latest`, sans le vérifier :

- Watchtower ne contrôle pas les signatures. Quiconque parviendrait à publier
  une image sur `ghcr.io/flocom/apel-manager` — compte d'un mainteneur ou
  workflow compromis — la verrait installée partout dans l'heure, avec accès à
  la base, aux pièces jointes et aux secrets de chiffrement ;
- une version défectueuse part elle aussi partout, avant qu'on ait pu la
  retenir ;
- l'`updater` lui-même dispose du socket Docker, donc des droits root sur
  l'hôte.

Pour une instance qui conserve des données sensibles et dispose de quelqu'un
pour suivre les publications, préférez une version figée et vérifiée (section
suivante) : chaque mise à jour devient une décision, prise après contrôle de la
signature.

### Figée sur une version vérifiée

Une étiquette est un pointeur que le registre permet de déplacer : `latest`
change à chaque publication, et même `sha-2ab04da`, qu'aucune publication
normale ne réécrit, pourrait l'être par qui obtiendrait le droit de publier.
L'**empreinte** d'une image (`sha256:…`) désigne au contraire un contenu précis
et ne change jamais. Figer l'instance sur une empreinte, c'est garantir qu'elle
exécute exactement ce qui a été vérifié.

1. Relever l'empreinte de la version à installer, par exemple celle de
   `latest` (ligne `Digest:` en tête de la réponse) :

   ```bash
   docker buildx imagetools inspect ghcr.io/flocom/apel-manager:latest
   ```

2. Vérifier sa signature avec [cosign](https://docs.sigstore.dev/cosign/system_config/installation/),
   **en version 3.0 ou plus récente**. Le workflow signe avec cosign 3, qui
   range la signature à côté de l'image sous le format « bundle » de Sigstore ;
   une version 2 la cherche ailleurs (étiquette `sha256-….sig`), ne la trouve
   pas et échoue sur une image pourtant correctement signée. Contrôler d'abord
   la version installée — celle des dépôts de certaines distributions est une
   2.x :

   ```bash
   cosign version
   ```

   Avec cosign 2.6, ajouter `--new-bundle-format=true` à la commande
   ci-dessous ; avant 2.6, mettre cosign à jour. La vérification échoue si
   l'image n'a pas été signée par le workflow de publication de ce dépôt,
   depuis `main` ou une étiquette `v*` :

   ```bash
   cosign verify ghcr.io/flocom/apel-manager@sha256:<empreinte> \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     --certificate-identity-regexp '^https://github\.com/flocom/APEL-manager/\.github/workflows/docker-publish\.yml@refs/(heads/main|tags/v.+)$'
   ```

   Un échec avec un cosign à jour signifie que l'image ne vient pas de ce
   workflow : ne pas l'installer.

   Une instance qui suit un fork remplace `flocom/APEL-manager` par le dépôt de
   ce fork, dans `docker buildx imagetools` et `cosign verify` comme dans
   `.env`.

3. Figer l'image dans `.env`, garder l'indicateur de version attentif aux
   nouvelles publications, et désactiver l'`updater` — Watchtower ne remplace
   jamais une image désignée par son empreinte :

   ```env
   APEL_IMAGE="ghcr.io/flocom/apel-manager@sha256:<empreinte>"
   UPDATE_IMAGE="ghcr.io/flocom/apel-manager:latest"
   COMPOSE_PROFILES=""
   ```

   ```bash
   docker compose up -d
   ```

**Configuration → Version et mises à jour** signale ensuite chaque nouvelle
publication. Pour l'installer, reprendre ces trois étapes avec la nouvelle
empreinte. Les images tierces de `compose.yaml` (PostgreSQL, Caddy, Mailpit,
Watchtower) se figent de la même façon, en remplaçant leur étiquette par
`image@sha256:…`.

### Manuelle depuis l'image publiée

```bash
docker compose pull
docker compose up -d
docker image prune
```

`docker compose pull` installe ce que désigne l'étiquette à cet instant : pour
vérifier d'abord, suivez la méthode précédente.

### Manuelle depuis les sources

```bash
git pull
docker compose up --build -d
docker image prune
```

Sur une installation antérieure au passage de Mailpit sous profil, ces
commandes laissent l'ancien conteneur Mailpit publié sur toutes les adresses :
voir « Installation antérieure » dans la partie Courrier.

### Vérifier ce qui tourne

**Configuration → Version et mises à jour** affiche la version installée, sa
révision, sa date de construction, la cadence de l'`updater` et signale si une
version plus récente est publiée. Le bouton **Vérifier maintenant** force un
contrôle immédiat.

Sans session, `/api/health` ne répond que l'état de l'application — c'est ce
qu'utilisent les contrôles de santé de Docker et de Caddy :

```bash
curl -s https://apel.example.org/api/health
{"status":"ok"}
```

La version, la révision et la date de construction ne sont données qu'à un
administrateur connecté : elles désignaient, à qui les lisait depuis Internet,
les instances restées sur une version vulnérable.

Ces indicateurs reposent sur la lecture de l'image publiée dans le registre —
celle que l'`updater` installerait — et non sur le dernier commit du dépôt :
entre une fusion et la fin de la construction il s'écoule une dizaine de
minutes, pendant lesquelles il n'y a rien à installer. Le résultat est mis en
cache dix minutes. Le dépôt GitHub n'est consulté qu'en appoint, pour signaler
une version fusionnée dont l'image n'est pas encore publiée ; cette
consultation échoue sans conséquence. `UPDATE_CHECK_ENABLED="false"` supprime
tout appel sortant : la mise à jour automatique continue de fonctionner, seul
l'indicateur disparaît.

L'écran indique aussi si le service `updater` répond réellement. Une mise à
jour automatique annoncée « activée » alors que le conteneur est arrêté
n'installerait jamais rien : la distinction est faite par une sonde, pas
déduite de la configuration.

### Revenir à la version précédente

Chaque publication pousse, à côté de `latest`, une étiquette `sha-xxxxxxx`
reprenant les sept premiers caractères de la révision, que les publications
suivantes ne déplacent pas. C'est la porte de sortie quand une version ne
démarre pas ; pour une garantie absolue, désignez plutôt l'empreinte, comme
expliqué dans « Figée sur une version vérifiée ».

L'application écrit dans le volume `app_config` la révision du dernier
démarrage réussi. Pour la lire, même application arrêtée :

```bash
docker run --rm -v apel-manager_app_config:/config alpine \
  cat /config/last-good-revision
```

Puis, dans `.env` :

```env
APEL_IMAGE="ghcr.io/flocom/apel-manager:sha-2ab04da"
```

```bash
docker compose up -d
```

Deux points à connaître. D'abord, `docker compose pull && docker compose up -d`
ne répare rien : `latest` désigne justement la version fautive, et la commande
la réinstalle. Ensuite, tant qu'`APEL_IMAGE` désigne une étiquette `sha-`, la
mise à jour automatique est figée — l'`updater` surveille une étiquette qui ne
bouge plus. Remettez `APEL_IMAGE` à `latest` une fois le correctif publié.

Une migration refusée par PostgreSQL n'abîme pas la base : elle est appliquée
d'un seul bloc, donc annulée d'un seul bloc, et le schéma reste celui de la
version précédente. Le conteneur s'arrête alors immédiatement en écrivant la
commande de retour dans ses journaux (`docker compose logs app`), au lieu de
réessayer en boucle.

### Précautions

Les migrations sont rejouées de manière idempotente avant chaque démarrage de
l'application. Sauvegarder PostgreSQL et les pièces jointes avant une mise à
jour importante. Ne supprimez jamais les volumes `postgres_data`,
`uploads_data` et `app_config` pendant une mise à jour : ils contiennent
respectivement les données, les pièces jointes et les secrets capables de
déchiffrer les réglages enregistrés.
