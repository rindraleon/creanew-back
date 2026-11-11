import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameAndOAuth1790000000001 implements MigrationInterface {
  name = 'AddUsernameAndOAuth1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "first_name" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "username" varchar(30)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "provider" varchar(30)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "provider_id" varchar(190)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "avatar_url" varchar(500)`);

    // Les comptes existants peuvent avoir des préfixes longs, accentués ou identiques.
    // Un numéro ordinal unique garantit une valeur ASCII distincte de 30 caractères au maximum.
    await queryRunner.query(`
      WITH candidates AS (
        SELECT id, row_number() OVER (ORDER BY id)::text AS ordinal,
          COALESCE(NULLIF(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), ''), 'user') AS prefix
        FROM users
      )
      UPDATE users u
      SET username = left(c.prefix, greatest(0, 29 - length(c.ordinal))) || '_' || c.ordinal
      FROM candidates c WHERE c.id = u.id
    `);
    // Les anciennes instances peuvent encore créer des comptes pendant le déploiement.
    // Leur INSERT ne mentionne pas username : une valeur de transition unique le fournit.
    // La nouvelle API, elle, impose toujours un username fourni par l'utilisateur.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "username" SET DEFAULT ('user_' || substr(replace(uuid_generate_v4()::text, '-', ''), 1, 25))`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_username_active" ON "users" ("username") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_provider" ON "users" ("provider", "provider_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_users_provider"`);
    await queryRunner.query(`DROP INDEX "idx_users_username_active"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "provider"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL`);
  }
}
