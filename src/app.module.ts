import { config as loadEnv } from 'dotenv';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { SellerApprovedGuard } from './common/guards/seller-approved.guard';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { assertProductionSecrets, validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { RedisModule } from './shared/redis/redis.module';
import { StorageModule } from './shared/storage/storage.module';
import { MailModule } from './shared/mail/mail.module';
import { QueueModule, QueueWorkerModule } from './shared/queue/queue.module';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SellersModule } from './sellers/sellers.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { CollectionsModule } from './collections/collections.module';
import { ContactModule } from './contact/contact.module';
import { MessagingModule } from './messaging/messaging.module';
import { SiteContentModule } from './site-content/site-content.module';

// Charge .env avant l'évaluation conditionnelle des modules ci-dessous.
loadEnv();
// Secrets de production : refus de démarrer avec des valeurs par défaut.
assertProductionSecrets(process.env);

/** Workers BullMQ : activés uniquement si QUEUE_ENABLED=true (Redis requis). */
const queueWorkers =
  String(process.env.QUEUE_ENABLED).toLowerCase() === 'true' ? [QueueWorkerModule] : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),

    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 300),
      },
    ]),

    DatabaseModule,

    RedisModule,
    StorageModule,
    MailModule,
    QueueModule,
    AuditModule,

    AuthModule,
    UsersModule,
    SellersModule,
    CategoriesModule,
    CollectionsModule,
    ContactModule,
    MessagingModule,
    SiteContentModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    FilesModule,
    AnalyticsModule,
    AdminModule,
    HealthModule,
    WishlistModule,

    ...queueWorkers,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SellerApprovedGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
