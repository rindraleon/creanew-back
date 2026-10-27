import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('mail.enabled') ?? false;
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host') ?? 'localhost',
      port: this.config.get<number>('mail.port') ?? 1025,
      secure: this.config.get<boolean>('mail.secure') ?? false,
      auth: this.config.get<string>('mail.user')
        ? {
            user: this.config.get<string>('mail.user'),
            pass: this.config.get<string>('mail.password'),
          }
        : undefined,
    });
    return this.transporter;
  }

  async send(message: MailMessage): Promise<boolean> {
    const from = this.config.get<string>('mail.from') ?? 'no-reply@mobilier-shop.local';

    if (!this.enabled) {
      this.logger.log(`[mail:disabled] → ${message.to} | ${message.subject}`);
      return false;
    }

    try {
      await this.getTransporter().sendMail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text ?? stripHtml(message.html),
      });
      this.logger.log(`E-mail envoyé → ${message.to} | ${message.subject}`);
      return true;
    } catch (error) {
      // Un échec d'e-mail ne doit jamais faire échouer la requête métier.
      this.logger.error(`Échec envoi e-mail → ${message.to} : ${(error as Error).message}`);
      return false;
    }
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
