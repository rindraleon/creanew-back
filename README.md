# CreaNew — backend

API NestJS et PostgreSQL. Prérequis : Node.js 22, npm et PostgreSQL.

## Installation et démarrage

```sh
npm ci
cp .env.example .env
# Renseigner DATABASE_URL et les autres paramètres nécessaires dans .env
npm run migration:run
npm run start:dev
```

`DATABASE_URL` est prioritaire pour l'application et les migrations. Encoder les caractères spéciaux des identifiants dans l'URL. Les anciennes variables `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER` et `DATABASE_PASSWORD` restent utilisables si `DATABASE_URL` est absente. Ne pas publier `.env`.

API : `http://localhost:3000/api` · santé : `/health` · Swagger, si activé : `/docs`.

Pour une **base vierge**, renseigner les variables privées `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_USERNAME` et `INITIAL_ADMIN_PASSWORD` avant le premier démarrage. Le mot de passe doit contenir 12 à 128 caractères, dont une lettre et un chiffre ; le nom d’utilisateur accepte 3 à 30 lettres, chiffres ou `._-`. `INITIAL_ADMIN_FIRST_NAME` et `INITIAL_ADMIN_LAST_NAME` sont facultatifs. L’adresse doit être valide et non jetable. Le compte est créé une seule fois, sans écran d’installation ni confirmation d’e-mail. Retirer les variables après avoir vérifié la connexion ; elles ne modifient pas un compte existant.

Le marqueur `initial_admin_state` empêche la recréation automatique après suppression ou rétrogradation. Sur une base non vierge sans administrateur ni historique identifiable, la création automatique est refusée : restaurer l’accès par une procédure contrôlée. La migration de ce marqueur n’est pas réversible automatiquement. Voir [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md) avant toute mise en production.

La création d'un compte client est gratuite et ne dépend pas de la publication des documents `legal_terms` et `privacy_policy`. Les demandes de compte vendeur restent soumises à l'approbation de l'administrateur. SMTP n'est pas nécessaire pour s'inscrire ni se connecter, mais reste nécessaire pour recevoir les liens de réinitialisation du mot de passe et les autres e-mails. Redis est requis si `QUEUE_ENABLED=true` ; MinIO est requis pour le stockage des fichiers.

## Commandes utiles

```sh
npm run start              # démarrage normal
npm run start:dev          # développement avec rechargement
npm run build              # compilation dans dist/
npm run start:prod         # démarrage de la version compilée
npm run migration:show     # état des migrations
npm run migration:run      # appliquer les migrations
npm run migration:run:prod # appliquer les migrations compilées
npm run lint               # contrôler le code
npm run typecheck          # vérifier les types
npm run format:check       # vérifier le format
npm run format             # formater le code
npm audit --audit-level=high
```

Avant une migration de production, sauvegarder la base et vérifier la procédure sur une copie. Pour la mise à jour de la liste des domaines jetables, voir [docs/AUTH_EMAIL.md](docs/AUTH_EMAIL.md).

## Architecture

```text
src/
├── main.ts, app.module.ts       # démarrage et assemblage NestJS
├── config/                      # variables d'environnement
├── database/                    # connexion et migrations TypeORM
├── common/                      # gardes, validations et utilitaires
├── auth/, users/                # comptes et authentification
├── products/, categories/       # catalogue
├── cart/, orders/, payments/    # panier, commandes et paiements
├── sellers/, admin/             # espaces métier
├── contact/, messaging/         # contact et messagerie
├── notifications/, site-content/ # notifications et contenus
└── shared/                      # e-mail, files, Redis et stockage
.github/                         # CI et configuration de déploiement
Dockerfile                       # image backend
```

Configuration Render : [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md).
