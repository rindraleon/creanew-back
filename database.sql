-- ============================================================================
-- CreaNew — schéma PostgreSQL complet
-- ----------------------------------------------------------------------------
-- Généré à partir du code source réel du projet (entités TypeORM) puis vérifié
-- contre la base effectivement produite par les 9 migrations présentes dans
-- src/database/migrations (dont 1790000000006-AddCollectionAudit). Les noms de
-- contraintes et d'index sont conservés à l'identique, car les migrations les
-- référencent explicitement. L'ordre des valeurs des enums suit l'ordre produit
-- par les migrations (clauses BEFORE des migrations 0004/0006).
--
-- Tables : 28 dont 25 entités TypeORM + email_verification_tokens
--          + initial_admin_state + migrations (infrastructure)
-- Types ENUM : 15     |    Clés étrangères : 29    |    Index explicites : 48
-- Contraintes CHECK : 1 (initial_admin_state.singleton)
-- Triggers : aucun (updated_at est maintenu par l'ORM @UpdateDateColumn)
--
-- Ce script suppose une base vierge (il ne supprime pas le schéma existant).
-- Il est exclusif avec `npm run migration:run` : les deux créent les mêmes objets.
-- ============================================================================

BEGIN;

-- Nécessaire au bon fonctionnement des triggers applicatifs éventuels et à la
-- cohérence des comparaisons de texte.
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;
SET search_path = public, pg_catalog;

-- ============================================================================
-- 1. EXTENSIONS, TYPES PERSONNALISÉS ET FONCTIONS
-- ============================================================================

-- 1.1 Extension d'identifiants UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- 1.2 Repli : si l'extension est indisponible sur le serveur, la migration
-- UuidFallback du projet définit la même fonction sur gen_random_uuid().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'uuid_generate_v4' AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid
      AS 'SELECT gen_random_uuid()' LANGUAGE sql VOLATILE;
  END IF;
END
$$;

-- 1.3 Types énumérés (ordre déclaré = ordre de tri applicatif)

CREATE TYPE public.audit_logs_action_enum AS ENUM (
    'USER_LOGIN',
    'USER_LOGIN_FAILED',
    'USER_LOGOUT',
    'USER_REGISTERED',
    'USER_ROLE_CHANGED',
    'USER_SUSPENDED',
    'USER_REACTIVATED',
    'PROFILE_UPDATED',
    'PASSWORD_CHANGED',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
    'SELLER_REGISTERED',
    'SELLER_APPROVED',
    'SELLER_REJECTED',
    'SELLER_SUSPENDED',
    'SELLER_UPDATED',
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_DELETED',
    'PRODUCT_PUBLISHED',
    'PRODUCT_ARCHIVED',
    'CATEGORY_CREATED',
    'CATEGORY_UPDATED',
    'CATEGORY_DELETED',
    'COLLECTION_CREATED',
    'COLLECTION_UPDATED',
    'COLLECTION_DELETED',
    'COLLECTION_PUBLISHED',
    'ORDER_CREATED',
    'ORDER_STATUS_UPDATED',
    'ORDER_CANCELLED',
    'PAYMENT_SUBMITTED',
    'PAYMENT_VERIFIED',
    'PAYMENT_REJECTED',
    'PAYMENT_REFUNDED',
    'CONTACT_CREATED',
    'CONTACT_REPLIED',
    'CONVERSATION_CREATED',
    'MESSAGE_SENT',
    'FILE_UPLOADED',
    'FILE_DELETED'
);

CREATE TYPE public.audit_logs_entity_enum AS ENUM (
    'user',
    'seller',
    'product',
    'category',
    'order',
    'payment',
    'cart',
    'file',
    'auth',
    'collection'
);

CREATE TYPE public.contact_messages_status_enum AS ENUM (
    'new',
    'read',
    'replied',
    'archived'
);

CREATE TYPE public.conversations_status_enum AS ENUM (
    'open',
    'closed'
);

CREATE TYPE public.notifications_channel_enum AS ENUM (
    'in_app',
    'email',
    'both'
);

CREATE TYPE public.notifications_type_enum AS ENUM (
    'ORDER_CREATED',
    'ORDER_PAID',
    'ORDER_STATUS_CHANGED',
    'PAYMENT_SUBMITTED',
    'PAYMENT_VERIFIED',
    'PAYMENT_REJECTED',
    'SELLER_APPLICATION_RECEIVED',
    'SELLER_APPROVED',
    'SELLER_REJECTED',
    'SELLER_SUSPENDED',
    'LOW_STOCK',
    'CONTACT_MESSAGE',
    'CONVERSATION_MESSAGE'
);

CREATE TYPE public.order_status_history_new_status_enum AS ENUM (
    'pending_payment',
    'payment_submitted',
    'paid',
    'processing',
    'ready',
    'shipped',
    'delivered',
    'cancelled',
    'rejected'
);

CREATE TYPE public.order_status_history_previous_status_enum AS ENUM (
    'pending_payment',
    'payment_submitted',
    'paid',
    'processing',
    'ready',
    'shipped',
    'delivered',
    'cancelled',
    'rejected'
);

CREATE TYPE public.orders_shipping_method_enum AS ENUM (
    'standard',
    'express',
    'pickup'
);

CREATE TYPE public.orders_status_enum AS ENUM (
    'pending_payment',
    'payment_submitted',
    'paid',
    'processing',
    'ready',
    'shipped',
    'delivered',
    'cancelled',
    'rejected'
);

CREATE TYPE public.payments_provider_enum AS ENUM (
    'mvola',
    'orange_money',
    'airtel_money'
);

CREATE TYPE public.payments_status_enum AS ENUM (
    'pending',
    'submitted',
    'verified',
    'rejected',
    'refunded'
);

CREATE TYPE public.products_status_enum AS ENUM (
    'draft',
    'pending_review',
    'published',
    'out_of_stock',
    'archived'
);

CREATE TYPE public.sellers_status_enum AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);

