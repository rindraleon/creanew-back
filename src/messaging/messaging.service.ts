import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType, UserRole } from '../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../shared/mail/mail.service';
import type { CreateConversationDto, SendMessageDto } from './dto/messaging.dto';

interface ConversationRow {
  id: string;
  subject: string;
  order_id: string | null;
  created_by: string;
  seller_id: string | null;
  status: ConversationStatus;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
  unread: number;
  last_body: string | null;
  last_at: Date | null;
}
export interface ConversationSummary {
  id: string;
  subject: string;
  orderId: string | null;
  createdBy: string;
  sellerId: string | null;
  status: ConversationStatus;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  unreadCount: number;
  lastMessage: { body: string; createdAt: Date | null } | null;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(ConversationParticipant)
    private readonly participants: Repository<ConversationParticipant>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private sanitize(v: string): string {
    return v
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 5000);
  }

  private async ensureParticipant(conversationId: string, userId: string): Promise<void> {
    const count = await this.participants.count({ where: { conversationId, userId } });
    if (!count)
      throw BusinessException.forbidden('Accès refusé à cette conversation.', ErrorCode.FORBIDDEN);
  }

  async createConversation(userId: string, dto: CreateConversationDto): Promise<Conversation> {
    const subject = this.sanitize(dto.subject);
    const body = this.sanitize(dto.message);
    if (!subject || !body)
      throw BusinessException.badRequest('Sujet et message requis.', ErrorCode.VALIDATION_ERROR);

    return this.dataSource.transaction(async (manager) => {
      const convoRepo = manager.getRepository(Conversation);
      const msgRepo = manager.getRepository(Message);
      const partRepo = manager.getRepository(ConversationParticipant);

      const convo = convoRepo.create({
        subject,
        orderId: dto.orderId ?? null,
        createdBy: userId,
        sellerId: dto.sellerId ?? null,
        status: ConversationStatus.OPEN,
        lastMessageAt: new Date(),
      });
      const savedConvo = await convoRepo.save(convo);

      const message = msgRepo.create({
        conversationId: savedConvo.id,
        senderId: userId,
        body,
      });
      await msgRepo.save(message);

      // participants: créateur + destinataire (si fourni) sinon premier admin
      const participantsIds = new Set<string>([userId]);
      if (dto.recipientId) participantsIds.add(dto.recipientId);
      else if (dto.sellerId) {
        // seller user id lookup
        const sellerUser = await manager.query<Array<{ user_id: string }>>(
          `SELECT user_id FROM sellers WHERE id=$1`,
          [dto.sellerId],
        );
        if (sellerUser?.[0]?.user_id) participantsIds.add(sellerUser[0].user_id);
      } else {
        // add admins as participants (first 2)
        const admins: Array<{ id: string }> = await manager.query(
          `SELECT id FROM users WHERE role='admin' AND deleted_at IS NULL LIMIT 2`,
        );
        admins.forEach((a) => participantsIds.add(a.id));
      }

      for (const pid of participantsIds) {
        await partRepo.save(partRepo.create({ conversationId: savedConvo.id, userId: pid }));
      }

      // Notification destinataires hors sender
      for (const pid of participantsIds) {
        if (pid === userId) continue;
        await this.notifications
          .create({
            userId: pid,
            type: NotificationType.CONVERSATION_MESSAGE,
            title: 'Nouveau message',
            body: `${subject} — ${body.slice(0, 120)}`,
            data: { conversationId: savedConvo.id },
          })
          .catch(() => {});
      }

      return savedConvo;
    });
  }

  async listForUser(userId: string, role: UserRole): Promise<ConversationSummary[]> {
    // L'utilisateur voit ses conversations où il est participant
    const rows = await this.dataSource.query<ConversationRow[]>(
      `SELECT c.*, 
         (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id != $1 AND m.is_read=false) as unread,
         (SELECT body FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as last_body,
         (SELECT created_at FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as last_at
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=$1
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [userId],
    );
    // admin voit tout si souhaité, mais on garde filtrage participant pour sécurité — admin est ajouté à chaque conversation créée.
    // Pour couvrir legacy, admin peut voir tout:
    if (role === UserRole.ADMIN) {
      const adminAll = await this.dataSource.query<ConversationRow[]>(
        `SELECT c.*, 0 as unread, 
           (SELECT body FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as last_body,
           (SELECT created_at FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as last_at
         FROM conversations c
         ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
         LIMIT 100`,
      );
      // merge dedup
      const seen = new Set(rows.map((r) => r.id));
      for (const r of adminAll) if (!seen.has(r.id)) rows.push(r);
    }
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      orderId: r.order_id,
      createdBy: r.created_by,
      sellerId: r.seller_id,
      status: r.status,
      lastMessageAt: r.last_message_at ?? r.last_at ?? r.created_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      unreadCount: Number(r.unread ?? 0),
      lastMessage: r.last_body ? { body: r.last_body, createdAt: r.last_at } : null,
    }));
  }

  async getMessages(conversationId: string, userId: string, role: UserRole): Promise<Message[]> {
    if (role !== UserRole.ADMIN) await this.ensureParticipant(conversationId, userId);
    // also check convo exists
    const convo = await this.conversations.findOne({ where: { id: conversationId } });
    if (!convo) throw BusinessException.notFound('Conversation introuvable.', ErrorCode.NOT_FOUND);
    return this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    dto: SendMessageDto,
    role: UserRole,
  ): Promise<Message> {
    if (role !== UserRole.ADMIN) await this.ensureParticipant(conversationId, userId);
    const convo = await this.conversations.findOne({ where: { id: conversationId } });
    if (!convo) throw BusinessException.notFound('Conversation introuvable.', ErrorCode.NOT_FOUND);
    if (convo.status === ConversationStatus.CLOSED)
      throw BusinessException.conflict('Conversation fermée.', ErrorCode.VALIDATION_ERROR);

    const body = this.sanitize(dto.body);
    if (!body) throw BusinessException.badRequest('Message vide.', ErrorCode.VALIDATION_ERROR);

    const msg = this.messages.create({ conversationId, senderId: userId, body });
    const saved = await this.messages.save(msg);
    convo.lastMessageAt = new Date();
    await this.conversations.save(convo);

    // Notify other participants
    const others: Array<{ userId: string }> = await this.dataSource.query(
      `SELECT user_id as "userId" FROM conversation_participants WHERE conversation_id=$1 AND user_id != $2`,
      [conversationId, userId],
    );
    let otherIds = others.map((o) => o.userId);
    if (role === UserRole.ADMIN && otherIds.length === 0) {
      // admin sending to conversation where he wasn't participant — ensure at least creator is notified
      if (convo.createdBy !== userId) otherIds = [convo.createdBy];
    }
    for (const oid of otherIds) {
      await this.notifications
        .create({
          userId: oid,
          type: NotificationType.CONVERSATION_MESSAGE,
          title: `Nouvelle réponse: ${convo.subject}`,
          body: body.slice(0, 140),
          data: { conversationId },
        })
        .catch(() => {});
      // email
      const userRow: Array<{ email: string; first_name: string }> = await this.dataSource.query(
        `SELECT email, first_name FROM users WHERE id=$1`,
        [oid],
      );
      if (userRow[0]?.email) {
        await this.mail
          .send({
            to: userRow[0].email,
            subject: `Nouveau message — ${convo.subject}`,
            html: `<p>Vous avez reçu un nouveau message dans la conversation <strong>${convo.subject}</strong>.</p><p>${body.replace(/\n/g, '<br>')}</p><p><a href="${this.config.get<string>('frontendUrl')}/messages/${conversationId}">Voir la conversation</a></p>`,
          })
          .catch(() => {});
      }
    }

    return saved;
  }

  async markRead(conversationId: string, userId: string, messageId?: string): Promise<void> {
    await this.ensureParticipant(conversationId, userId);
    if (messageId) {
      await this.messages.update(
        { id: messageId, conversationId },
        { isRead: true, readAt: new Date() },
      );
    } else {
      await this.dataSource.query(
        `UPDATE messages SET is_read=true, read_at=NOW() WHERE conversation_id=$1 AND sender_id != $2 AND is_read=false`,
        [conversationId, userId],
      );
    }
    await this.participants.update({ conversationId, userId }, { lastReadAt: new Date() });
  }

  async getConversation(
    conversationId: string,
    userId: string,
    role: UserRole,
  ): Promise<Conversation> {
    if (role !== UserRole.ADMIN) await this.ensureParticipant(conversationId, userId);
    const convo = await this.conversations.findOne({ where: { id: conversationId } });
    if (!convo) throw BusinessException.notFound('Conversation introuvable.', ErrorCode.NOT_FOUND);
    return convo;
  }

  async closeConversation(
    conversationId: string,
    userId: string,
    role: UserRole,
  ): Promise<Conversation> {
    const convo = await this.getConversation(conversationId, userId, role);
    convo.status = ConversationStatus.CLOSED;
    return this.conversations.save(convo);
  }
}
