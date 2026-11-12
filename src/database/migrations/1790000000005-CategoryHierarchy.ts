import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoryHierarchy1790000000005 implements MigrationInterface {
  name = 'CategoryHierarchy1790000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "parent_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_categories_parent" ON "categories" ("parent_id")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_categories_parent'
        ) THEN
          ALTER TABLE "categories"
            ADD CONSTRAINT "fk_categories_parent"
            FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "fk_categories_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_parent"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "parent_id"`);
  }
}
