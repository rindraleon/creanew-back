import { MigrationInterface, QueryRunner } from 'typeorm';

/** État durable : une instance ne doit jamais recréer un admin supprimé ou rétrogradé. */
export class InitialAdminState1790000000003 implements MigrationInterface {
  name = 'InitialAdminState1790000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "initial_admin_state" (
        "singleton" boolean NOT NULL DEFAULT true PRIMARY KEY CHECK ("singleton"),
        "initialized_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Préserver les installations existantes, y compris les suppressions logiques et
    // les initialisations historiques visibles dans l'audit. Aucune donnée utilisateur
    // n'est créée ou modifiée par cette migration.
    await queryRunner.query(`
      INSERT INTO "initial_admin_state" ("singleton")
      SELECT true
      WHERE EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin')
         OR EXISTS (
           SELECT 1 FROM "audit_logs"
           WHERE ("action" = 'USER_REGISTERED' AND (
                   "metadata"->>'bootstrap' = 'true' OR "metadata"->>'initialAdmin' = 'environment'
                 ))
              OR ("action" = 'USER_ROLE_CHANGED' AND "metadata"->>'role' = 'admin')
         )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Migration non réversible automatiquement : conserver le marqueur de première initialisation.',
    );
  }
}
