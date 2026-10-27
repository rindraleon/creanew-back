import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'node:path';

loadEnv();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'mobilier_shop',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
});
