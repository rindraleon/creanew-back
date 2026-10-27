import { StorageBucket } from '../common/enums';

const toBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const toNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toNumber(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  appName: process.env.APP_NAME ?? 'MOBILIER-SHOP',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  swagger: {
    enabled: toBoolean(process.env.SWAGGER_ENABLED, true),
    user: process.env.SWAGGER_USER ?? '',
    password: process.env.SWAGGER_PASSWORD ?? '',
  },

  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: toNumber(process.env.DATABASE_PORT, 5432),
    name: process.env.DATABASE_NAME ?? 'mobilier_shop',
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    ssl: toBoolean(process.env.DATABASE_SSL, false),
    logging: toBoolean(process.env.DATABASE_LOGGING, false),
    synchronize: toBoolean(process.env.DATABASE_SYNCHRONIZE, false),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me-please-32',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me-please-32',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    refreshCookieName: process.env.JWT_REFRESH_COOKIE_NAME ?? 'mobilier_rt',
  },

  security: {
    throttlerTtl: toNumber(process.env.THROTTLE_TTL, 60),
    throttlerLimit: toNumber(process.env.THROTTLE_LIMIT, 30),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    argon2: {
      memoryCost: toNumber(process.env.ARGON2_MEMORY_COST, 65536),
      timeCost: toNumber(process.env.ARGON2_TIME_COST, 3),
      parallelism: toNumber(process.env.ARGON2_PARALLELISM, 4),
    },
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD ?? '',
    db: toNumber(process.env.REDIS_DB, 0),
  },

  queue: {
    enabled: toBoolean(process.env.QUEUE_ENABLED, false),
    prefix: process.env.QUEUE_PREFIX ?? 'mobilier',
  },

  storage: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: toNumber(process.env.MINIO_PORT, 9000),
    useSSL: toBoolean(process.env.MINIO_USE_SSL, false),
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    region: process.env.MINIO_REGION ?? 'mg-central-1',
    publicUrl: process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000',
    buckets: {
      [StorageBucket.PRODUCTS]: process.env.MINIO_BUCKET_PRODUCTS ?? 'products',
      [StorageBucket.AVATARS]: process.env.MINIO_BUCKET_AVATARS ?? 'avatars',
      [StorageBucket.SELLER_DOCUMENTS]:
        process.env.MINIO_BUCKET_SELLER_DOCUMENTS ?? 'seller-documents',
      [StorageBucket.PAYMENT_PROOFS]: process.env.MINIO_BUCKET_PAYMENT_PROOFS ?? 'payment-proofs',
    } satisfies Record<StorageBucket, string>,
    maxFileSize: toNumber(process.env.UPLOAD_MAX_FILE_SIZE, 5 * 1024 * 1024),
    maxFiles: toNumber(process.env.UPLOAD_MAX_FILES, 10),
  },

  mail: {
    enabled: toBoolean(process.env.MAIL_ENABLED, false),
    host: process.env.SMTP_HOST ?? 'localhost',
    port: toNumber(process.env.SMTP_PORT, 1025),
    secure: toBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'MOBILIER-SHOP <no-reply@mobilier-shop.local>',
  },

  commerce: {
    currency: process.env.DEFAULT_CURRENCY ?? 'MGA',
    defaultLowStockThreshold: toNumber(process.env.DEFAULT_LOW_STOCK_THRESHOLD, 5),
    shippingStandardCost: toNumber(process.env.SHIPPING_STANDARD_COST, 10000),
    shippingExpressCost: toNumber(process.env.SHIPPING_EXPRESS_COST, 25000),
    freeShippingThreshold: toNumber(process.env.FREE_SHIPPING_THRESHOLD, 1500000),
  },
});
export default configuration;
