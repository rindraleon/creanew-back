import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreaNewFeatures1790000000000 implements MigrationInterface {
  name = 'CreaNewFeatures1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collections
    await queryRunner.query(`
      CREATE TABLE "collections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(160) NOT NULL,
        "slug" varchar(180) NOT NULL,
        "tagline" varchar(220),
        "description" text,
        "cover_image_url" varchar(500),
        "cover_object_key" varchar(500),
        "product_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "position" integer NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_collections" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_collections_slug" ON "collections" ("slug")`);
    await queryRunner.query(
      `CREATE INDEX "idx_collections_position" ON "collections" ("position")`,
    );

    // Contact messages
    await queryRunner.query(`
      CREATE TYPE "public"."contact_messages_status_enum" AS ENUM('new', 'read', 'replied', 'archived')`);
    await queryRunner.query(`
      CREATE TABLE "contact_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(160) NOT NULL,
        "email" varchar(190) NOT NULL,
        "subject" varchar(160),
        "message" text NOT NULL,
        "status" "public"."contact_messages_status_enum" NOT NULL DEFAULT 'new',
        "admin_reply" text,
        "replied_at" TIMESTAMPTZ,
        "ip" varchar(45),
        "user_agent" varchar(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_messages" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_contact_status" ON "contact_messages" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_contact_email" ON "contact_messages" ("email")`);

    // Conversations
    await queryRunner.query(`
      CREATE TYPE "public"."conversations_status_enum" AS ENUM('open', 'closed')`);
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subject" varchar(220) NOT NULL,
        "order_id" uuid,
        "created_by" uuid NOT NULL,
        "seller_id" uuid,
        "status" "public"."conversations_status_enum" NOT NULL DEFAULT 'open',
        "last_message_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_conversations_status" ON "conversations" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "body" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conversation" ON "messages" ("conversation_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_messages_sender" ON "messages" ("sender_id")`);
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_conversations_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE "conversation_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "last_read_at" TIMESTAMPTZ,
        CONSTRAINT "PK_conversation_participants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cp" UNIQUE ("conversation_id", "user_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_cp_conversation" ON "conversation_participants" ("conversation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cp_user" ON "conversation_participants" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_participants" ADD CONSTRAINT "FK_cp_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_participants" ADD CONSTRAINT "FK_cp_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    // Site settings
    await queryRunner.query(`
      CREATE TABLE "site_settings" (
        "key" varchar(120) NOT NULL,
        "value" jsonb NOT NULL,
        "description" varchar(200),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_site_settings" PRIMARY KEY ("key")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."conversations_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_messages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."contact_messages_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "collections"`);
  }
}
