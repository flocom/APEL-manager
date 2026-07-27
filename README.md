# APEL Manager

Outil de gestion de l'**APEL Notre Dame des Flots** (RNA
**W853001441**) : événements, bénévoles, adhérents, comptabilité et documents
de l'association.

> Stack : **Next.js 15** (App Router) · **TypeScript** · **Tailwind CSS** ·
> **Drizzle ORM** + **Neon Postgres** · déploiement **Vercel**.

## Fonctionnalités

- 📅 **Agenda des événements** (vide-grenier, journée du Père Noël, kermesse, vente de pizzas…)
- ✅ **Check-lists de préparation** avec une durée en jours, semaines ou mois indiquant à partir de quand traiter chaque tâche
- 🔔 **Notifications** par e-mail et/ou Telegram quand une tâche approche de l'échéance ou est en retard
- 👥 **Attribution de membres** aux tâches
- 🔐 **Comptes avec plusieurs niveaux de droits** (admin / organisateur / membre)
- 🙋 **Inscription des bénévoles** via un lien public (stands, organisation…)
- 🤝 **Gestion des adhérents** : coordonnées, statut, année scolaire et cotisation
- 💶 **Comptabilité associative** : recettes, dépenses, comptes, catégories et justificatifs
- 📄 **Documents officiels** : procès-verbaux d'AG, attestations et archives
- ✉️ **Réglages e-mail dans l'interface** : configuration et test de Resend
- 🤖 **Serveur MCP distant** : contrôle sécurisé depuis Claude.ai via OAuth 2.1 + PKCE
- 🏠 **Page d'accueil publique** listant les événements à venir
- 🔒 **Dashboard protégé** : connexion obligatoire

## Démarrage rapide

```bash
npm install
cp .env.example .env.local   # renseigner DATABASE_URL (Neon) + secrets
npm run db:push              # crée ou met à jour toutes les tables sur Neon
npm run dev
```

`SETTINGS_ENCRYPTION_KEY` doit contenir au moins 32 caractères avant
d'enregistrer une clé Resend depuis **Configuration**. Cette clé de chiffrement
doit rester stable entre les déploiements.

Voir [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) pour le déploiement Vercel +
Neon, et [`docs/MCP_CLAUDE.md`](docs/MCP_CLAUDE.md) pour connecter Claude.ai.

## Premier compte

Le **premier compte créé** via `/register` devient automatiquement **administrateur**.
Les comptes suivants sont créés en tant que « membre » et peuvent être promus par un admin.
