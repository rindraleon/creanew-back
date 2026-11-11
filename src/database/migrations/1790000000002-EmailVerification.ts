import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migration additive : aucune donnée, aucun seed et aucune suppression de compte. */
export class EmailVerification1790000000002 implements MigrationInterface {
  name = 'EmailVerification1790000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "session_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`CREATE TABLE "email_verification_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "email" varchar(190) NOT NULL,
      "token_hash" varchar(64) NOT NULL UNIQUE,
      "expires_at" timestamptz NOT NULL,
      "used_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_email_verification_user" ON "email_verification_tokens" ("user_id")`,
    );
    // Un même compte de fournisseur ne peut être attaché qu'à un seul utilisateur actif.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_oauth_identity_unique" ON "users" ("provider", "provider_id") WHERE "deleted_at" IS NULL AND "provider" IS NOT NULL AND "provider_id" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_users_oauth_identity_unique"`);
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "session_version"`);
  }
}