CREATE TYPE public.users_role_enum AS ENUM (
    'customer',
    'seller',
    'admin'
);


-- ============================================================================
-- 2. TABLES INDÉPENDANTES
-- ============================================================================
-- Aucune colonne de ces tables ne référence une autre table, hormis la référence réflexive categories.parent_id.

-- users : Comptes de la plateforme. Suppression logique via deleted_at ; email et username restent uniques parmi les lignes non supprimées (index partiels).
CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(190) NOT NULL,
    password_hash character varying NOT NULL,
    first_name character varying(120),
    last_name character varying(120) NOT NULL,
    phone character varying(40),
    role public.users_role_enum DEFAULT 'customer'::public.users_role_enum NOT NULL,
    avatar_object_key character varying,
    is_active boolean DEFAULT true NOT NULL,
    is_email_verified boolean DEFAULT false NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    username character varying(30) DEFAULT ('user_'::text || substr(replace((public.uuid_generate_v4())::text, '-'::text, ''::text), 1, 25)) NOT NULL,
    provider character varying(30),
    provider_id character varying(190),
    avatar_url character varying,
    session_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id)
);

-- categories : Arborescence limitée à deux niveaux. parent_id pointe vers categories (ON DELETE SET NULL), jamais de cycle applicatif.
CREATE TABLE public.categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(120) NOT NULL,
    slug character varying(160) NOT NULL,
    description text,
    image_object_key character varying,
    image_url character varying(500),
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    parent_id uuid,
    CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY (id)
);

-- collections : Mises en avant éditoriales. product_ids est un tableau JSON d'identifiants produits (aucune table de liaison : choix du modèle de données).
CREATE TABLE public.collections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(160) NOT NULL,
    slug character varying(180) NOT NULL,
    tagline character varying(220),
    description text,
    cover_image_url character varying(500),
    cover_object_key character varying(500),
    product_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT "PK_collections" PRIMARY KEY (id)
);

