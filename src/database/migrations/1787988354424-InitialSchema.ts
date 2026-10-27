import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1787988354424 implements MigrationInterface {
  name = 'InitialSchema1787988354424';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const uuidExtension = (await queryRunner.query(
      "SELECT COUNT(*)::int AS count FROM pg_available_extensions WHERE name = 'uuid-ossp'",
    )) as Array<{ count: number }>;
    if ((uuidExtension[0]?.count ?? 0) > 0) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    } else {
      await queryRunner.query(
        "CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS 'SELECT gen_random_uuid()' LANGUAGE sql VOLATILE",
      );
    }
    await queryRunner.query(
      `CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "label" character varying(60), "full_name" character varying(160) NOT NULL, "phone" character varying(40) NOT NULL, "address_line1" character varying(200) NOT NULL, "address_line2" character varying(200), "postal_code" character varying(20), "city" character varying(120) NOT NULL, "country" character varying(120) NOT NULL DEFAULT 'Madagascar', "is_default" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_addresses_user" ON "addresses" ("user_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'seller', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(190) NOT NULL, "password_hash" character varying NOT NULL, "first_name" character varying(120) NOT NULL, "last_name" character varying(120) NOT NULL, "phone" character varying(40), "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer', "avatar_object_key" character varying, "is_active" boolean NOT NULL DEFAULT true, "is_email_verified" boolean NOT NULL DEFAULT false, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_email_active" ON "users" ("email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "slug" character varying(160) NOT NULL, "description" text, "image_object_key" character varying, "image_url" character varying(500), "position" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_categories_slug" ON "categories" ("slug") `);
    await queryRunner.query(
      `CREATE TYPE "public"."sellers_status_enum" AS ENUM('pending', 'approved', 'rejected', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sellers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "shop_name" character varying(160) NOT NULL, "slug" character varying(190) NOT NULL, "description" text, "phone" character varying(40), "city" character varying(200), "address_line" character varying(250), "status" "public"."sellers_status_enum" NOT NULL DEFAULT 'pending', "document_keys" jsonb NOT NULL DEFAULT '[]'::jsonb, "logo_object_key" character varying, "rejection_reason" text, "submitted_at" TIMESTAMP WITH TIME ZONE, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "REL_83f4670f0e114d0be3731bade8" UNIQUE ("user_id"), CONSTRAINT "PK_97337ccbf692c58e6c7682de8a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_sellers_status" ON "sellers" ("status") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_sellers_slug" ON "sellers" ("slug") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_sellers_user" ON "sellers" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "object_key" character varying(500) NOT NULL, "url" character varying(500), "sort_order" integer NOT NULL DEFAULT '0', "is_primary" boolean NOT NULL DEFAULT false, "alt" character varying(200), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_product_images_product" ON "product_images" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('draft', 'pending_review', 'published', 'out_of_stock', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "seller_id" uuid NOT NULL, "category_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "slug" character varying(220) NOT NULL, "description" text, "short_description" character varying(500), "price" integer NOT NULL, "compare_at_price" integer, "stock" integer NOT NULL DEFAULT '0', "low_stock_threshold" integer, "sku" character varying(80), "status" "public"."products_status_enum" NOT NULL DEFAULT 'draft', "material" character varying(200), "dimensions" character varying(120), "is_featured" boolean NOT NULL DEFAULT false, "is_new" boolean NOT NULL DEFAULT true, "rating_average" numeric(3,2) NOT NULL DEFAULT '0', "rating_count" integer NOT NULL DEFAULT '0', "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_products_slug" ON "products" ("slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_products_status" ON "products" ("status") `);
    await queryRunner.query(`CREATE INDEX "idx_products_category" ON "products" ("category_id") `);
    await queryRunner.query(`CREATE INDEX "idx_products_seller" ON "products" ("seller_id") `);
    await queryRunner.query(
      `CREATE TABLE "wishlist_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "wishlist_id" uuid NOT NULL, "product_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0bd52924a97cda208ed2a07bd69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_wishlist_items_unique" ON "wishlist_items" ("wishlist_id", "product_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wishlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_b5e6331a1a7d61c25d7a25cab8" UNIQUE ("user_id"), CONSTRAINT "PK_d0a37f2848c5d268d315325f359" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_wishlists_user" ON "wishlists" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_91185d86d5d7557b19abbb2868b" UNIQUE ("token_hash"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_password_reset_user" ON "password_reset_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "product_id" uuid, "seller_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "slug" character varying(220), "image_url" character varying(500), "sku" character varying(80), "unit_price" integer NOT NULL, "quantity" integer NOT NULL, "line_total" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_seller" ON "order_items" ("seller_id") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_order_items_order" ON "order_items" ("order_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_history_previous_status_enum" AS ENUM('pending_payment', 'payment_submitted', 'paid', 'processing', 'ready', 'shipped', 'delivered', 'cancelled', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_history_new_status_enum" AS ENUM('pending_payment', 'payment_submitted', 'paid', 'processing', 'ready', 'shipped', 'delivered', 'cancelled', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "previous_status" "public"."order_status_history_previous_status_enum", "new_status" "public"."order_status_history_new_status_enum" NOT NULL, "changed_by" character varying, "comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_status_history_order" ON "order_status_history" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending_payment', 'payment_submitted', 'paid', 'processing', 'ready', 'shipped', 'delivered', 'cancelled', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_shipping_method_enum" AS ENUM('standard', 'express', 'pickup')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_number" character varying(40) NOT NULL, "user_id" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending_payment', "subtotal" integer NOT NULL, "discount" integer NOT NULL DEFAULT '0', "promo_code" character varying(40), "shipping_method" "public"."orders_shipping_method_enum" NOT NULL DEFAULT 'standard', "shipping_cost" integer NOT NULL DEFAULT '0', "total" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'MGA', "shipping_address" jsonb NOT NULL, "customer_name" character varying(160) NOT NULL, "customer_email" character varying(190) NOT NULL, "customer_phone" character varying(40), "notes" text, "placed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancel_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_orders_number" ON "orders" ("order_number") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "orders" ("status") `);
    await queryRunner.query(`CREATE INDEX "idx_orders_user" ON "orders" ("user_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."payments_provider_enum" AS ENUM('mvola', 'orange_money', 'airtel_money')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'submitted', 'verified', 'rejected', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "provider" "public"."payments_provider_enum" NOT NULL, "transaction_reference" character varying(120) NOT NULL, "amount" integer NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'MGA', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "payer_phone" character varying(40), "proof_object_key" character varying(500), "submitted_at" TIMESTAMP WITH TIME ZONE, "verified_at" TIMESTAMP WITH TIME ZONE, "verified_by" uuid, "rejection_reason" text, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_payments_reference_active" ON "payments" ("provider", "transaction_reference") WHERE "status" IN ('pending','submitted','verified')`,
    );
    await queryRunner.query(`CREATE INDEX "idx_payments_status" ON "payments" ("status") `);
    await queryRunner.query(`CREATE INDEX "idx_payments_order" ON "payments" ("order_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('ORDER_CREATED', 'ORDER_PAID', 'ORDER_STATUS_CHANGED', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'SELLER_APPLICATION_RECEIVED', 'SELLER_APPROVED', 'SELLER_REJECTED', 'SELLER_SUSPENDED', 'LOW_STOCK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_channel_enum" AS ENUM('in_app', 'email', 'both')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "title" character varying(200) NOT NULL, "body" text NOT NULL, "channel" "public"."notifications_channel_enum" NOT NULL DEFAULT 'both', "data" jsonb NOT NULL DEFAULT '{}'::jsonb, "email_sent_at" TIMESTAMP WITH TIME ZONE, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_read" ON "notifications" ("user_id", "read_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user" ON "notifications" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scope" character varying(60) NOT NULL, "key" character varying(200) NOT NULL, "user_id" uuid, "request_hash" character varying(128) NOT NULL, "response" jsonb, "status_code" integer, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8ad20779ad0411107a56e53d0f6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_idempotency_unique" ON "idempotency_keys" ("scope", "key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cart_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_cart_items_cart_product" ON "cart_items" ("cart_id", "product_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "carts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_2ec1c94a977b940d85a4f498ae" UNIQUE ("user_id"), CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_carts_user" ON "carts" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(128) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_id" uuid, "user_agent" character varying(400), "ip_address" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT', 'USER_REGISTERED', 'USER_ROLE_CHANGED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'PROFILE_UPDATED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'SELLER_REGISTERED', 'SELLER_APPROVED', 'SELLER_REJECTED', 'SELLER_SUSPENDED', 'SELLER_UPDATED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRODUCT_PUBLISHED', 'PRODUCT_ARCHIVED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'ORDER_CREATED', 'ORDER_STATUS_UPDATED', 'ORDER_CANCELLED', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'PAYMENT_REFUNDED', 'FILE_UPLOADED', 'FILE_DELETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_entity_enum" AS ENUM('user', 'seller', 'product', 'category', 'order', 'payment', 'cart', 'file', 'auth')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "action" "public"."audit_logs_action_enum" NOT NULL, "entity" "public"."audit_logs_entity_enum" NOT NULL, "entity_id" character varying, "ip_address" character varying(64), "user_agent" character varying(400), "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_created" ON "audit_logs" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" ("entity", "entity_id") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_action" ON "audit_logs" ("action") `);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_user" ON "audit_logs" ("user_id") `);
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sellers" ADD CONSTRAINT "FK_83f4670f0e114d0be3731bade87" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_425ee27c69d6b8adc5d6475dcfe" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_754a9ecec7627d432c2134dd00e" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "FK_177397e044732e7e9c0215cd5b7" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_fd9d07d1f1457c1147418d6cbc4" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_fc2beb4403c1d6267b003e0889c" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_30e89257a105eab7648a35c7fce" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea"`);
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_30e89257a105eab7648a35c7fce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_6385a745d9e12a89b859bb25623"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_fc2beb4403c1d6267b003e0889c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_fd9d07d1f1457c1147418d6cbc4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_177397e044732e7e9c0215cd5b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "FK_754a9ecec7627d432c2134dd00e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_425ee27c69d6b8adc5d6475dcfe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sellers" DROP CONSTRAINT "FK_83f4670f0e114d0be3731bade87"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_entity"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_created"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_entity_enum"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."idx_carts_user"`);
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_cart_items_cart_product"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_idempotency_unique"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_read"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_order"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_reference_active"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_provider_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_orders_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_orders_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_orders_number"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_shipping_method_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_order_status_history_order"`);
    await queryRunner.query(`DROP TABLE "order_status_history"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_history_new_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_history_previous_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_order_items_order"`);
    await queryRunner.query(`DROP INDEX "public"."idx_order_items_seller"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_password_reset_user"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."idx_wishlists_user"`);
    await queryRunner.query(`DROP TABLE "wishlists"`);
    await queryRunner.query(`DROP INDEX "public"."idx_wishlist_items_unique"`);
    await queryRunner.query(`DROP TABLE "wishlist_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_products_seller"`);
    await queryRunner.query(`DROP INDEX "public"."idx_products_category"`);
    await queryRunner.query(`DROP INDEX "public"."idx_products_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_products_slug"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_product_images_product"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sellers_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sellers_slug"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sellers_status"`);
    await queryRunner.query(`DROP TABLE "sellers"`);
    await queryRunner.query(`DROP TYPE "public"."sellers_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_categories_slug"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_email_active"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_addresses_user"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
  }
}
