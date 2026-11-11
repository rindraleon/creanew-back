import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'node:path';

// Même ordre que l'API : l'environnement et .env priment ; .env.local complète
// les valeurs manquantes en développement. Ne pas migrer une autre base que l'API.
loadEnv();
if (process.env.NODE_ENV !== 'production') {
  loadEnv({ path: '.env.local' });
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL?.trim()
    ? { url: process.env.DATABASE_URL.trim() }
    : {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        username: process.env.DATABASE_USER ?? 'postgres',
        password: process.env.DATABASE_PASSWORD ?? 'postgres',
        database: process.env.DATABASE_NAME ?? 'creanew',
      }),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
});