-- site_settings : Contenus éditoriaux clé/valeur (clé primaire = key).
CREATE TABLE public.site_settings (
    key character varying(120) NOT NULL,
    value jsonb NOT NULL,
    description character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_site_settings" PRIMARY KEY (key)
);

-- contact_messages : Messages du formulaire de contact, avec réponse administrateur.
CREATE TABLE public.contact_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(160) NOT NULL,
    email character varying(190) NOT NULL,
    subject character varying(160),
    message text NOT NULL,
    status public.contact_messages_status_enum DEFAULT 'new'::public.contact_messages_status_enum NOT NULL,
    admin_reply text,
    replied_at timestamp with time zone,
    ip character varying(45),
    user_agent character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_contact_messages" PRIMARY KEY (id)
);

-- audit_logs : Journal d'audit append-only. user_id volontairement SANS clé étrangère pour conserver la trace après suppression d'un compte.
CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    action public.audit_logs_action_enum NOT NULL,
    entity public.audit_logs_entity_enum NOT NULL,
    entity_id character varying,
    ip_address character varying(64),
    user_agent character varying(400),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id)
);

-- idempotency_keys : Anti-double soumission (payment/order). user_id sans clé étrangère, portée applicative.
CREATE TABLE public.idempotency_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    scope character varying(60) NOT NULL,
    key character varying(200) NOT NULL,
    user_id uuid,
    request_hash character varying(128) NOT NULL,
    response jsonb,
    status_code integer,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_8ad20779ad0411107a56e53d0f6" PRIMARY KEY (id)
);

-- initial_admin_state : Verrou à ligne unique garantissant qu'un seul administrateur initial est créé. CHECK (singleton) + PK sur la même colonne.
CREATE TABLE public.initial_admin_state (
    singleton boolean DEFAULT true NOT NULL,
    initialized_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "initial_admin_state_pkey" PRIMARY KEY (singleton),
    CONSTRAINT initial_admin_state_singleton_check CHECK (singleton)
);


-- ============================================================================
-- 3. TABLES DÉPENDANTES
-- ============================================================================
-- Chaque table référence des tables déjà déclarées ci-dessus. Les clés étrangères sont ajoutées en section 5 pour éviter tout problème d'ordre.

-- sellers : Boutique vendeur, 1:1 avec users (contrainte UNIQUE sur user_id). reviewed_by_id référence l'administrateur qui a validé, sans clé étrangère.
CREATE TABLE public.sellers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    shop_name character varying(160) NOT NULL,
    slug character varying(190) NOT NULL,
    description text,
    phone character varying(40),
    city character varying(200),
    address_line character varying(250),
    status public.sellers_status_enum DEFAULT 'pending'::public.sellers_status_enum NOT NULL,
    document_keys jsonb DEFAULT '[]'::jsonb NOT NULL,
    logo_object_key character varying,
    rejection_reason text,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    reviewed_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT "PK_97337ccbf692c58e6c7682de8a2" PRIMARY KEY (id),
    CONSTRAINT "REL_83f4670f0e114d0be3731bade8" UNIQUE (user_id)
);

-- addresses : Carnet d'adresses client.
CREATE TABLE public.addresses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    label character varying(60),
    full_name character varying(160) NOT NULL,
    phone character varying(40) NOT NULL,
    address_line1 character varying(200) NOT NULL,
    address_line2 character varying(200),
    postal_code character varying(20),
    city character varying(120) NOT NULL,
    country character varying(120) DEFAULT 'Madagascar'::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY (id)
);

-- email_verification_tokens : Table créée par la migration 1790000000002 ; aucune entité TypeORM ne la déclare aujourd'hui.
CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email character varying(190) NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY (id),
    CONSTRAINT "email_verification_tokens_token_hash_key" UNIQUE (token_hash)
);

-- password_reset_tokens : Jetons de réinitialisation hachés (SHA-256), usage unique.
CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY (id),
    CONSTRAINT "UQ_91185d86d5d7557b19abbb2868b" UNIQUE (token_hash)
);

