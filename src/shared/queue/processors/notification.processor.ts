import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Notification } from '../../../notifications/entities/notification.entity';
import { QUEUE_NAMES, type OrderNotificationJobData } from '../queue.constants';

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {
    super();
  }

  async process(job: Job<OrderNotificationJobData | Record<string, never>>): Promise<void> {
    switch (job.name) {
      case 'notify-order-created':
        this.logger.debug(
          `Commande ${(job.data as OrderNotificationJobData).orderId} : notifications vendeur déclenchées.`,
        );
        break;
      case 'cleanup-read-notifications':
        await this.cleanupReadNotifications();
        break;
      default:
        this.logger.debug(`Job de notification non géré : ${job.name}`);
    }
  }

  /** Purge les notifications lues de plus de 90 jours. */
  private async cleanupReadNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const result = await this.notifications
      .createQueryBuilder()
      .delete()
      .where('"read_at" IS NOT NULL')
      .andWhere('"created_at" < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}

// Ré-export utile aux consommateurs du worker.
export { LessThan };
