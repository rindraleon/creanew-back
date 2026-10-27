# MOBILIER-SHOP — Backend API (NestJS)

Backend **multi-vendeurs (marketplace)** de MOBILIER-SHOP : authentification
JWT, espace vendeur avec validation administrative, catalogue produits, panier
serveur, commandes transactionnelles, paiements Mobile Money Madagascar à
vérification **manuelle**, notifications, stockage objet MinIO et journal
d'audit.

> Le frontend React/Vite reste à la racine du dépôt ; ce dossier `backend/`
> contient uniquement l'API.

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Prérequis](#prérequis)
3. [Configuration (.env)](#configuration-env)
4. [Documentation Swagger](#documentation-swagger)
5. [Architecture](#architecture)
6. [Modèle de données](#modèle-de-données)
7. [Règles métier et sécurité](#règles-métier-et-sécurité)
8. [Endpoints](#endpoints)
9. [Comptes de démonstration](#comptes-de-démonstration)
10. [Migrations et seeds](#migrations-et-seeds)
11. [Tests, lint, build](#tests-lint-build)
12. [Docker](#docker)

---

## Démarrage rapide

```bash
cd backend
npm install
cp .env.example .env          # puis adaptez les secrets

# Base de données : créez une base vide, puis
npm run migration:run         # applique le schéma (jamais synchronize:true)
npm run seed                  # catégories, produits et comptes de démo

npm run start:dev             # http://localhost:3000/api
```

- **Santé** : <http://localhost:3000/health>
- **Swagger** : <http://localhost:3000/docs>

---

## Prérequis

| Dépendance | Version   | Obligatoire | Rôle                                        |
| ---------- | --------- | ----------- | ------------------------------------------- |
| Node.js    | ≥ 20      | ✅          | Exécution                                   |
| PostgreSQL | ≥ 14      | ✅          | Données métier                              |
| Redis      | ≥ 6       | ⚠️          | Cache + files BullMQ (`QUEUE_ENABLED=true`)  |
| MinIO      | récent    | ⚠️          | Stockage objet (images, documents, preuves) |
| SMTP       | —         | ⚠️          | E-mails transactionnels (`MAIL_ENABLED`)     |

⚠️ = optionnel : l'API démarre sans, en dégradant la fonctionnalité
(aucun crash au boot, messages journalisés).

---

## Configuration (.env)

Copiez `.env.example` vers `.env`. **Ne committez jamais `.env`.**

Les variables sont validées au démarrage (schéma Joi dans
`src/config/validation.schema.ts`) : une valeur invalide **empêche le boot**
(fail fast). En `NODE_ENV=production`, le démarrage échoue également si :

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` font moins de 32 caractères ;
- ils contiennent `change-me` ou commencent par `dev-` ;
- les deux secrets sont identiques ;
- `DATABASE_PASSWORD` est vide.

### Principales variables

| Variable                                        | Défaut                   | Rôle                                        |
| ----------------------------------------------- | ------------------------ | ------------------------------------------- |
| `PORT` / `API_PREFIX`                           | `3000` / `api`           | Écoute et préfixe de routes                 |
| `DATABASE_*`                                    | —                        | Connexion PostgreSQL                        |
| `DATABASE_SYNCHRONIZE`                          | `false`                  | ⚠️ doit rester `false` (migrations)          |
| `JWT_ACCESS_SECRET` / `JWT_ACCESS_TTL`          | — / `15m`                | Access token                                |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_TTL`        | — / `30d`                | Refresh token (rotation)                    |
| `THROTTLE_TTL` / `THROTTLE_LIMIT`               | `60` / `30`              | Limitation de débit                         |
| `CORS_ORIGINS`                                  | `http://localhost:5173`  | Origines autorisées (séparées par `,`)      |
| `ARGON2_MEMORY_COST` / `_TIME_COST` / `_PARALLELISM` | `65536` / `3` / `4` | Hachage des mots de passe (Argon2id)        |
| `REDIS_*` / `QUEUE_ENABLED`                     | — / `false`              | Files de travail (e-mails, notifications)   |
| `MINIO_*`, `UPLOAD_MAX_FILE_SIZE`, `_MAX_FILES` | —                        | Stockage objet et limites d'upload          |
| `MAIL_ENABLED`, `SMTP_*`, `MAIL_FROM`           | `false`                  | E-mails                                     |
| `SWAGGER_ENABLED`, `SWAGGER_USER`, `SWAGGER_PASSWORD` | `true` / vide / vide | Doc + protection Basic auth                 |
| `DEFAULT_CURRENCY`                              | `MGA`                    | Ariary malgache — montants **entiers**       |
| `SHIPPING_STANDARD_COST`                        | `10000`                  | Livraison standard (MGA)                     |
| `SHIPPING_EXPRESS_COST`                         | `25000`                  | Livraison express (MGA)                      |
| `FREE_SHIPPING_THRESHOLD`                       | `1500000`                | Seuil de franchise (MGA)                     |
| `DEFAULT_LOW_STOCK_THRESHOLD`                   | `5`                      | Alerte stock faible                          |

---

## Documentation Swagger

Swagger est **généré depuis le code** (décorateurs `@ApiOperation`,
`@ApiResponse`, `@ApiProperty`) et servi sur **`/docs`** (JSON : `/docs-json`).

- Bouton **Authorize** : collez l'`accessToken` renvoyé par `POST /auth/login`
  (le préfixe `Bearer` est ajouté automatiquement).
- En production, protégez la doc avec `SWAGGER_USER` / `SWAGGER_PASSWORD`
  (authentification HTTP Basic sur `/docs` et `/docs-json`).

---

## Architecture

```
src/
├── common/            # enums, codes d'erreur, exceptions, filtres, guards, DTO, utils
├── config/            # configuration + schéma de validation Joi
├── database/          # module TypeORM, migrations, seeds
├── shared/            # redis, storage (MinIO), mail (templates), queue (BullMQ)
├── users/             # profil, adresses
├── auth/              # inscription, login, refresh, reset mot de passe
├── sellers/           # demandes vendeur + validation admin + espace vendeur
├── categories/        # arborescence du catalogue
├── products/          # catalogue, fiches, stock
├── cart/              # panier serveur
├── orders/            # commandes (transaction + verrouillage stock)
├── payments/          # Mobile Money Madagascar, vérification manuelle
├── notifications/     # notifications in-app
├── files/             # upload MinIO
├── analytics/         # tableaux de bord admin / vendeur
├── admin/             # console d'administration
├── audit/             # journal d'audit
├── wishlist/          # favoris
└── health/            # sonde de santé
```

**Chaîne de sécurité par requête :**

1. `JwtAuthGuard` — JWT obligatoire sauf routes `@Public()` (401)
2. `RolesGuard` — rôle du JWT (403)
3. `SellerApprovedGuard` — relit le statut vendeur **en base** (403)
4. `ThrottlerGuard` — limitation de débit (429)
5. `ValidationPipe` global — `whitelist` + `forbidNonWhitelisted` (422)
6. Contrôles de propriété dans les services (403)

---

## Modèle de données

### Énumérations

| Enum             | Valeurs                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `UserRole`       | `customer`, `seller`, `admin`                                                                     |
| `SellerStatus`   | `pending`, `approved`, `rejected`, `suspended`                                                    |
| `ProductStatus`  | `draft`, `published`, `out_of_stock`, `archived`                                                  |
| `OrderStatus`    | `pending_payment`, `payment_submitted`, `paid`, `processing`, `ready`, `shipped`, `delivered`, `cancelled`, `rejected` |
| `PaymentStatus`  | `pending`, `submitted`, `verified`, `rejected`, `refunded`                                        |
| `MobileMoneyProvider` | `mvola`, `orange_money`, `airtel_money`                                                      |
| `ShippingMethod` | `standard`, `express`                                                                             |

### Transitions de commande autorisées

```
pending_payment    → payment_submitted | cancelled | rejected
payment_submitted  → paid | rejected | cancelled | pending_payment
paid               → processing | cancelled
processing         → ready | shipped | cancelled
ready              → shipped | cancelled
shipped            → delivered
delivered | cancelled | rejected → (statuts finaux)
```

Un **vendeur** ne peut appliquer que `processing`, `ready`, `shipped`,
`delivered`, et uniquement sur les commandes contenant ses articles.

### Formats de réponse

**Pagination**

```json
{
  "items": [],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
}
```

**Erreur**

```json
{
  "statusCode": 422,
  "message": "Les données envoyées sont invalides.",
  "code": "VALIDATION_ERROR",
  "errors": { "email": ["email must be an email"] },
  "timestamp": "2026-08-29T07:47:31.071Z",
  "path": "/api/auth/register"
}
```

---

## Règles métier et sécurité

| Règle                              | Implémentation                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Montants serveur                   | Entiers MGA. Prix, sous-total, livraison et total sont **recalculés** côté serveur ; le frontend n'envoie aucun montant. |
| Vendeur approuvé                   | Un vendeur `pending` / `rejected` / `suspended` est bloqué par `SellerApprovedGuard` (statut relu en base, pas celui du JWT). |
| Paiement jamais automatique        | Une `transactionReference` n'est **jamais** une preuve. Le paiement reste `submitted` jusqu'à `POST /admin/payments/{id}/verify`. |
| Référence unique                   | Index partiel unique sur `(provider, transaction_reference)` pour les statuts actifs.               |
| Anti double soumission             | En-tête `Idempotency-Key` sur `POST /orders` et `POST /payments/orders/{id}`.                        |
| Stock et concurrence               | Commande créée dans une transaction avec verrouillage `pessimistic_write` (ids triés → pas de deadlock). |
| Propriété                          | `product.sellerId === request.user.id` (ou admin). Aucun `sellerId` n'est accepté depuis le client.  |
| Mass assignment                    | `forbidNonWhitelisted: true` : un champ non décoré (ex. `role`, `isFeatured`) est rejeté (422).     |
| Mots de passe                      | Argon2id (`m=65536, t=3, p=4`), jamais renvoyés par l'API.                                          |
| Refresh token                      | Rotation à chaque usage + révocation de toute la famille en cas de réutilisation.                   |
| Énumération de comptes             | Message d'échec de connexion identique pour email inconnu et mot de passe erroné.                   |
| Journalisation                     | `audit_logs` : actions sensibles (login, statuts, paiements, validation vendeur).                   |
| Secrets                            | Aucun secret n'est exposé au frontend ; la configuration ne quitte jamais le processus Node.        |

---

## Endpoints

Base : `/api` (sauf `/health` et `/docs`).

### `auth` — Authentification

| Méthode | Chemin                    | Rôle        | Description                                    |
| ------- | ------------------------- | ----------- | ---------------------------------------------- |
| POST    | `/auth/register`          | public      | Créer un compte (`asSeller` → demande vendeur) |
| POST    | `/auth/login`             | public      | Connexion (access + refresh)                   |
| POST    | `/auth/refresh`           | public      | Renouveler l'access token (rotation)           |
| POST    | `/auth/logout`            | auth        | Révoquer le refresh token courant              |
| GET     | `/auth/me`                | auth        | Utilisateur courant + statut vendeur           |
| POST    | `/auth/forgot-password`   | public      | Demander un lien de réinitialisation           |
| POST    | `/auth/reset-password`    | public      | Réinitialiser avec le jeton reçu par e-mail    |

### `users` — Profil

`GET|PATCH /users/me`, `POST /users/me/password`,
`GET|POST /users/me/addresses`, `PATCH|DELETE /users/me/addresses/{id}`,
`POST /users/me/addresses/{id}/default`.

### `wishlist` — Favoris

`GET /wishlist`, `POST /wishlist/items`, `POST /wishlist/items/{productId}/toggle`,
`DELETE /wishlist/items/{productId}`, `DELETE /wishlist`.

### `categories` — Catalogue

`GET /categories`, `GET /categories/{slug}` (publics) ; création, modification et
suppression réservées à l'admin.

### `products` — Produits

`GET /products` (recherche, filtres `category`/`seller`/`minPrice`/`maxPrice`/
`availability`/`featured`, tri `newest`/`price_asc`/`price_desc`/`name_asc`/
`rating`/`popular`), `GET /products/{slug}`, `GET /products/seller/me`,
`POST /products`, `PATCH|DELETE /products/{id}`.

### `cart` — Panier serveur

`GET /cart`, `POST /cart/items`, `PATCH|DELETE /cart/items/{id}`, `DELETE /cart`.
Les lignes sont recalculées serveur (prix au moment de la commande, stock vérifié).

### `orders` — Commandes

`POST /orders` (accepte `Idempotency-Key`), `GET /orders/me`, `GET /orders/{id}`,
`POST /orders/{id}/cancel`, `PATCH /orders/{id}/status`.

### `payments` — Mobile Money Madagascar

`GET /payments/providers` (`mvola`, `orange_money`, `airtel_money`),
`POST /payments/orders/{orderId}`, `GET /payments/orders/{orderId}`,
`POST /payments/{id}/verify`, `POST /payments/{id}/reject`, `GET /payments` (admin).

### `sellers` — Demandes vendeur

`POST /sellers/apply`, `GET /sellers/me`, `PATCH /sellers/me`,
`GET /sellers/me/application`, puis (admin) `GET /sellers`, `GET /sellers/{id}`,
`POST /sellers/{id}/approve|reject|suspend`.

### `seller` — Espace vendeur *(vendeur approuvé)*

`GET /seller/dashboard`, `/seller/orders`, `/seller/orders/{id}`,
`/seller/products`, `/seller/payments`, `/seller/sales`, `/seller/analytics`,
`/seller/profile`.

### `admin` — Administration

`GET /admin/dashboard`, `/admin/analytics`, `/admin/users`,
`PATCH /admin/users/{id}/role`, `POST /admin/users/{id}/suspend|reactivate`,
`GET /admin/sellers`, `/admin/sellers/pending`,
`POST /admin/sellers/{id}/approve|reject|suspend`, `GET /admin/products`,
`GET /admin/orders`, `PATCH /admin/orders/{id}/status`, `GET /admin/payments`,
`POST /admin/payments/{id}/verify|reject`, `GET /admin/categories`,
`GET /admin/audit-logs`.

### Autres

- `notifications` : `GET /notifications`, `GET /notifications/unread-count`,
  `PATCH /notifications/{id}/read`, `POST /notifications/read-all`
- `files` : `POST /files/upload`, `GET /files/presigned-url`, `GET /files/rules`,
  `DELETE /files`
- `health` : `GET /health` (PostgreSQL, Redis, MinIO)

---

## Comptes de démonstration

Générés par `npm run seed` — mot de passe commun : **`Motdepasse1!`**

| Email                     | Rôle                                              |
| ------------------------- | ------------------------------------------------- |
| `admin@example.local`     | Administrateur                                    |
| `seller@example.local`    | Vendeur **approuvé** (Atelier Bois de Rose)       |
| `seller2@example.local`   | Vendeur **approuvé** (Maison Teck & Co)           |
| `pending@example.local`   | Vendeur **en attente** → ne peut pas vendre (403) |
| `customer@example.local`  | Client                                            |

Le seed crée aussi 15 catégories, 12 produits (2 vendeurs) et 2 adresses.

---

## Migrations et seeds

```bash
npm run migration:run        # appliquer les migrations
npm run migration:revert     # revenir en arrière
npm run migration:show       # état des migrations
npm run seed                 # données de démonstration
```

Le schéma est **uniquement** piloté par les migrations
(`src/database/migrations/`) : `DATABASE_SYNCHRONIZE` doit rester `false`, y
compris en développement, pour garantir la reproductibilité.

---

## Tests, lint, build

```bash
npm test           # 73 tests unitaires (auth, autorisation, produits, commandes, paiements, vendeurs)
npm run test:cov   # couverture
npm run lint       # ESLint + Prettier
npm run build      # compilation
```

Les tests couvrent les règles critiques : garde de rôle, vendeur approuvé,
propriété des produits (IDOR), transitions de commande, remise en stock,
paiement jamais vérifié automatiquement, rotation et réutilisation des refresh
tokens, pagination.

---

## Docker

Depuis la **racine du dépôt** :

```bash
docker compose up -d --build
docker compose exec api npm run migration:run
docker compose exec api npm run seed
```

Voir [`../docker-compose.yml`](../docker-compose.yml). Deux variables sont
obligatoires au démarrage en production — l'API refuse de démarrer sans elles :

```bash
export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
export JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
```

---

## Dépannage

| Symptôme                                             | Cause probable                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Configuration de production invalide` au démarrage   | Secrets JWT trop courts / par défaut / identiques en `NODE_ENV=production`       |
| `relation "users" does not exist`                    | Migrations non appliquées : `npm run migration:run`                              |
| `MinIO non configuré : buckets non initialisés`       | `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` vides — fonctionnalité désactivée        |
| `422 VALIDATION_ERROR` sur une requête pourtant valide | Champ non décoré envoyé dans le corps (`forbidNonWhitelisted`)                  |
| `403 SELLER_NOT_APPROVED`                            | Le vendeur n'est pas `approved` : l'admin doit valider la demande                |
| `409 PAYMENT_ALREADY_VERIFIED`                       | Un paiement est déjà en cours/vérifié pour cette commande                        |