-- refresh_tokens : Jetons de rafraîchissement hachés, avec rotation et détection de réutilisation (replaced_by_id, revoked_at).
CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_id uuid,
    user_agent character varying(400),
    ip_address character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id)
);

-- carts : Panier 1:1 par utilisateur.
CREATE TABLE public.carts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY (id),
    CONSTRAINT "REL_2ec1c94a977b940d85a4f498ae" UNIQUE (user_id)
);

-- wishlists : Liste de souhaits 1:1 par utilisateur.
CREATE TABLE public.wishlists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_d0a37f2848c5d268d315325f359" PRIMARY KEY (id),
    CONSTRAINT "REL_b5e6331a1a7d61c25d7a25cab8" UNIQUE (user_id)
);

-- products : Produits du catalogue, slug unique parmi les lignes non supprimées.
CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    seller_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(220) NOT NULL,
    description text,
    short_description character varying(500),
    price integer NOT NULL,
    compare_at_price integer,
    stock integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer,
    sku character varying(80),
    status public.products_status_enum DEFAULT 'draft'::public.products_status_enum NOT NULL,
    material character varying(200),
    dimensions character varying(120),
    is_featured boolean DEFAULT false NOT NULL,
    is_new boolean DEFAULT true NOT NULL,
    rating_average numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY (id)
);

-- product_images : Galerie produit (object_key + url locale).
CREATE TABLE public.product_images (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    object_key character varying(500) NOT NULL,
    url character varying(500),
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    alt character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY (id)
);

-- orders : Commandes multi-vendeurs découpées ensuite en order_items. Adresse figée en JSONB.
CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_number character varying(40) NOT NULL,
    user_id uuid NOT NULL,
    status public.orders_status_enum DEFAULT 'pending_payment'::public.orders_status_enum NOT NULL,
    subtotal integer NOT NULL,
    discount integer DEFAULT 0 NOT NULL,
    promo_code character varying(40),
    shipping_method public.orders_shipping_method_enum DEFAULT 'standard'::public.orders_shipping_method_enum NOT NULL,
    shipping_cost integer DEFAULT 0 NOT NULL,
    total integer NOT NULL,
    currency character varying(3) DEFAULT 'MGA'::character varying NOT NULL,
    shipping_address jsonb NOT NULL,
    customer_name character varying(160) NOT NULL,
    customer_email character varying(190) NOT NULL,
    customer_phone character varying(40),
    notes text,
    placed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY (id)
);

-- payments : Paiements Mobile Money (MVola / Orange Money / Airtel Money) avec preuve et vérification administrateur.
CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    provider public.payments_provider_enum NOT NULL,
    transaction_reference character varying(120) NOT NULL,
    amount integer NOT NULL,
    currency character varying(3) DEFAULT 'MGA'::character varying NOT NULL,
    status public.payments_status_enum DEFAULT 'pending'::public.payments_status_enum NOT NULL,
    payer_phone character varying(40),
    proof_object_key character varying(500),
    submitted_at timestamp with time zone,
    verified_at timestamp with time zone,
    verified_by uuid,
    rejection_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id)
);

-- order_status_history : Historique des transitions de statut d'une commande.
CREATE TABLE public.order_status_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    previous_status public.order_status_history_previous_status_enum,
    new_status public.order_status_history_new_status_enum NOT NULL,
    changed_by character varying,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY (id)
);

-- notifications : Notifications in-app et/ou e-mail.
CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type public.notifications_type_enum NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    channel public.notifications_channel_enum DEFAULT 'both'::public.notifications_channel_enum NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_sent_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id)
);

-- conversations : Messagerie client/vendeur, rattachable à une commande. seller_id sans clé étrangère.
CREATE TABLE public.conversations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    subject character varying(220) NOT NULL,
    order_id uuid,
    created_by uuid NOT NULL,
    seller_id uuid,
    status public.conversations_status_enum DEFAULT 'open'::public.conversations_status_enum NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_conversations" PRIMARY KEY (id)
);

-- messages : Messages d'une conversation.
CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_messages" PRIMARY KEY (id)
);


