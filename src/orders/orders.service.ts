import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository, type SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';
import { Order, type OrderAddressSnapshot } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../users/entities/address.entity';
import { Payment } from '../payments/entities/payment.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  AuditAction,
  AuditEntity,
  OrderStatus,
  ProductStatus,
  ShippingMethod,
  UserRole,
} from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { CartService } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { generateOrderNumber } from '../common/utils/slug.util';
import { ConfigService } from '@nestjs/config';
import type { CancelOrderDto, CreateOrderDto, OrderQueryDto } from './dto/order.dto';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';

/** Matrice des transitions de statut autorisées. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.PAYMENT_SUBMITTED,
    OrderStatus.CANCELLED,
    OrderStatus.REJECTED,
  ],
  [OrderStatus.PAYMENT_SUBMITTED]: [
    OrderStatus.PAID,
    OrderStatus.REJECTED,
    OrderStatus.CANCELLED,
    OrderStatus.PENDING_PAYMENT, // paiement rejeté : nouvelle référence autorisée
  ],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.READY, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
};

/** Statuts qu'un vendeur peut appliquer sur une commande le concernant. */
const SELLER_ALLOWED: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.READY,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export interface ActorContext {
  userId: string;
  role: UserRole;
  sellerId?: string | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly history: Repository<OrderStatusHistory>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
  ) {}

  /* -------------------------------- Création -------------------------------- */

  async create(
    userId: string,
    dto: CreateOrderDto,
    options: { idempotencyKey?: string; request?: Request } = {},
  ): Promise<Order> {
    const { result } = await this.idempotency.run(
      'orders.create',
      options.idempotencyKey,
      userId,
      dto,
      () => this.createInTransaction(userId, dto, options.request),
    );
    return result;
  }

  private async createInTransaction(
    userId: string,
    dto: CreateOrderDto,
    request?: Request,
  ): Promise<Order> {
    const userRepo = this.dataSource.getRepository('users');
    const user = (await userRepo.findOne({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true },
    })) as {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
    } | null;
    if (!user) {
      throw BusinessException.notFound('Utilisateur introuvable.', ErrorCode.NOT_FOUND);
    }

    const shippingAddress = await this.resolveAddress(userId, dto);
    const requested = await this.resolveItems(userId, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const productIds = [...new Set(requested.map((item) => item.productId))].sort();

      // Verrouillage pessimiste, ordre déterministe → pas de deadlock.
      const locked = await manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_write')
        .whereInIds(productIds)
        .getMany();
      const byId = new Map(locked.map((product) => [product.id, product]));

      // Validation stricte : publié, non supprimé, stock suffisant.
      for (const item of requested) {
        const product = byId.get(item.productId);
        if (!product || product.deletedAt) {
          throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
        }
        if (product.status !== ProductStatus.PUBLISHED) {
          throw BusinessException.badRequest(
            `« ${product.name} » n'est pas disponible à la vente.`,
            ErrorCode.PRODUCT_NOT_PUBLISHED,
          );
        }
        if (product.stock < item.quantity) {
          throw BusinessException.conflict(
            `Stock insuffisant pour « ${product.name} » (${product.stock} disponible(s)).`,
            ErrorCode.INSUFFICIENT_STOCK,
          );
        }
      }

      // Montants recalculés côté serveur.
      const lines = requested.map((item) => {
        const product = byId.get(item.productId)!;
        const unitPrice = product.price;
        return {
          product,
          quantity: item.quantity,
          unitPrice,
          sellerId: product.sellerId,
          lineTotal: unitPrice * item.quantity,
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const { shippingCost, shippingMethod } = this.computeShipping(subtotal, dto.shippingMethod);
      const discount = 0;
      const total = Math.max(0, subtotal - discount) + shippingCost;

      // Numéro de commande unique (retry en cas de collision).
      let orderNumber = generateOrderNumber();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await manager.getRepository(Order).findOne({ where: { orderNumber } });
        if (!clash) break;
        orderNumber = generateOrderNumber();
      }

      const order = manager.getRepository(Order).create({
        orderNumber,
        userId,
        status: OrderStatus.PENDING_PAYMENT,
        subtotal,
        discount,
        promoCode: null,
        shippingMethod,
        shippingCost,
        total,
        currency: this.config.get<string>('commerce.currency') ?? 'MGA',
        shippingAddress: shippingAddress,
        customerName: shippingAddress.fullName || `${user.firstName} ${user.lastName}`.trim(),
        customerEmail: user.email,
        customerPhone: shippingAddress.phone || user.phone,
        notes: dto.notes ?? null,
        placedAt: new Date(),
      });
      const savedOrder = await manager.getRepository(Order).save(order);

      // Lignes figées : prix, nom, image et vendeur au moment de l'achat.
      const items = manager.getRepository(OrderItem).create(
        lines.map((line) => ({
          orderId: savedOrder.id,
          productId: line.product.id,
          sellerId: line.sellerId,
          name: line.product.name,
          slug: line.product.slug,
          imageUrl: line.product.images?.[0]?.url ?? null,
          sku: line.product.sku,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      );
      const savedItems = await manager.getRepository(OrderItem).save(items);

      // Décrément du stock : la condition `stock >= qty` interdit le stock négatif.
      for (const line of lines) {
        const result = await manager
          .createQueryBuilder()
          .update(Product)
          .set({
            stock: () => `stock - ${line.quantity}`,
            ...(line.product.stock - line.quantity <= 0
              ? { status: ProductStatus.OUT_OF_STOCK }
              : {}),
          })
          .where('id = :id', { id: line.product.id })
          .andWhere('stock >= :qty', { qty: line.quantity })
          .execute();
        if (!result.affected) {
          throw BusinessException.conflict(
            'Stock insuffisant, la commande a été annulée.',
            ErrorCode.INSUFFICIENT_STOCK,
          );
        }
      }

      await manager.getRepository(OrderStatusHistory).save(
        manager.getRepository(OrderStatusHistory).create({
          orderId: savedOrder.id,
          previousStatus: null,
          newStatus: OrderStatus.PENDING_PAYMENT,
          changedBy: userId,
          comment: 'Commande créée.',
        }),
      );

      savedOrder.items = savedItems;
      return savedOrder;
    });

    // Après COMMIT : panier vidé + notifications (hors transaction).
    if (!dto.items?.length) {
      await this.cartService.clear(userId).catch(() => undefined);
    }

    await this.audit.log({
      userId,
      action: AuditAction.ORDER_CREATED,
      entity: AuditEntity.ORDER,
      entityId: created.id,
      request,
      metadata: { orderNumber: created.orderNumber, total: created.total },
    });

    const full = await this.orders.findOne({
      where: { id: created.id },
      relations: { items: true },
    });
    await this.notifications
      .notifyOrderCreated(created, full?.items ?? [])
      .catch((error: Error) => this.logger.warn(`Notification commande : ${error.message}`));

    return created;
  }

  private async resolveAddress(userId: string, dto: CreateOrderDto): Promise<OrderAddressSnapshot> {
    if (dto.addressId) {
      const address = await this.dataSource.getRepository(Address).findOne({
        where: { id: dto.addressId },
      });
      // Contrôle d'appartenance : jamais de confiance aveugle dans l'ID reçu.
      if (!address || address.userId !== userId) {
        throw BusinessException.notFound('Adresse introuvable.', ErrorCode.NOT_FOUND);
      }
      return {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
      };
    }

    if (!dto.shippingAddress) {
      throw BusinessException.badRequest(
        'Une adresse de livraison est requise.',
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (dto.saveAddress) {
      await this.dataSource.getRepository(Address).save({
        userId,
        label: dto.addressLabel ?? null,
        fullName: dto.shippingAddress.fullName,
        phone: dto.shippingAddress.phone,
        addressLine1: dto.shippingAddress.addressLine1,
        addressLine2: dto.shippingAddress.addressLine2 ?? null,
        postalCode: dto.shippingAddress.postalCode ?? null,
        city: dto.shippingAddress.city,
        country: dto.shippingAddress.country ?? 'Madagascar',
        isDefault: false,
      });
    }

    return {
      fullName: dto.shippingAddress.fullName,
      phone: dto.shippingAddress.phone,
      addressLine1: dto.shippingAddress.addressLine1,
      addressLine2: dto.shippingAddress.addressLine2 ?? null,
      postalCode: dto.shippingAddress.postalCode ?? null,
      city: dto.shippingAddress.city,
      country: dto.shippingAddress.country ?? 'Madagascar',
    };
  }

  private async resolveItems(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<{ productId: string; quantity: number }[]> {
    if (dto.items?.length) {
      // Déduplique en cumulant les quantités.
      const merged = new Map<string, number>();
      for (const item of dto.items) {
        merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
      }
      return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    }

    const { items } = await this.cartService.getItemsForOrder(userId);
    if (items.length === 0) {
      throw BusinessException.badRequest('Votre panier est vide.', ErrorCode.CART_EMPTY);
    }
    return items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  }

  private computeShipping(
    subtotal: number,
    method: ShippingMethod = ShippingMethod.STANDARD,
  ): { shippingCost: number; shippingMethod: ShippingMethod } {
    const threshold = this.config.get<number>('commerce.freeShippingThreshold') ?? 1500000;
    if (subtotal >= threshold) return { shippingCost: 0, shippingMethod: method };
    if (method === ShippingMethod.EXPRESS) {
      return {
        shippingCost: this.config.get<number>('commerce.shippingExpressCost') ?? 25000,
        shippingMethod: method,
      };
    }
    if (method === ShippingMethod.PICKUP) return { shippingCost: 0, shippingMethod: method };
    return {
      shippingCost: this.config.get<number>('commerce.shippingStandardCost') ?? 10000,
      shippingMethod: method,
    };
  }

  /* ------------------------------- Consultation ------------------------------ */

  async findMyOrders(userId: string, query: OrderQueryDto): Promise<Paginated<Order>> {
    const qb = this.baseQuery().andWhere('"order"."user_id" = :userId', { userId });
    return this.paginateOrders(qb, query);
  }

  async findSellerOrders(sellerId: string, query: OrderQueryDto): Promise<Paginated<Order>> {
    // Sous-requête plutôt qu'une jointure : évite les doublons de lignes
    // lorsqu'une commande contient plusieurs articles du même vendeur.
    const qb = this.baseQuery().andWhere(
      (sub) =>
        `"order".id IN ${sub
          .subQuery()
          .select('oi."order_id"')
          .from(OrderItem, 'oi')
          .where('oi."seller_id" = :sellerId', { sellerId })
          .getQuery()}`,
    );
    return this.paginateOrders(qb, query, sellerId);
  }

  async findAll(query: OrderQueryDto): Promise<Paginated<Order>> {
    return this.paginateOrders(this.baseQuery(), query);
  }

  /** Contrôle d'appartenance systématique (sauf admin). */
  async findOne(id: string, actor: ActorContext): Promise<Order> {
    const order = await this.baseQuery().andWhere('"order".id = :id', { id }).getOne();
    if (!order) {
      throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
    }

    const attachPayment = async (): Promise<Order> => {
      const payment = await this.dataSource.getRepository(Payment).findOne({
        where: { orderId: order.id },
        order: { createdAt: 'DESC' },
      });
      order.payment = payment ?? null;
      return order;
    };

    if (actor.role === UserRole.ADMIN) return attachPayment();

    if (actor.role === UserRole.SELLER) {
      const concernsSeller = order.items?.some((item) => item.sellerId === actor.sellerId);
      if (!concernsSeller) {
        throw BusinessException.forbidden(
          'Cette commande ne concerne pas votre boutique.',
          ErrorCode.ORDER_NOT_OWNED,
        );
      }
      // Le vendeur ne voit QUE ses propres articles (et aucun paiement global).
      order.items = order.items.filter((item) => item.sellerId === actor.sellerId);
      return order;
    }
    if (order.userId !== actor.userId) {
      throw BusinessException.forbidden(
        'Cette commande ne vous appartient pas.',
        ErrorCode.ORDER_NOT_OWNED,
      );
    }
    return attachPayment();
  }

  /* --------------------------------- Statuts --------------------------------- */

  async updateStatus(
    id: string,
    newStatus: OrderStatus,
    actor: ActorContext,
    comment: string | null,
    request?: Request,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id }, relations: { items: true } });
    if (!order) {
      throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
    }

    // Verrou anti-fraude : « payé » ne s'obtient qu'en vérifiant une référence Mobile Money.
    // Ne jamais rouvrir ce passage par l'API, même pour un administrateur.
    if (newStatus === OrderStatus.PAID) {
      throw BusinessException.forbidden(
        'Le statut « payé » ne peut être atteint que par la vérification du paiement.',
        ErrorCode.ORDER_INVALID_TRANSITION,
      );
    }

    if (actor.role === UserRole.CUSTOMER) {
      throw BusinessException.forbidden(
        "Le suivi d'une commande est réservé au vendeur et à l'administration. Pour votre part, utilisez l'annulation.",
        ErrorCode.ORDER_NOT_OWNED,
      );
    }

    if (actor.role === UserRole.SELLER) {
      const concernsSeller = order.items?.some((item) => item.sellerId === actor.sellerId);
      if (!concernsSeller) {
        throw BusinessException.forbidden(
          'Cette commande ne concerne pas votre boutique.',
          ErrorCode.ORDER_NOT_OWNED,
        );
      }
      if (!SELLER_ALLOWED.includes(newStatus)) {
        throw BusinessException.forbidden(
          'Ce statut ne peut pas être appliqué par un vendeur.',
          ErrorCode.ORDER_INVALID_TRANSITION,
        );
      }
    }

    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw BusinessException.conflict(
        `Transition impossible : ${order.status} → ${newStatus}.`,
        ErrorCode.ORDER_INVALID_TRANSITION,
      );
    }

    const previous = order.status;
    order.status = newStatus;
    if (newStatus === OrderStatus.DELIVERED) order.placedAt = order.placedAt ?? new Date();

    const saved = await this.orders.save(order);

    await this.history.save(
      this.history.create({
        orderId: saved.id,
        previousStatus: previous,
        newStatus,
        changedBy: actor.userId,
        comment: comment ?? null,
      }),
    );

    await this.audit.log({
      userId: actor.userId,
      action: AuditAction.ORDER_STATUS_UPDATED,
      entity: AuditEntity.ORDER,
      entityId: saved.id,
      request,
      metadata: { previousStatus: previous, newStatus },
    });

    await this.notifications
      .notifyOrderStatusChanged(
        saved,
        STATUS_LABELS[newStatus] ?? newStatus,
        saved.customerEmail,
        saved.customerName,
      )
      .catch((error: Error) => this.logger.warn(`Notification statut : ${error.message}`));

    return saved;
  }

  /** Annulation : le client ne peut annuler qu'une commande non expédiée. */
  async cancel(
    id: string,
    actor: ActorContext,
    dto: CancelOrderDto,
    request?: Request,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id }, relations: { items: true } });
    if (!order) {
      throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
    }

    const isOwner = order.userId === actor.userId;
    const isAdmin = actor.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw BusinessException.forbidden(
        "Vous n'êtes pas autorisé à annuler cette commande.",
        ErrorCode.ORDER_NOT_OWNED,
      );
    }

    if (
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(order.status)
    ) {
      throw BusinessException.conflict(
        'Cette commande ne peut plus être annulée à ce stade.',
        ErrorCode.ORDER_NOT_CANCELLABLE,
      );
    }

    const previous = order.status;
    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelReason = dto.reason ?? null;
    const saved = await this.orders.save(order);

    // Remise en stock des articles.
    for (const item of order.items ?? []) {
      if (!item.productId) continue;
      await this.products
        .createQueryBuilder()
        .update()
        .set({ stock: () => `stock + ${item.quantity}` })
        .where('id = :id', { id: item.productId })
        .execute();
      await this.products
        .createQueryBuilder()
        .update()
        .set({ status: ProductStatus.PUBLISHED })
        .where('id = :id', { id: item.productId })
        .andWhere('stock > 0')
        .andWhere("status = 'out_of_stock'")
        .execute();
    }

    await this.history.save(
      this.history.create({
        orderId: saved.id,
        previousStatus: previous,
        newStatus: OrderStatus.CANCELLED,
        changedBy: actor.userId,
        comment: dto.reason ?? 'Annulation.',
      }),
    );

    await this.audit.log({
      userId: actor.userId,
      action: AuditAction.ORDER_CANCELLED,
      entity: AuditEntity.ORDER,
      entityId: saved.id,
      request,
      metadata: { reason: dto.reason ?? null },
    });

    return saved;
  }

  /* -------------------------------- Interne --------------------------------- */

  private baseQuery(): SelectQueryBuilder<Order> {
    return this.orders
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.statusHistory', 'statusHistory')
      .orderBy('statusHistory.createdAt', 'ASC');
  }

  private async paginateOrders(
    qb: SelectQueryBuilder<Order>,
    query: OrderQueryDto,
    sellerId?: string,
  ): Promise<Paginated<Order>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    if (query.status) qb.andWhere('"order".status = :status', { status: query.status });
    if (query.userId) qb.andWhere('"order"."user_id" = :userId', { userId: query.userId });
    const filterSellerId = sellerId ?? query.sellerId;
    if (filterSellerId) {
      qb.andWhere(
        (sub) =>
          `"order".id IN ${sub
            .subQuery()
            .select('oi."order_id"')
            .from(OrderItem, 'oi')
            .where('oi."seller_id" = :filterSellerId', { filterSellerId })
            .getQuery()}`,
      );
    }
    if (query.search) {
      qb.andWhere(
        '(order."order_number" ILIKE :search OR order."customer_name" ILIKE :search OR order."customer_email" ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.from && query.to) {
      qb.andWhere('"order"."created_at" BETWEEN :from AND :to', {
        from: new Date(query.from),
        to: new Date(query.to),
      });
    } else if (query.from) {
      qb.andWhere('"order"."created_at" >= :from', { from: new Date(query.from) });
    } else if (query.to) {
      qb.andWhere('"order"."created_at" <= :to', { to: new Date(query.to) });
    }

    qb.addOrderBy('order.createdAt', query.order ?? 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildMeta(total, page, limit) };
  }

  /** Sous-ensemble vendeur d'une commande (montant, articles). */
  sellerSubset(order: Order, sellerId: string): { amount: number; items: OrderItem[] } {
    const items = (order.items ?? []).filter((item) => item.sellerId === sellerId);
    return {
      amount: items.reduce((sum, item) => sum + item.lineTotal, 0),
      items,
    };
  }

  async findByIdRaw(id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true, user: true },
    });
    if (!order) {
      throw BusinessException.notFound('Commande introuvable.', ErrorCode.ORDER_NOT_FOUND);
    }
    return order;
  }

  async findByIds(ids: string[]): Promise<Order[]> {
    if (ids.length === 0) return [];
    return this.orders.find({ where: { id: In(ids) }, relations: { items: true } });
  }

  async countInRange(from: Date, to: Date): Promise<number> {
    return this.orders.count({ where: { createdAt: Between(from, to) } });
  }
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: 'En attente de paiement',
  [OrderStatus.PAYMENT_SUBMITTED]: 'Paiement soumis',
  [OrderStatus.PAID]: 'Payée',
  [OrderStatus.PROCESSING]: 'En préparation',
  [OrderStatus.READY]: 'Prête',
  [OrderStatus.SHIPPED]: 'Expédiée',
  [OrderStatus.DELIVERED]: 'Livrée',
  [OrderStatus.CANCELLED]: 'Annulée',
  [OrderStatus.REJECTED]: 'Rejetée',
};
