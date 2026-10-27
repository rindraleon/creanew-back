import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

export interface MediaJobData {
  bucket: string;
  objectKey: string;
  action: 'delete' | 'thumbnail';
}

@Processor(QUEUE_NAMES.MEDIA)
export class MediaProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(MediaProcessor.name);

  async process(job: Job<MediaJobData>): Promise<void> {
    const { action, objectKey, bucket } = job.data ?? ({} as MediaJobData);
    switch (action) {
      case 'delete':
        this.logger.debug(`Suppression différée demandée : ${bucket}/${objectKey}`);
        break;
      case 'thumbnail':
        this.logger.debug(`Génération de miniature : ${bucket}/${objectKey}`);
        break;
      default:
        this.logger.debug(`Action média non gérée : ${String(action)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
