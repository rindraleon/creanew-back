import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationChannel, NotificationType, ProductStatus } from '../common/enums';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';
import { MailService } from '../shared/mail/mail.service';
import { QueueService } from '../shared/queue/queue.service';
import {
  lowStockTemplate,
  orderCreatedSellerTemplate,
  orderStatusTemplate,
  paymentRejectedTemplate,
  paymentSubmittedTemplate,
  paymentVerifiedTemplate,
  sellerApprovedTemplate,
  sellerPendingTemplate,
  sellerRejectedTemplate,
} from '../shared/mail/templates';
import { ConfigService } from '@nestjs/config';
import type { Order } from '../orders/entities/order.entity';
import type { OrderItem } from '../orders/entities/order-item.entity';
import type { Product } from '../products/entities/product.entity';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: NotificationChannel;
  email?: { to: string; subject: string; html: string };
}

/** Lignes brutes des requêtes de notification : le pilote pg ne type pas le résultat. */
interface SellerOwnerRow {
  id: string;
  shopName: string;
  email: string;
  firstName: string;
}
interface SellerContactRow {
  shopName: string;
  email: string;
}
interface AdminRow {
  id: string;
}
interface SellerUserIdRow {
  userId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = this.notifications.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      channel: input.channel ?? NotificationChannel.BOTH,
    });
    const saved = await this.notifications.save(notification);

    if (input.email) {
      // Envoi d'e-mail asynchrone : la requête HTTP n'attend jamais le SMTP.
      await this.queue.addEmail({
        to: input.email.to,
        subject: input.email.subject,
        html: input.email.html,
      });
    }
    return saved;
  }

  async notifyOrderCreated(order: Order, items: OrderItem[]): Promise<void> {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const bySeller = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = bySeller.get(item.sellerId) ?? [];
      list.push(item);
      bySeller.set(item.sellerId, list);
    }

    for (const [sellerId, sellerItems] of bySeller) {
      const sellerAmount = sellerItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const owner = await this.dataSource.query<SellerOwnerRow[]>(
        `SELECT s.id, s."shop_name" AS "shopName", u.email, u."first_name" AS "firstName"
           FROM sellers s JOIN users u ON u.id = s."user_id"
          WHERE s.id = $1`,
        [sellerId],
      );
      const row = owner?.[0];
      if (!row) continue;

      const mail = orderCreatedSellerTemplate({
        to: row.email,
        sellerName: row.shopName || row.firstName,
        orderNumber: order.orderNumber,
        lines: sellerItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
        sellerAmount,
        frontendUrl,
      });

      await this.create({
        userId: await this.userIdForSeller(sellerId),
        type: NotificationType.ORDER_CREATED,
        title: 'Nouvelle commande reçue',
        body: `La commande ${order.orderNumber} contient ${sellerItems.length} article(s) de votre boutique.`,
        data: { orderId: order.id, orderNumber: order.orderNumber, sellerAmount },
        email: { to: mail.to, subject: mail.subject, html: mail.html },
      });
    }
  }

  async notifyOrderStatusChanged(
    order: Order,
    statusLabel: string,
    customerEmail: string,
    customerName: string,
  ): Promise<void> {
    const mail = orderStatusTemplate(customerEmail, customerName, order.orderNumber, statusLabel);
    await this.create({
      userId: order.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: `Commande ${order.orderNumber} : ${statusLabel}`,
      body: `Le statut de votre commande est maintenant « ${statusLabel} ».`,
      data: { orderId: order.id, status: order.status },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifyPaymentSubmitted(
    userId: string,
    email: string,
    name: string,
    orderNumber: string,
  ): Promise<void> {
    const mail = paymentSubmittedTemplate(email, name, orderNumber);
    await this.create({
      userId,
      type: NotificationType.PAYMENT_SUBMITTED,
      title: 'Paiement en cours de vérification',
      body: `Votre référence de paiement pour la commande ${orderNumber} a bien été reçue.`,
      data: { orderNumber },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifyPaymentVerified(
    userId: string,
    email: string,
    name: string,
    orderNumber: string,
  ): Promise<void> {
    const mail = paymentVerifiedTemplate(email, name, orderNumber);
    await this.create({
      userId,
      type: NotificationType.PAYMENT_VERIFIED,
      title: 'Paiement vérifié',
      body: `Le paiement de la commande ${orderNumber} a été vérifié.`,
      data: { orderNumber },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifyPaymentRejected(
    userId: string,
    email: string,
    name: string,
    orderNumber: string,
    reason?: string | null,
  ): Promise<void> {
    const mail = paymentRejectedTemplate(email, name, orderNumber, reason);
    await this.create({
      userId,
      type: NotificationType.PAYMENT_REJECTED,
      title: 'Paiement non validé',
      body: `Le paiement de la commande ${orderNumber} n'a pas pu être vérifié.`,
      data: { orderNumber, reason: reason ?? null },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifySellerApplicationReceived(
    adminIds: string[],
    shopName: string,
    applicantEmail: string,
  ): Promise<void> {
    for (const adminId of adminIds) {
      await this.create({
        userId: adminId,
        type: NotificationType.SELLER_APPLICATION_RECEIVED,
        title: 'Nouvelle demande vendeur',
        body: `${shopName} (${applicantEmail}) demande à devenir vendeur.`,
        data: { shopName },
        channel: NotificationChannel.IN_APP,
      });
    }
  }

  async notifySellerApproved(userId: string, email: string, name: string): Promise<void> {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const mail = sellerApprovedTemplate(email, name, frontendUrl);
    await this.create({
      userId,
      type: NotificationType.SELLER_APPROVED,
      title: 'Votre boutique est approuvée',
      body: 'Vous pouvez désormais publier vos produits.',
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifySellerRejected(
    userId: string,
    email: string,
    name: string,
    reason?: string | null,
  ): Promise<void> {
    const mail = sellerRejectedTemplate(email, name, reason);
    await this.create({
      userId,
      type: NotificationType.SELLER_REJECTED,
      title: 'Demande vendeur refusée',
      body: reason ?? 'Votre demande vendeur a été refusée.',
      data: { reason: reason ?? null },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifySellerPending(userId: string, email: string, name: string): Promise<void> {
    const mail = sellerPendingTemplate(email, name);
    await this.create({
      userId,
      type: NotificationType.SELLER_APPLICATION_RECEIVED,
      title: 'Demande vendeur reçue',
      body: 'Votre demande est en cours de validation par un administrateur.',
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  async notifyLowStock(sellerId: string, product: Product): Promise<void> {
    const userId = await this.userIdForSeller(sellerId);
    if (!userId) return;

    const owner = await this.dataSource.query<SellerContactRow[]>(
      `SELECT s."shop_name" AS "shopName", u.email
         FROM sellers s JOIN users u ON u.id = s."user_id"
        WHERE s.id = $1`,
      [sellerId],
    );
    const row = owner?.[0];
    if (!row) return;

    const mail = lowStockTemplate(row.email, row.shopName, [
      { name: product.name, stock: product.stock },
    ]);

    await this.create({
      userId,
      type: NotificationType.LOW_STOCK,
      title: 'Stock faible',
      body: `« ${product.name} » : ${product.stock} article(s) restant(s).`,
      data: { productId: product.id, stock: product.stock, status: ProductStatus.PUBLISHED },
      email: { to: mail.to, subject: mail.subject, html: mail.html },
    });
  }

  /* ------------------------------- Consultation ------------------------------ */

  async findForUser(
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean },
  ): Promise<Paginated<Notification>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n."user_id" = :userId', { userId });
    if (query.unreadOnly) qb.andWhere('n."read_at" IS NULL');

    const [items, total] = await qb
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: buildMeta(total, page, limit) };
  }

  async countUnread(userId: string): Promise<number> {
    return this.notifications
      .createQueryBuilder('n')
      .where('n."user_id" = :userId', { userId })
      .andWhere('n."read_at" IS NULL')
      .getCount();
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id } });
    if (notification?.userId !== userId) {
      throw new Error('NOTIFICATION_NOT_FOUND');
    }
    notification.readAt = new Date();
    return this.notifications.save(notification);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notifications
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('"user_id" = :userId', { userId })
      .andWhere('"read_at" IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  async adminIds(): Promise<string[]> {
    const rows = await this.dataSource.query<AdminRow[]>(
      `SELECT id FROM users WHERE role = 'admin' AND "is_active" = true AND "deleted_at" IS NULL`,
    );
    return rows.map((row) => row.id);
  }

  private async userIdForSeller(sellerId: string): Promise<string> {
    const rows = await this.dataSource.query<SellerUserIdRow[]>(
      'SELECT "user_id" AS "userId" FROM sellers WHERE id = $1',
      [sellerId],
    );
    return rows?.[0]?.userId ?? '';
  }
}
