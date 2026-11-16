import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute une galerie d'images à la collection (JSONB, même logique que
 * collections.product_ids). Aucune donnée existante n'est réécrite : la
 * colonne défaut à un tableau vide.
 */
export class CollectionGallery1790000000007 implements MigrationInterface {
  name = 'CollectionGallery1790000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "gallery" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "gallery"`);
  }
}
