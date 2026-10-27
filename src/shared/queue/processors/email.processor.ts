import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MailService } from '../../mail/mail.service';
import { QUEUE_NAMES, type EmailJobData } from '../queue.constants';

/** Worker : envoie les e-mails en tâche de fond (jamais dans la requête HTTP). */
@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    await this.mailService.send({
      to: job.data.to,
      subject: job.data.subject,
      html: job.data.html,
      ...(job.data.text ? { text: job.data.text } : {}),
    });
    this.logger.debug(`E-mail traité (job ${job.id}) → ${job.data.to}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }
}
