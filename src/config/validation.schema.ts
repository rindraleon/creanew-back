import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  API_PREFIX: Joi.string().allow('').default('api'),
  APP_NAME: Joi.string().default('MOBILIER-SHOP'),
  FRONTEND_URL: Joi.string().uri({ allowRelative: false }).default('http://localhost:5173'),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_USER: Joi.string().allow('').default(''),
  SWAGGER_PASSWORD: Joi.string().allow('').default(''),

  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().integer().default(5432),
  DATABASE_NAME: Joi.string().default('mobilier_shop'),
  DATABASE_USER: Joi.string().default('postgres'),
  DATABASE_PASSWORD: Joi.string().allow('').default('postgres'),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(false),
  // synchronize doit rester faux : le schéma est géré par les migrations.
  DATABASE_SYNCHRONIZE: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().default('dev-access-secret-change-me-please-32'),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().default('dev-refresh-secret-change-me-please-32'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  JWT_REFRESH_COOKIE_NAME: Joi.string().default('mobilier_rt'),

  THROTTLE_TTL: Joi.number().integer().default(60),
  THROTTLE_LIMIT: Joi.number().integer().default(30),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  ARGON2_MEMORY_COST: Joi.number().integer().default(65536),
  ARGON2_TIME_COST: Joi.number().integer().default(3),
  ARGON2_PARALLELISM: Joi.number().integer().default(4),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().default(0),

  QUEUE_ENABLED: Joi.boolean().default(false),
  QUEUE_PREFIX: Joi.string().default('mobilier'),

  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().integer().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().allow('').default(''),
  MINIO_SECRET_KEY: Joi.string().allow('').default(''),
  MINIO_REGION: Joi.string().default('mg-central-1'),
  MINIO_PUBLIC_URL: Joi.string().default('http://localhost:9000'),
  MINIO_BUCKET_PRODUCTS: Joi.string().default('products'),
  MINIO_BUCKET_AVATARS: Joi.string().default('avatars'),
  MINIO_BUCKET_SELLER_DOCUMENTS: Joi.string().default('seller-documents'),
  MINIO_BUCKET_PAYMENT_PROOFS: Joi.string().default('payment-proofs'),
  UPLOAD_MAX_FILE_SIZE: Joi.number()
    .integer()
    .default(5 * 1024 * 1024),
  UPLOAD_MAX_FILES: Joi.number().integer().default(10),

  MAIL_ENABLED: Joi.boolean().default(false),
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().integer().default(1025),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('MOBILIER-SHOP <no-reply@mobilier-shop.local>'),

  DEFAULT_CURRENCY: Joi.string().default('MGA'),
  DEFAULT_LOW_STOCK_THRESHOLD: Joi.number().integer().min(0).default(5),
  SHIPPING_STANDARD_COST: Joi.number().integer().min(0).default(10000),
  SHIPPING_EXPRESS_COST: Joi.number().integer().min(0).default(25000),
  FREE_SHIPPING_THRESHOLD: Joi.number().integer().min(0).default(1500000),
}).unknown(true);

export function assertProductionSecrets(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  const requireStrong = (key: string, minLength = 32): void => {
    const value = env[key] ?? '';
    if (value.length < minLength) {
      problems.push(`${key} doit contenir au moins ${minLength} caractères.`);
    }
    if (value.includes('change-me') || value.startsWith('dev-')) {
      problems.push(`${key} utilise une valeur de développement en production.`);
    }
  };

  requireStrong('JWT_ACCESS_SECRET');
  requireStrong('JWT_REFRESH_SECRET');

  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être différents.');
  }
  if (!env.DATABASE_PASSWORD) problems.push('DATABASE_PASSWORD est obligatoire.');

  if (problems.length > 0) {
    throw new Error(`Configuration de production invalide :\n - ${problems.join('\n - ')}`);
  }
}
