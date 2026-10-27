import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  AuditAction,
  AuditEntity,
  MobileMoneyProvider,
  OrderStatus,
  PaymentStatus,
} from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { getProvider } from './providers/mobile-money.providers';
import type { PaymentQueryDto, SubmitPaymentDto } from './dto/payment.dto';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async submit(
    userId: string,
    orderId: string,
    dto: SubmitPaymentDto,
    options: { idempotencyKey?: string; request?: Request } = {},
  ): Promise<Payment> {
    const { result } = await this.idempotency.run(
      'payments.submit',
      options.idempotencyKey,
      userId,
      { orderId, ...dto },
      () => this.submitInTransaction(userId, orderId, dto, options.request),
    );
    return result;
  }

  private async submitInTransaction(
    userId: string,
    orderId: string,
    dto: SubmitPaymentDto,
    request?: Request,
  ): Promise<Payment> {
    const provider = getProvider(dto.provider);
    if (!provider) {
      throw BusinessException.badRequest('Opérateur non supporté.', ErrorCode.UNSUPPORTED_PROVIDER);
    }

    const reference = dto.transactionReference.trim().toUpperCase();
    if (!provider.validateReferenceFormat(reference)) {
      throw BusinessException.badRequest(
        'Format de référence de transaction invalide.',
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId },
        relations: { items: true },
      });
      if (!order) {
        throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
      }
      // Contrôle d'appartenance : impossible de payer la commande d'autrui.
      if (order.userId !== userId) {
        throw BusinessException.forbidden(
          'Cette commande ne vous appartient pas.',
          ErrorCode.ORDER_NOT_OWNED,
        );
      }
      if ([OrderStatus.CANCELLED, OrderStatus.DELIVERED].includes(order.status)) {
        throw BusinessException.conflict(
          'Cette commande ne peut plus être payée.',
          ErrorCode.ORDER_INVALID_TRANSITION,
        );
      }

      const existing = await manager.getRepository(Payment).findOne({
        where: { orderId },
        order: { createdAt: 'DESC' },
      });

      // Anti double paiement.
      if (
        existing &&
        [PaymentStatus.PENDING, PaymentStatus.SUBMITTED, PaymentStatus.VERIFIED].includes(
          existing.status,
        )
      ) {
        throw BusinessException.conflict(
          existing.status === PaymentStatus.VERIFIED
            ? 'Cette commande est déjà payée.'
            : 'Un paiement est déjà en cours de vérification pour cette commande.',
          ErrorCode.PAYMENT_ALREADY_VERIFIED,
        );
      }

      // Référence déjà utilisée sur un paiement actif → refus.
      const referenceTaken = await manager
        .getRepository(Payment)
        .createQueryBuilder('p')
        .where('p.provider = :provider', { provider: dto.provider })
        .andWhere('UPPER(p."transaction_reference") = :reference', { reference })
        .andWhere("p.status IN ('pending','submitted','verified')")
        .getOne();
      if (referenceTaken) {
        throw BusinessException.conflict(
          'Cette référence de transaction a déjà été utilisée.',
          ErrorCode.PAYMENT_REFERENCE_USED,
        );
      }

      // Aucune validation automatique : tant qu'aucune API officielle n'est
      // branchée, le paiement reste SUBMITTED en attente de vérification.
      const check = await provider.checkReference(reference);
      const autoVerified = check.automatic === true && check.verified === true;

      const payment = manager.getRepository(Payment).create({
        orderId,
        provider: dto.provider,
        transactionReference: reference,
        amount: order.total, // montant recalculé côté serveur
        currency: order.currency,
        status: autoVerified ? PaymentStatus.VERIFIED : PaymentStatus.SUBMITTED,
        payerPhone: dto.payerPhone ?? null,
        proofObjectKey: dto.proofObjectKey ?? null,
        submittedAt: new Date(),
        metadata: {
          providerCheck: check,
          submittedByIp: request?.ip ?? null,
        },
      });
      const saved = await manager.getRepository(Payment).save(payment);

      const newOrderStatus = autoVerified ? OrderStatus.PAID : OrderStatus.PAYMENT_SUBMITTED;
      const previousStatus = order.status;
      order.status = newOrderStatus;
      await manager.getRepository(Order).save(order);

      await manager.getRepository(OrderStatusHistory).save(
        manager.getRepository(OrderStatusHistory).create({
          orderId,
          previousStatus,
          newStatus: newOrderStatus,
          changedBy: userId,
          comment: autoVerified
            ? 'Paiement vérifié automatiquement par l’opérateur.'
            : 'Référence de paiement soumise, en attente de vérification.',
        }),
      );

      await this.audit.log({
        userId,
        action: AuditAction.PAYMENT_SUBMITTED,
        entity: AuditEntity.PAYMENT,
        entityId: saved.id,
        request,
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          provider: dto.provider,
          reference,
          amount: order.total,
        },
      });

      await this.notifications.notifyPaymentSubmitted(
        userId,
        order.customerEmail,
        order.customerName,
        order.orderNumber,
      );

      // Alerte les administrateurs : un paiement est à vérifier.
      const admins = await this.notifications.adminIds();
      for (const adminId of admins) {
        await this.notifications.create({
          userId: adminId,
          type: 'PAYMENT_SUBMITTED' as never,
          title: 'Paiement à vérifier',
          body: `La commande ${order.orderNumber} attend une vérification de paiement (${dto.provider}).`,
          data: { paymentId: saved.id, orderId },
          channel: 'in_app' as never,
        });
      }

      return saved;
    });
  }

  /* ------------------------------- Vérification ------------------------------ */

  async verify(paymentId: string, adminId: string, request?: Request): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw BusinessException.notFound('Paiement introuvable.', ErrorCode.PAYMENT_NOT_FOUND);
    }
    if (payment.status === PaymentStatus.VERIFIED) {
      throw BusinessException.conflict(
        'Paiement déjà vérifié.',
        ErrorCode.PAYMENT_ALREADY_VERIFIED,
      );
    }
    if (payment.status !== PaymentStatus.SUBMITTED) {
      throw BusinessException.badRequest(
        'Ce paiement n’est pas en attente de vérification.',
        ErrorCode.PAYMENT_NOT_SUBMITTED,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({ where: { id: payment.orderId } });
      if (!order) {
        throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
      }
      if (order.total !== payment.amount) {
        throw BusinessException.conflict(
          'Le montant du paiement ne correspond plus au montant de la commande.',
          ErrorCode.PAYMENT_AMOUNT_MISMATCH,
        );
      }

      payment.status = PaymentStatus.VERIFIED;
      payment.verifiedAt = new Date();
      payment.verifiedBy = adminId;
      const saved = await manager.getRepository(Payment).save(payment);

      const previousStatus = order.status;
      order.status = OrderStatus.PAID;
      await manager.getRepository(Order).save(order);

      await manager.getRepository(OrderStatusHistory).save(
        manager.getRepository(OrderStatusHistory).create({
          orderId: order.id,
          previousStatus,
          newStatus: OrderStatus.PAID,
          changedBy: adminId,
          comment: 'Paiement vérifié par un administrateur.',
        }),
      );

      await this.audit.log({
        userId: adminId,
        action: AuditAction.PAYMENT_VERIFIED,
        entity: AuditEntity.PAYMENT,
        entityId: saved.id,
        request,
        metadata: { orderId: order.id, amount: saved.amount },
      });

      await this.notifications.notifyPaymentVerified(
        order.userId,
        order.customerEmail,
        order.customerName,
        order.orderNumber,
      );

      return saved;
    });
  }

  async reject(
    paymentId: string,
    adminId: string,
    reason: string,
    request?: Request,
  ): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw BusinessException.notFound('Paiement introuvable.', ErrorCode.PAYMENT_NOT_FOUND);
    }
    if (payment.status === PaymentStatus.VERIFIED) {
      throw BusinessException.conflict(
        'Paiement déjà vérifié, il ne peut plus être rejeté.',
        ErrorCode.PAYMENT_ALREADY_VERIFIED,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({ where: { id: payment.orderId } });
      if (!order) {
        throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
      }

      payment.status = PaymentStatus.REJECTED;
      payment.rejectionReason = reason;
      const saved = await manager.getRepository(Payment).save(payment);

      // La commande repasse en attente : le client peut soumettre une nouvelle
      // référence. Aucune validation automatique n'est simulée.
      const previousStatus = order.status;
      order.status = OrderStatus.PENDING_PAYMENT;
      await manager.getRepository(Order).save(order);

      await manager.getRepository(OrderStatusHistory).save(
        manager.getRepository(OrderStatusHistory).create({
          orderId: order.id,
          previousStatus,
          newStatus: OrderStatus.PENDING_PAYMENT,
          changedBy: adminId,
          comment: `Paiement rejeté : ${reason}`,
        }),
      );

      await this.audit.log({
        userId: adminId,
        action: AuditAction.PAYMENT_REJECTED,
        entity: AuditEntity.PAYMENT,
        entityId: saved.id,
        request,
        metadata: { orderId: order.id, reason },
      });

      await this.notifications.notifyPaymentRejected(
        order.userId,
        order.customerEmail,
        order.customerName,
        order.orderNumber,
        reason,
      );

      return saved;
    });
  }

  /* ------------------------------- Consultation ------------------------------ */

  async findForOrder(orderId: string): Promise<Payment | null> {
    return this.payments.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(
    query: PaymentQueryDto,
    scope: { sellerId?: string } = {},
  ): Promise<Paginated<Payment>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb: SelectQueryBuilder<Payment> = this.payments
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.order', 'order');

    // Un vendeur ne voit que les paiements des commandes contenant SES articles.
    // Sans ce filtre, `GET /seller/payments` exposerait toute la plateforme.
    if (scope.sellerId) {
      qb.andWhere(
        (sub) =>
          `payment."order_id" IN ${sub
            .subQuery()
            .select('oi."order_id"')
            .from(OrderItem, 'oi')
            .where('oi."seller_id" = :scopeSellerId', { scopeSellerId: scope.sellerId })
            .getQuery()}`,
      );
    }

    if (query.status) qb.andWhere('payment.status = :status', { status: query.status });
    if (query.provider) qb.andWhere('payment.provider = :provider', { provider: query.provider });
    if (query.orderId) qb.andWhere('payment."order_id" = :orderId', { orderId: query.orderId });
    if (query.pendingOnly) qb.andWhere("payment.status IN ('pending','submitted')");

    const [items, total] = await qb
      .orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: buildMeta(total, page, limit) };
  }

  async countByStatus(): Promise<Record<PaymentStatus, number>> {
    const rows = await this.payments
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany<{ status: PaymentStatus; count: string }>();

    const result = {
      [PaymentStatus.PENDING]: 0,
      [PaymentStatus.SUBMITTED]: 0,
      [PaymentStatus.VERIFIED]: 0,
      [PaymentStatus.REJECTED]: 0,
      [PaymentStatus.REFUNDED]: 0,
    } as Record<PaymentStatus, number>;
    for (const row of rows) result[row.status] = Number(row.count);
    return result;
  }

  providers(): { name: MobileMoneyProvider; label: string; automatic: boolean }[] {
    return (
      [
        MobileMoneyProvider.MVOLA,
        MobileMoneyProvider.ORANGE_MONEY,
        MobileMoneyProvider.AIRTEL_MONEY,
      ] as MobileMoneyProvider[]
    ).map((name) => {
      const provider = getProvider(name);
      return { name, label: provider.label, automatic: false };
    });
  }
}
