# Déploiement — Vercel + Neon

Ce guide explique comment mettre APEL Manager en ligne sur **Vercel** avec une
base **Neon Postgres**, activer les modules associatifs et configurer les
e-mails sortants.

L'instance est prévue pour l'**APEL Notre Dame des Flots**, enregistrée sous le
numéro RNA **W853001441**.

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
npm install
npm run db:push
```

Cette commande applique notamment les tables des modules **Adhérents**,
**Comptabilité**, **Documents**, ainsi que les réglages mail. Les migrations SQL
versionnées restent disponibles dans [`drizzle/`](../drizzle/) pour audit ou
application manuelle ; dans ce cas, elles doivent toutes être exécutées dans
l'ordre, de `0000` à `0008`.

> Effectuer une sauvegarde de la base avant toute migration en production.

---

## 2. Déploiement Vercel

1. Sur [vercel.com](https://vercel.com), **Add New → Project**, importer
   `flocom/APEL-manager`. Le framework Next.js est détecté automatiquement.
2. Renseigner les **variables d'environnement** (section ci-dessous).
3. **Deploy**. Le `vercel.json` configure déjà le Cron quotidien des rappels.

> ⚠️ Après le premier déploiement, pensez à définir `NEXT_PUBLIC_APP_URL` avec
> l'URL réelle (ex. `https://apel-manager.vercel.app`) puis redéployez, pour que
> les liens dans les e-mails et les liens d'inscription soient corrects.

---

## 3. Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string *pooled* Neon |
| `AUTH_SECRET` | ✅ | Secret de signature des sessions (≥ 32 caractères). Générer : `openssl rand -base64 32` |
| `OAUTH_SECRET` | ⭐ recommandé | Secret dédié au consentement OAuth du serveur MCP. Si absent, `AUTH_SECRET` est utilisé |
| `SETTINGS_ENCRYPTION_KEY` | ✅ | Chiffre les secrets saisis dans l'interface, notamment la clé Resend. Chaîne stable de 32 caractères minimum ; générer avec `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | ⭐ recommandé | URL publique du site, ex. `https://apel-manager.vercel.app` |
| `OAUTH_ISSUER` | ⛔ optionnel | Origine HTTPS de l'autorité OAuth si elle diffère de `NEXT_PUBLIC_APP_URL` |
| `MCP_RESOURCE_URL` | ⛔ optionnel | URL HTTPS exacte du connecteur, terminée par `/api/mcp`, si elle doit être surchargée |
| `CRON_SECRET` | ✅ | Protège l'endpoint de rappels (qui refuse de s'exécuter sans). Vercel l'envoie automatiquement au Cron. `openssl rand -base64 32` |
| `REMINDER_WINDOW_DAYS` | ⛔ optionnel | Nb de jours avant échéance pour envoyer un rappel (défaut : `3`) |
| `RESEND_API_KEY` | ⛔ optionnel | Configuration de secours de la clé [Resend](https://resend.com), si elle n'est pas enregistrée dans l'interface |
| `EMAIL_FROM` | ⛔ optionnel | Expéditeur de secours, ex. `APEL Notre Dame des Flots <contact@mondomaine.fr>` |
| `TELEGRAM_BOT_TOKEN` | ⛔ optionnel | Token du bot Telegram (via @BotFather) |

`SETTINGS_ENCRYPTION_KEY` doit rester **strictement identique** entre les
déploiements. La changer rendrait illisible la clé Resend déjà enregistrée ; il
faudrait alors saisir à nouveau cette dernière.

Les canaux de notification sont optionnels : sans configuration Resend ni
`TELEGRAM_BOT_TOKEN`, l'application fonctionne normalement, mais aucun message
n'est envoyé sur le canal concerné.

---

## 4. Courrier sortant avec Resend

### Configuration depuis l'interface

1. Définir `SETTINGS_ENCRYPTION_KEY` dans `.env.local` et dans les variables
   Vercel, puis redéployer.
2. Exécuter `npm run db:push` pour créer la table de réglages.
3. Créer une clé API dans [Resend](https://resend.com).
4. Se connecter avec un compte administrateur puis ouvrir
   **Tableau de bord → Configuration** (`/dashboard/settings`).
5. Renseigner le nom d'expéditeur, l'adresse d'envoi, l'adresse de réponse et la
   clé API, puis activer l'envoi.
6. Utiliser le formulaire de test de la page avant d'activer les communications
   réelles.

La clé Resend est chiffrée côté serveur avant son stockage. L'interface ne
réaffiche ensuite que ses quatre derniers caractères. Ne jamais inscrire la clé
dans Git, les journaux ou une capture d'écran.

### Passage ultérieur au nom de domaine

En phase de test, Resend permet l'utilisation de son expéditeur de démonstration.
Avant la mise en production :

1. ajouter le futur domaine dans Resend ;
2. publier les enregistrements DNS SPF/DKIM demandés ;
3. attendre que le domaine soit marqué comme vérifié ;
4. renseigner ce domaine et une adresse correspondante dans
   **Configuration**, par exemple
   `APEL Notre Dame des Flots <contact@votre-domaine.fr>` ;
5. envoyer un nouveau message de test.

`RESEND_API_KEY` et `EMAIL_FROM` peuvent rester définis comme solution de
secours, mais les réglages enregistrés et activés dans l'interface sont utilisés
en priorité.

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

L'identité à faire apparaître sur les documents officiels est :

- **APEL Notre Dame des Flots**
- **N° RNA : W853001441**

## 6. Notifications Telegram

1. Sur Telegram, parler à **@BotFather**, commande `/newbot`, suivre les étapes.
   Récupérer le **token** → variable `TELEGRAM_BOT_TOKEN`.
2. Chaque membre qui veut être notifié :
   - démarre une conversation avec le bot et envoie `/start` ;
   - récupère son **Chat ID** (par exemple via le bot **@userinfobot**) ;
   - le renseigne dans **Mon compte → Chat ID Telegram**.

## 7. Le Cron de rappels

- Configuré dans [`vercel.json`](../vercel.json) : exécution quotidienne à 7h00
  UTC sur `/api/cron/notifications`.
- Vercel ajoute automatiquement l'en-tête `Authorization: Bearer $CRON_SECRET`
  si `CRON_SECRET` est défini ; l'endpoint refuse les appels non autorisés.
- Pour tester manuellement : `curl -H "Authorization: Bearer <CRON_SECRET>" https://votre-site/api/cron/notifications`

---

## 8. Premier compte administrateur

Le **premier compte créé** via `/register` reçoit automatiquement le rôle
**administrateur**. Il peut ensuite, depuis **Utilisateurs**, promouvoir d'autres
comptes en *Organisateur* ou *Administrateur*.

## Rôles & permissions

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris adhérents, comptabilité, configuration, comptes et rôles |
| **Organisateur** | Créer / modifier les événements, tâches, créneaux et documents ; assigner des utilisateurs |
| **Membre** | Consulter, gérer l'avancement de ses tâches assignées, s'inscrire comme bénévole |

La procédure complète de connexion du serveur MCP à Claude.ai est décrite dans
[`MCP_CLAUDE.md`](MCP_CLAUDE.md).
