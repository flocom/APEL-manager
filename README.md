# APEL Manager

Outil de gestion pour une **APEL** (Association de Parents d'élèves) : agenda des
événements, check-lists de préparation, notifications, gestion des bénévoles et
des membres.

> Stack : **Next.js 15** (App Router) · **TypeScript** · **Tailwind CSS** ·
> **Drizzle ORM** + **Neon Postgres** · déploiement **Vercel**.

## Fonctionnalités

- 📅 **Agenda des événements** (vide-grenier, journée du Père Noël, kermesse, vente de pizzas…)
- ✅ **Check-lists de préparation** avec un délai « à gérer X jours avant l'événement »
- 🔔 **Notifications** par e-mail et/ou Telegram quand une tâche approche de l'échéance ou est en retard
- 👥 **Attribution de membres** aux tâches
- 🔐 **Comptes avec plusieurs niveaux de droits** (admin / organisateur / membre)
- 🙋 **Inscription des bénévoles** via un lien public (stands, organisation…)
- 🏠 **Page d'accueil publique** listant les événements à venir
- 🔒 **Dashboard protégé** : connexion obligatoire

## Démarrage rapide

```bash
npm install
cp .env.example .env.local   # renseigner DATABASE_URL (Neon) + secrets
npm run db:push              # crée les tables sur Neon
npm run dev
```

Voir [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) pour le déploiement Vercel + Neon
et la configuration des notifications.

## Premier compte

Le **premier compte créé** via `/register` devient automatiquement **administrateur**.
Les comptes suivants sont créés en tant que « membre » et peuvent être promus par un admin.
