import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ContactMessage, ContactStatus } from './entities/contact-message.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { MailService } from '../shared/mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../common/enums';
import { contactAckTemplate, contactAdminTemplate } from '../shared/mail/templates';
import { assertValidEmail } from '../common/validators/email-disposable.validator';
import type { CreateContactDto, ContactQueryDto } from './dto/contact.dto';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  constructor(
    @InjectRepository(ContactMessage) private readonly contacts: Repository<ContactMessage>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  private sanitize(value: string): string {
    return value
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 5000);
  }

  async create(dto: CreateContactDto, request?: Request): Promise<ContactMessage> {
    // Honeypot
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.warn(`Contact spam honeypot from ${request?.ip}`);
      throw BusinessException.badRequest('Requête invalide.', ErrorCode.VALIDATION_ERROR);
    }

    const name = this.sanitize(dto.name);
    const email = assertValidEmail(dto.email);
    const subject = dto.subject ? this.sanitize(dto.subject) : 'Contact CreaNew';
    const message = this.sanitize(dto.message);

    if (message.length < 10)
      throw BusinessException.badRequest('Message trop court.', ErrorCode.VALIDATION_ERROR);

    // Anti flood: même email 3x en 5min → 429
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentCount = await this.dataSource.query<Array<{ c: number }>>(
      `SELECT COUNT(*)::int as c FROM contact_messages WHERE email = $1 AND created_at > $2`,
      [email, fiveMinAgo],
    );
    if ((recentCount?.[0]?.c ?? 0) >= 3) {
      throw BusinessException.tooManyRequests(
        'Trop de messages. Réessayez dans quelques minutes.',
        ErrorCode.TOO_MANY_REQUESTS,
      );
    }

    const entity = this.contacts.create({
      name,
      email,
      subject,
      message,
      status: ContactStatus.NEW,
      ip: request?.ip?.slice(0, 45) ?? null,
      userAgent: request?.headers?.['user-agent']?.slice(0, 500) ?? null,
    });
    const saved = await this.contacts.save(entity);

    // Notification admin + in_app for all admins
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const admins: Array<{ id: string; email: string }> = await this.dataSource.query(
      `SELECT id, email FROM users WHERE role='admin' AND deleted_at IS NULL`,
    );
    for (const admin of admins) {
      await this.notifications
        .create({
          userId: admin.id,
          type: NotificationType.CONTACT_MESSAGE,
          title: 'Nouveau message contact',
          body: `${name} — ${subject}`,
          data: { contactId: saved.id, subject },
        })
        .catch(() => {});
    }

    // E-mail admin (premier admin)
    const adminEmail = admins[0]?.email ?? this.config.get<string>('mail.from') ?? '';
    if (adminEmail) {
      const adminTpl = contactAdminTemplate(adminEmail, name, email, subject, message, frontendUrl);
      await this.mail
        .send({ to: adminEmail, subject: adminTpl.subject, html: adminTpl.html })
        .catch(() => {});
    }

    // Accusé réception client
    const ack = contactAckTemplate(email, name, subject);
    await this.mail.send({ to: email, subject: ack.subject, html: ack.html }).catch(() => {});

    return saved;
  }

  async list(query: ContactQueryDto): Promise<Paginated<ContactMessage>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.contacts.createQueryBuilder('c');
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    qb.orderBy('c.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildMeta(total, page, limit) };
  }

  async findById(id: string): Promise<ContactMessage> {
    const msg = await this.contacts.findOne({ where: { id } });
    if (!msg) throw BusinessException.notFound('Message introuvable.', ErrorCode.NOT_FOUND);
    return msg;
  }

  async markRead(id: string): Promise<ContactMessage> {
    const msg = await this.findById(id);
    if (msg.status === ContactStatus.NEW) {
      msg.status = ContactStatus.READ;
      await this.contacts.save(msg);
    }
    return msg;
  }

  async reply(id: string, replyText: string): Promise<ContactMessage> {
    const msg = await this.findById(id);
    assertValidEmail(msg.email);
    const sanitized = this.sanitize(replyText);
    msg.adminReply = sanitized;
    msg.status = ContactStatus.REPLIED;
    msg.repliedAt = new Date();
    const saved = await this.contacts.save(msg);

    // Envoyer réponse par e-mail au visiteur
    const replyTpl = {
      to: saved.email,
      subject: `Re: ${saved.subject ?? 'Votre message à CreaNew'}`,
      html: `<p>Bonjour ${saved.name},</p><p>${sanitized.replace(/\n/g, '<br>')}</p><p>— L'équipe CreaNew</p>`,
    };
    await this.mail.send(replyTpl).catch(() => {});

    return saved;
  }

  async archive(id: string): Promise<ContactMessage> {
    const msg = await this.findById(id);
    msg.status = ContactStatus.ARCHIVED;
    return this.contacts.save(msg);
  }
}