-- ============================================================================
-- 4. TABLES INTERMÉDIAIRES (ManyToMany et lignes de commande)
-- ============================================================================
-- Tables de liaison porteuses d'au moins une clé étrangère et d'une contrainte d'unicité composite.

-- cart_items : Table de liaison carts <-> products (UNIQUE (cart_id, product_id)).
CREATE TABLE public.cart_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY (id)
);

-- wishlist_items : Table de liaison wishlists <-> products (UNIQUE (wishlist_id, product_id)).
CREATE TABLE public.wishlist_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wishlist_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_0bd52924a97cda208ed2a07bd69" PRIMARY KEY (id)
);

-- order_items : Lignes de commande : instantané du produit au moment de l'achat (nom, prix, total figés).
CREATE TABLE public.order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    seller_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(220),
    image_url character varying(500),
    sku character varying(80),
    unit_price integer NOT NULL,
    quantity integer NOT NULL,
    line_total integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY (id)
);

-- conversation_participants : Table de liaison conversations <-> users (UNIQUE (conversation_id, user_id)).
CREATE TABLE public.conversation_participants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    CONSTRAINT "PK_conversation_participants" PRIMARY KEY (id),
    CONSTRAINT "UQ_cp" UNIQUE (conversation_id, user_id)
);


-- ============================================================================
-- 5. TABLE D'INFRASTRUCTURE
-- ============================================================================
-- Suivi des migrations TypeORM. Voir l'avertissement en tête de fichier.

-- migrations : Table de suivi TypeORM. À créer uniquement si l'on n'exécute PAS npm run migration:run.
CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL,
    CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id)
);

-- Séquences : la seule séquence du schéma est celle de la table migrations.
CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;

-- migration id : bigint non auto-incrémenté côté TypeORM, la séquence ci-dessus sert de repli
ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


-- ============================================================================
-- 6. CLÉS ÉTRANGÈRES (ON DELETE / ON UPDATE)
-- ============================================================================
-- CASCADE  : la ligne fille n'a pas de sens sans la ligne mère
-- RESTRICT : suppression de la mère interdite tant que des filles existent
--             (products.category_id, order_items.seller_id, orders.user_id)
-- SET NULL : la ligne fille survit en perdant sa référence
--             (order_items.product_id, conversations.order_id, categories.parent_id)
-- Aucune clause ON UPDATE n'est définie : les clés sont des UUID immuables.


ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wishlist_items
    ADD CONSTRAINT "FK_177397e044732e7e9c0215cd5b7" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT "FK_30e89257a105eab7648a35c7fce" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "FK_425ee27c69d6b8adc5d6475dcfe" FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wishlist_items
    ADD CONSTRAINT "FK_754a9ecec7627d432c2134dd00e" FOREIGN KEY (wishlist_id) REFERENCES public.wishlists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sellers
    ADD CONSTRAINT "FK_83f4670f0e114d0be3731bade87" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "FK_conversations_creator" FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT "FK_cp_conversation" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT "FK_cp_user" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "FK_f8f897401fd91b6b2e8534c2265" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_fc2beb4403c1d6267b003e0889c" FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_fd9d07d1f1457c1147418d6cbc4" FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "FK_messages_conversation" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "FK_messages_sender" FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "fk_categories_parent" FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


-- ============================================================================
-- 7. INDEX ET CONTRAINTES SUPPLÉMENTAIRES
-- ============================================================================
-- Les index partiels (WHERE ...) portent des règles métier fortes :
--   * idx_users_email_active / idx_users_username_active : l'unicité ne
--     s'applique qu'aux comptes non supprimés logiquement ;
--   * idx_users_oauth_identity_unique : une identité OAuth ne peut être
--     rattachée qu'à un seul compte actif ;
--   * idx_products_slug : slug unique parmi les produits non supprimés ;
--   * idx_payments_reference_active : une référence de transaction Mobile Money
--     ne peut être active (pending/submitted/verified) qu'une seule fois.

