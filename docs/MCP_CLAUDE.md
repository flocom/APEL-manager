# Connecter Claude.ai au serveur MCP

L'application expose un serveur MCP distant sécurisé permettant à Claude de
piloter les événements, tâches, bénévoles, modèles, utilisateurs, adhérents,
comptabilité, documents et réglages de l'**APEL Notre Dame des Flots**
(RNA **W853001441**).

## Architecture

- Endpoint MCP Streamable HTTP stateless : `POST /api/mcp`
- Authentification : OAuth 2.1, Authorization Code et PKCE S256
- Enregistrement automatique des clients : DCR
- Jetons d'accès opaques, hashés en base
- Refresh tokens rotatifs avec détection de réutilisation
- Autorisations finales : rôle du compte APEL + scopes OAuth
- Actions sensibles annotées comme destructrices et journalisées

Le serveur expose aussi des ressources MCP (identité, synthèse comptable) et
des prompts pour préparer une AG ou contrôler la comptabilité.

## 1. Préparer le déploiement

Le connecteur Claude.ai doit être joignable publiquement en HTTPS. Définir au
minimum ces noms canoniques dans le même `.env` que celui utilisé par
l'application et Docker Compose :

```env
APP_URL="https://votre-domaine.fr"
AUTH_SECRET="..."
OAUTH_SECRET="..."
SETTINGS_ENCRYPTION_KEY="..."
DATABASE_URL="postgresql://..."
```

`OAUTH_SECRET` doit contenir au moins 32 caractères. `AUTH_SECRET` sert de repli,
mais un secret distinct est préférable. Ces paramètres sont nécessaires avant
que l'application puisse lire ses réglages en base ; ils ne peuvent donc pas
être déplacés dans l'interface.

Si le serveur MCP utilise une autre origine :

```env
OAUTH_ISSUER="https://mcp.votre-domaine.fr"
MCP_RESOURCE_URL="https://mcp.votre-domaine.fr/api/mcp"
```

`MCP_RESOURCE_URL` doit correspondre exactement à l'URL saisie dans Claude,
chemin `/api/mcp` compris.

Appliquer ensuite le schéma :

```bash
npm run db:migrate
```

Les migrations créent les clients, codes, jetons OAuth, le journal d’audit et
les réglages dynamiques.

Les réglages métier ne doivent pas être ajoutés au `.env`. L’identité, les
rappels, Telegram, le fournisseur Resend/SMTP, ses identifiants et l’expéditeur
se configurent dans **Tableau de bord → Configuration**. Claude n’a jamais
besoin de recevoir ces secrets.

## 2. Ajouter le connecteur dans Claude.ai

Dans Claude.ai :

1. Ouvrir **Personnaliser → Connecteurs**.
2. Choisir **Ajouter un connecteur personnalisé**.
3. Saisir `https://votre-domaine.fr/api/mcp`.
4. Laisser Claude enregistrer automatiquement son client OAuth.
5. Cliquer sur **Connecter**.
6. Se connecter avec un compte APEL puis valider l'écran de consentement.

Pour une organisation Team ou Enterprise, un propriétaire ajoute d'abord le
connecteur dans les réglages de l'organisation. Chaque utilisateur connecte
ensuite son propre compte APEL.

Documentation officielle :

- [Connecteurs MCP distants dans Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Spécification MCP](https://modelcontextprotocol.io/specification/)

## 3. Droits accordés

| Rôle APEL | Scopes OAuth | Capacités principales |
|---|---|---|
| Membre | `mcp:read` | Consultation des données autorisées |
| Organisateur | `mcp:read mcp:write` | Événements, tâches, bénévoles, modèles et documents |
| Administrateur | `mcp:read mcp:write` | Tous les volets, dont adhérents, comptabilité, utilisateurs et messagerie |

Le serveur ne propose aucune opération bancaire : la comptabilité enregistre
des écritures et justificatifs mais n'effectue jamais de paiement.

Les suppressions, diffusions d'e-mails et autres opérations sensibles exigent
une confirmation explicite dans les paramètres de l'outil. Les écritures
comptables validées sont immuables ; une correction doit être enregistrée dans
une nouvelle écriture.

## 4. Endpoints de découverte

Les endpoints suivants sont publics par conception :

```text
GET /.well-known/oauth-authorization-server
GET /.well-known/oauth-protected-resource
GET /.well-known/oauth-protected-resource/mcp
POST /api/oauth/register
GET|POST /api/oauth/authorize
POST /api/oauth/token
POST /api/oauth/revoke
```

Les appels à `/api/mcp` sans jeton valide reçoivent un statut HTTP `401` et un
en-tête `WWW-Authenticate` pointant vers les métadonnées de la ressource.
La déconnexion du connecteur révoque toute la famille de jetons OAuth associée.

## 5. Contrôles avant ouverture

- Utiliser une URL HTTPS stable.
- Conserver `AUTH_SECRET`, `OAUTH_SECRET` et `SETTINGS_ENCRYPTION_KEY` hors de
  Git.
- Ajouter une limitation de débit sur les endpoints OAuth et MCP au niveau de
  l'hébergeur ou du WAF.
- Sauvegarder Neon avant les migrations.
- Révoquer un client compromis en passant sa colonne `enabled` à `false`.
- Examiner régulièrement le journal `audit_logs`.
- Ne jamais transmettre une clé Resend ou un mot de passe SMTP à Claude :
  l'interface d'administration est le seul endroit où les saisir.
