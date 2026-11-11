import { MigrationInterface, QueryRunner } from 'typeorm';

/** Aligne les enums, la relation commande et l'URL d'avatar sur les entités existantes. */
export class ReconcileEntitySchema1790000000004 implements MigrationInterface {
  name = 'ReconcileEntitySchema1790000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Une base existante peut avoir été modifiée hors migrations : ne jamais effacer
    // ni réattribuer automatiquement les conversations dont la commande manque.
    const [orphans] = (await queryRunner.query(`
      SELECT count(*)::text AS "total"
      FROM "conversations" c
      LEFT JOIN "orders" o ON o."id" = c."order_id"
      WHERE c."order_id" IS NOT NULL AND o."id" IS NULL
    `)) as Array<{ total: string }>;
    if (orphans.total !== '0') {
      throw new Error(
        `Migration interrompue : ${orphans.total} conversation(s) référencent une commande absente. ` +
          'Vérifiez et corrigez ces références de façon contrôlée avant de relancer la migration.',
      );
    }

    // Si une clé étrangère compatible a déjà été créée manuellement, la conserver.
    // Toute clé différente ou non validée exige une revue plutôt qu'un doublon.
    const existing = (await queryRunner.query(`
      SELECT c.conname AS "name",
             (c.confrelid = 'orders'::regclass
              AND c.conkey = ARRAY[a.attnum]::smallint[]
              AND c.confkey = ARRAY[
                (SELECT target.attnum FROM pg_attribute target
                 WHERE target.attrelid = 'orders'::regclass
                   AND target.attname = 'id' AND NOT target.attisdropped)
              ]::smallint[]
              AND c.confdeltype = 'n' AND c.confupdtype = 'a'
              AND c.confmatchtype = 's' AND NOT c.condeferrable AND c.convalidated) AS "compatible"
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid
        AND a.attname = 'order_id' AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
      WHERE c.conrelid = 'conversations'::regclass AND c.contype = 'f'
    `)) as Array<{ name: string; compatible: boolean }>;
    if (existing.length > 1 || existing.some((constraint) => !constraint.compatible)) {
      throw new Error(
        'Migration interrompue : une clé étrangère existante sur conversations.order_id ' +
          'est incompatible ou dupliquée. Examinez-la avant de poursuivre.',
      );
    }

    // Toutes les valeurs viennent de NotificationType et AuditAction ; aucune donnée
    // existante n'est réécrite. PostgreSQL 12+ autorise ADD VALUE dans une transaction.
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'CONTACT_MESSAGE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'CONVERSATION_MESSAGE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'CONTACT_CREATED' BEFORE 'FILE_UPLOADED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'CONTACT_REPLIED' BEFORE 'FILE_UPLOADED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'CONVERSATION_CREATED' BEFORE 'FILE_UPLOADED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'MESSAGE_SENT' BEFORE 'FILE_UPLOADED'`,
    );

    // L'entité User déclare varchar sans longueur ; supprimer uniquement la limite.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "avatar_url" TYPE varchar`);

    if (existing.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "conversations"
        ADD CONSTRAINT "FK_f8f897401fd91b6b2e8534c2265"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
      `);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'Migration non réversible automatiquement : retirer des valeurs d’enum ou réduire une colonne peut perdre des données.',
    );
  }
}