-- addresses
CREATE INDEX idx_addresses_user ON public.addresses USING btree (user_id);

-- audit_logs
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);

-- cart_items
CREATE UNIQUE INDEX idx_cart_items_cart_product ON public.cart_items USING btree (cart_id, product_id);

-- carts
CREATE UNIQUE INDEX idx_carts_user ON public.carts USING btree (user_id);

-- categories
CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);
CREATE UNIQUE INDEX idx_categories_slug ON public.categories USING btree (slug);

-- collections
CREATE INDEX idx_collections_position ON public.collections USING btree ("position");
CREATE UNIQUE INDEX idx_collections_slug ON public.collections USING btree (slug);

-- contact_messages
CREATE INDEX idx_contact_email ON public.contact_messages USING btree (email);
CREATE INDEX idx_contact_status ON public.contact_messages USING btree (status);

-- conversation_participants
CREATE INDEX idx_cp_conversation ON public.conversation_participants USING btree (conversation_id);
CREATE INDEX idx_cp_user ON public.conversation_participants USING btree (user_id);

-- conversations
CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);

-- email_verification_tokens
CREATE INDEX idx_email_verification_user ON public.email_verification_tokens USING btree (user_id);

-- idempotency_keys
CREATE UNIQUE INDEX idx_idempotency_unique ON public.idempotency_keys USING btree (scope, key);

-- messages
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);

-- notifications
CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, read_at);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);

-- order_items
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_seller ON public.order_items USING btree (seller_id);

-- order_status_history
CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id);

-- orders
CREATE UNIQUE INDEX idx_orders_number ON public.orders USING btree (order_number);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);

-- password_reset_tokens
CREATE INDEX idx_password_reset_user ON public.password_reset_tokens USING btree (user_id);

-- payments
CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);
CREATE UNIQUE INDEX idx_payments_reference_active ON public.payments USING btree (provider, transaction_reference) WHERE (status = ANY (ARRAY['pending'::public.payments_status_enum, 'submitted'::public.payments_status_enum, 'verified'::public.payments_status_enum]));
CREATE INDEX idx_payments_status ON public.payments USING btree (status);

-- product_images
CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);

-- products
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_seller ON public.products USING btree (seller_id);
CREATE UNIQUE INDEX idx_products_slug ON public.products USING btree (slug) WHERE (deleted_at IS NULL);
CREATE INDEX idx_products_status ON public.products USING btree (status);

-- refresh_tokens
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);
CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);

-- sellers
CREATE UNIQUE INDEX idx_sellers_slug ON public.sellers USING btree (slug);
CREATE INDEX idx_sellers_status ON public.sellers USING btree (status);
CREATE UNIQUE INDEX idx_sellers_user ON public.sellers USING btree (user_id);

-- users
CREATE UNIQUE INDEX idx_users_email_active ON public.users USING btree (email) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_users_oauth_identity_unique ON public.users USING btree (provider, provider_id) WHERE ((deleted_at IS NULL) AND (provider IS NOT NULL) AND (provider_id IS NOT NULL));
CREATE INDEX idx_users_provider ON public.users USING btree (provider, provider_id);
CREATE UNIQUE INDEX idx_users_username_active ON public.users USING btree (username) WHERE (deleted_at IS NULL);

-- wishlist_items
CREATE UNIQUE INDEX idx_wishlist_items_unique ON public.wishlist_items USING btree (wishlist_id, product_id);

-- wishlists
CREATE UNIQUE INDEX idx_wishlists_user ON public.wishlists USING btree (user_id);


-- ============================================================================
-- 8. FONCTIONS ET TRIGGERS
-- ============================================================================
-- Aucun trigger n'est défini dans le projet (vérifié : 0 trigger non interne).
-- Les colonnes created_at / updated_at sont gérées par TypeORM
-- (@CreateDateColumn / @UpdateDateColumn) et non par la base.
-- La seule fonction créée par le projet est le repli public.uuid_generate_v4()
-- défini en section 1.2.

COMMIT;

