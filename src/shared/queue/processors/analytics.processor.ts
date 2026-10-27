import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

export interface AnalyticsJobData {
  scope: 'global' | 'seller';
  sellerId?: string;
  period?: string;
}

/** Worker analytique : pré-calcul différé des statistiques (cache Redis). */
@Processor(QUEUE_NAMES.ANALYTICS)
export class AnalyticsProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  async process(job: Job<AnalyticsJobData>): Promise<void> {
    this.logger.debug(`Pré-calcul analytique demandé : ${JSON.stringify(job.data ?? {})}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
