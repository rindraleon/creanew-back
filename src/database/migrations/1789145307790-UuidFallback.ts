import { MigrationInterface, QueryRunner } from 'typeorm';

export class UuidFallback1789145307790 implements MigrationInterface {
  name = 'UuidFallback1789145307790';

  // uuid-ossp est absent de certains Postgres managés : on retombe sur gen_random_uuid().
  // Les deux produisent des UUID v4, donc le schéma reste identique.
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      "SELECT COUNT(*)::int AS count FROM pg_available_extensions WHERE name = 'uuid-ossp'",
    )) as Array<{ count: number }>;

    if ((rows[0]?.count ?? 0) > 0) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      return;
    }

    await queryRunner.query(
      "CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS 'SELECT gen_random_uuid()' LANGUAGE sql VOLATILE",
    );
  }

  public async down(): Promise<void> {
    /* Sans effet volontaire : retirer l'alias casserait les insertions. */
  }
}
