import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();
  private disabledPermanently = false;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !this.disabledPermanently && (this.config.get<boolean>('queue.enabled') ?? false);
  }

  private connection() {
    return {
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db') ?? 0,
    };
  }

  private getQueue(name: QueueName): Queue | null {
    if (!this.enabled) return null;
    const existing = this.queues.get(name);
    if (existing) return existing;
    try {
      const queue = new Queue(name, {
        connection: this.connection(),
        prefix: this.config.get<string>('queue.prefix') ?? 'mobilier',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      });
      queue.on('error', (error: Error) => {
        this.logger.warn(`File "${name}" : ${error.message}`);
      });
      this.queues.set(name, queue);
      return queue;
    } catch (error) {
      this.logger.warn(`File "${name}" indisponible : ${(error as Error).message}`);
      return null;
    }
  }

  /** Ajoute un job. Ne lève jamais : timeout 2 s puis abandon silencieux. */
  async add<T>(name: QueueName, jobName: string, data: T): Promise<boolean> {
    const queue = this.getQueue(name);
    if (!queue) return false;

    try {
      await Promise.race([
        queue.add(jobName, data),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2000).unref?.(),
        ),
      ]);
      return true;
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'timeout' || /ECONNREFUSED|ENOTFOUND/i.test(message)) {
        this.disabledPermanently = true;
        this.logger.warn('Redis/BullMQ injoignable : les jobs asynchrones sont ignorés.');
      } else {
        this.logger.warn(`Job "${jobName}" non ajouté : ${message}`);
      }
      return false;
    }
  }

  async addEmail(data: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    return this.add(QUEUE_NAMES.EMAIL, 'send-mail', data);
  }

  async closeAll(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close().catch(() => undefined);
    }
    this.queues.clear();
  }
}
