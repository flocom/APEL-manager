# Déploiement — Vercel + Neon

Ce guide explique comment mettre APEL Manager en ligne sur **Vercel** avec une
base **Neon Postgres**, et comment activer les notifications.

---

## 1. Base de données Neon

1. Créer un projet sur [neon.tech](https://neon.tech).
2. Dans **Dashboard → Connection Details**, copier la **connection string**
   *pooled* (elle contient `-pooler` dans le hostname). Exemple :
   ```
   postgresql://user:password@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   C'est la valeur de `DATABASE_URL`.

### Créer les tables

Deux options, au choix :

**Option A — en local (recommandé)**
```bash
echo 'DATABASE_URL="postgresql://...votre URL Neon..."' > .env.local
npm install
npm run db:push
```

**Option B — sans rien installer**
Ouvrir le **SQL Editor** de Neon et coller le contenu du fichier
[`drizzle/0000_init.sql`](../drizzle/0000_init.sql), puis exécuter.

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
| `NEXT_PUBLIC_APP_URL` | ⭐ recommandé | URL publique du site, ex. `https://apel-manager.vercel.app` |
| `CRON_SECRET` | ✅ | Protège l'endpoint de rappels (qui refuse de s'exécuter sans). Vercel l'envoie automatiquement au Cron. `openssl rand -base64 32` |
| `REMINDER_WINDOW_DAYS` | ⛔ optionnel | Nb de jours avant échéance pour envoyer un rappel (défaut : `3`) |
| `RESEND_API_KEY` | ⛔ optionnel | Clé API [Resend](https://resend.com) pour les e-mails |
| `EMAIL_FROM` | ⛔ optionnel | Expéditeur des e-mails, ex. `APEL <contact@mondomaine.fr>` (défaut : `onboarding@resend.dev`) |
| `TELEGRAM_BOT_TOKEN` | ⛔ optionnel | Token du bot Telegram (via @BotFather) |

Les canaux de notification sont **optionnels** : si `RESEND_API_KEY` et
`TELEGRAM_BOT_TOKEN` ne sont pas définis, l'application fonctionne normalement,
les rappels sont simplement ignorés (et réessayés une fois configurés).

---

## 4. Notifications par e-mail (Resend)

1. Créer un compte sur [resend.com](https://resend.com) (offre gratuite : 3000
   e-mails/mois).
2. Créer une **API Key** → variable `RESEND_API_KEY`.
3. Pour envoyer depuis votre propre domaine, le vérifier dans Resend puis définir
   `EMAIL_FROM`. En test, l'expéditeur `onboarding@resend.dev` fonctionne
   directement.

## 5. Notifications Telegram

1. Sur Telegram, parler à **@BotFather**, commande `/newbot`, suivre les étapes.
   Récupérer le **token** → variable `TELEGRAM_BOT_TOKEN`.
2. Chaque membre qui veut être notifié :
   - démarre une conversation avec le bot et envoie `/start` ;
   - récupère son **Chat ID** (par exemple via le bot **@userinfobot**) ;
   - le renseigne dans **Mon compte → Chat ID Telegram**.

## 6. Le Cron de rappels

- Configuré dans [`vercel.json`](../vercel.json) : exécution quotidienne à 7h00
  UTC sur `/api/cron/notifications`.
- Vercel ajoute automatiquement l'en-tête `Authorization: Bearer $CRON_SECRET`
  si `CRON_SECRET` est défini ; l'endpoint refuse les appels non autorisés.
- Pour tester manuellement : `curl -H "Authorization: Bearer <CRON_SECRET>" https://votre-site/api/cron/notifications`

---

## 7. Premier compte administrateur

Le **premier compte créé** via `/register` reçoit automatiquement le rôle
**administrateur**. Il peut ensuite, depuis **Membres**, promouvoir d'autres
comptes en *Organisateur* ou *Administrateur*.

## Rôles & permissions

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris la gestion des comptes et des rôles |
| **Organisateur** | Créer / modifier les événements, tâches, créneaux ; assigner des membres |
| **Membre** | Consulter, gérer l'avancement de ses tâches assignées, s'inscrire comme bénévole |
