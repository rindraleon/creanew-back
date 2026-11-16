import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les actions/entité d'audit dédiées aux collections.
 * Auparavant les opérations collection étaient journalisées via
 * CATEGORY_* + metadata { entity: 'collection' }, ce qui rendait
 * les traces trompeuses. Aucune donnée existante n'est réécrite.
 */
export class AddCollectionAudit1790000000006 implements MigrationInterface {
  name = 'AddCollectionAudit1790000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'COLLECTION_CREATED' BEFORE 'ORDER_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'COLLECTION_UPDATED' BEFORE 'ORDER_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'COLLECTION_DELETED' BEFORE 'ORDER_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'COLLECTION_PUBLISHED' BEFORE 'ORDER_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_entity_enum" ADD VALUE IF NOT EXISTS 'collection'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL ne permet pas de retirer une valeur d'un enum sans réécriture ;
    // les valeurs restent, sans impact sur l'existant.
  }
}
