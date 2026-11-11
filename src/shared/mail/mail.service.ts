import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { validateEmail } from '../../common/validators/email-disposable.validator';

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

  get senderValid(): boolean {
    const from = this.config.get<string>('mail.from') ?? '';
    if (/[\r\n]/.test(from)) return false;
    const display = from.match(/^[^<>]*<([^<>]+)>$/);
    return validateEmail(display ? display[1] : from).valid;
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host') ?? 'localhost',
      port: this.config.get<number>('mail.port') ?? 1025,
      secure: this.config.get<boolean>('mail.secure') ?? false,
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
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
    const recipient = validateEmail(message.to);
    if (!recipient.valid) {
      this.logger.warn('Envoi e-mail refusé par la politique de validation.');
      return false;
    }
    const from = this.config.get<string>('mail.from') ?? '';
    if (!this.senderValid) {
      this.logger.warn('Expéditeur e-mail refusé par la politique de validation.');
      return false;
    }

    if (!this.enabled) {
      this.logger.log('Envoi e-mail désactivé.');
      return false;
    }

    try {
      await this.getTransporter().sendMail({
        from,
        to: recipient.normalized,
        subject: message.subject,
        html: message.html,
        text: message.text ?? stripHtml(message.html),
      });
      this.logger.log('E-mail envoyé.');
      return true;
    } catch {
      // Un échec d'e-mail ne doit jamais faire échouer la requête métier.
      this.logger.error('Échec envoi e-mail SMTP.');
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
