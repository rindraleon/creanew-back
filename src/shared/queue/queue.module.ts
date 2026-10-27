import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue.constants';
import { EmailProcessor } from './processors/email.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { MediaProcessor } from './processors/media.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { Notification } from '../../notifications/entities/notification.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([Notification]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db') ?? 0,
        },
        prefix: config.get<string>('queue.prefix') ?? 'mobilier',
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.MEDIA },
      { name: QUEUE_NAMES.ANALYTICS },
    ),
  ],
  providers: [EmailProcessor, NotificationProcessor, MediaProcessor, AnalyticsProcessor],
})
export class QueueWorkerModule {}

/** Module producteur : toujours disponible, même sans Redis. */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
