import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { OrdersService, type ActorContext } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Product } from '../products/entities/product.entity';
import { CartService } from '../cart/cart.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { ErrorCode } from '../common/errors/error-codes';
import { OrderStatus, UserRole } from '../common/enums';
import { ConfigService } from '@nestjs/config';

/** Faux QueryBuilder de lecture (baseQuery). */
const fakeReadQb = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'leftJoinAndSelect',
    'leftJoin',
    'innerJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'select',
    'take',
    'skip',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
};

const makeOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    orderNumber: 'CMD-TEST0001',
    userId: 'user-1',
    status: OrderStatus.PENDING_PAYMENT,
    subtotal: 1_000_000,
    shippingCost: 10_000,
    discount: 0,
    total: 1_010_000,
    items: [{ id: 'item-1', productId: 'product-1', quantity: 2, sellerId: 'seller-1' }],
    customerEmail: 'client@example.local',
    customerName: 'Client',
    ...overrides,
  }) as unknown as Order;

/** Faux QueryBuilder d'UPDATE : permet de vérifier la remise en stock. */
const fakeUpdateQb = () => {
  const qb: Record<string, jest.Mock> = {
    update: jest.fn(() => qb),
    set: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return qb;
};

describe('OrdersService', () => {
  let service: OrdersService;
  let orders: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let history: { save: jest.Mock; create: jest.Mock };
  let products: { createQueryBuilder: jest.Mock; save: jest.Mock };
  let updateQb: ReturnType<typeof fakeUpdateQb>;
  let readQb: ReturnType<typeof fakeReadQb>;

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifyOrderStatusChanged: jest.fn().mockResolvedValue(undefined),
    notifyOrderCancelled: jest.fn().mockResolvedValue(undefined),
  };
  const cartService = { getCart: jest.fn(), clear: jest.fn() };
  const idempotency = {
    run: jest
      .fn()
      .mockImplementation(
        async (
          _s: string,
          _k: unknown,
          _u: unknown,
          _p: unknown,
          handler: () => Promise<unknown>,
        ) => ({
          result: await handler(),
          replayed: false,
        }),
      ),
  };
  const config = { get: jest.fn().mockReturnValue(10_000) };

  const paymentRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const addressRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const dataSource = {
    transaction: jest.fn(),
    getRepository: jest.fn((entity: unknown) =>
      // Payment et Address sont chargés explicitement ; tout autre dépôt reste neutre.
      String((entity as { name?: string })?.name) === 'Payment' ? paymentRepo : addressRepo,
    ),
  };

  beforeEach(async () => {
    updateQb = fakeUpdateQb();
    readQb = fakeReadQb();
    orders = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (entity: unknown) => entity),
      create: jest.fn((dto: unknown) => dto),
      createQueryBuilder: jest.fn().mockReturnValue(readQb),
    };
    history = {
      save: jest.fn().mockImplementation(async (entity: unknown) => entity),
      create: jest.fn((dto: unknown) => dto),
    };
    products = {
      createQueryBuilder: jest.fn().mockReturnValue(updateQb),
      save: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(OrderStatusHistory), useValue: history },
        { provide: getRepositoryToken(Product), useValue: products },
        { provide: DataSource, useValue: dataSource },
        { provide: CartService, useValue: cartService },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
    jest.clearAllMocks();
  });

  describe('transitions de statut', () => {
    it('pending_payment → paid est interdite (il faut une vérification manuelle)', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING_PAYMENT }));

      await expect(
        service.updateStatus('order-1', OrderStatus.PAID, adminActor(), null),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_INVALID_TRANSITION,
      });
    });

    it('pending_payment → payment_submitted est autorisée', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING_PAYMENT }));

      await service.updateStatus('order-1', OrderStatus.PAYMENT_SUBMITTED, adminActor(), null);

      expect(orders.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAYMENT_SUBMITTED }),
      );
      expect(history.save).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStatus: OrderStatus.PENDING_PAYMENT,
          newStatus: OrderStatus.PAYMENT_SUBMITTED,
        }),
      );
    });

    it('payment_submitted → paid est interdite en direct : seule la vérification du paiement y mène', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAYMENT_SUBMITTED }));

      await expect(
        service.updateStatus('order-1', OrderStatus.PAID, adminActor(), null),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_INVALID_TRANSITION,
      });

      expect(orders.save).not.toHaveBeenCalled();
    });

    it('delivered → cancelled est interdite (statut final)', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DELIVERED }));

      await expect(
        service.updateStatus('order-1', OrderStatus.CANCELLED, adminActor(), null),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ORDER_INVALID_TRANSITION,
      });
    });

    it('un vendeur ne peut pas appliquer un statut hors de son périmètre', async () => {
      orders.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.PENDING_PAYMENT,
          items: [{ sellerId: 'seller-1' }] as never,
        }),
      );

      await expect(
        service.updateStatus('order-1', OrderStatus.PAID, sellerActor('seller-1'), null),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_INVALID_TRANSITION,
      });
    });

    it('un vendeur ne peut pas toucher une commande qui ne le concerne pas', async () => {
      orders.findOne.mockResolvedValue(
        makeOrder({ status: OrderStatus.PAID, items: [{ sellerId: 'seller-1' }] as never }),
      );

      await expect(
        service.updateStatus('order-1', OrderStatus.PROCESSING, sellerActor('seller-2'), null),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_NOT_OWNED,
      });
    });

    it('un vendeur peut faire avancer une commande qui le concerne', async () => {
      orders.findOne.mockResolvedValue(
        makeOrder({ status: OrderStatus.PAID, items: [{ sellerId: 'seller-1' }] as never }),
      );

      await service.updateStatus('order-1', OrderStatus.PROCESSING, sellerActor('seller-1'), null);
      expect(orders.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PROCESSING }),
      );
    });

    describe('verrouillage du paiement', () => {
      it('un client ne peut pas marquer sa commande comme payée', async () => {
        orders.findOne.mockResolvedValue(
          makeOrder({ status: OrderStatus.PAYMENT_SUBMITTED, userId: 'client-1' }),
        );

        await expect(
          service.updateStatus('order-1', OrderStatus.PAID, customerActor('client-1'), null),
        ).rejects.toMatchObject({
          status: HttpStatus.FORBIDDEN,
          code: ErrorCode.ORDER_INVALID_TRANSITION,
        });
      });

      it("un client ne peut pas faire avancer sa commande vers l'expédition", async () => {
        orders.findOne.mockResolvedValue(
          makeOrder({ status: OrderStatus.PAID, userId: 'client-1' }),
        );

        for (const statut of [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED]) {
          await expect(
            service.updateStatus('order-1', statut, customerActor('client-1'), null),
          ).rejects.toMatchObject({
            status: HttpStatus.FORBIDDEN,
            code: ErrorCode.ORDER_NOT_OWNED,
          });
        }
      });

      it('un client ne peut pas annuler une commande qui n’est pas la sienne', async () => {
        orders.findOne.mockResolvedValue(
          makeOrder({ status: OrderStatus.PENDING_PAYMENT, userId: 'client-1' }),
        );

        await expect(
          service.cancel('order-1', customerActor('client-2'), { reason: 'fra' }, undefined),
        ).rejects.toMatchObject({
          status: HttpStatus.FORBIDDEN,
          code: ErrorCode.ORDER_NOT_OWNED,
        });
      });

      it('le statut payé est refusé à tout le monde en direct', async () => {
        orders.findOne.mockResolvedValue(
          makeOrder({
            status: OrderStatus.PAYMENT_SUBMITTED,
            items: [{ sellerId: 'seller-1' }] as never,
          }),
        );

        await expect(
          service.updateStatus('order-1', OrderStatus.PAID, adminActor(), null),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
        await expect(
          service.updateStatus('order-1', OrderStatus.PAID, sellerActor('seller-1'), null),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      });
    });

    it('404 si la commande n’existe pas', async () => {
      orders.findOne.mockResolvedValue(null);
      await expect(
        service.updateStatus('inconnu', OrderStatus.PAID, adminActor(), null),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });
  });

  describe('annulation', () => {
    it('le client peut annuler sa commande non expédiée', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAID, userId: 'user-1' }));

      await service.cancel('order-1', customerActor('user-1'), { reason: 'test' });

      expect(orders.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.CANCELLED }),
      );
    });

    it('un autre client ne peut pas annuler la commande', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAID, userId: 'user-1' }));

      await expect(
        service.cancel('order-1', customerActor('user-2'), { reason: 'test' }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_NOT_OWNED,
      });
    });

    it('une commande expédiée n’est plus annulable', async () => {
      orders.findOne.mockResolvedValue(
        makeOrder({ status: OrderStatus.SHIPPED, userId: 'user-1' }),
      );

      await expect(
        service.cancel('order-1', customerActor('user-1'), { reason: 'test' }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ORDER_NOT_CANCELLABLE,
      });
    });

    it('l’annulation remet les articles en stock', async () => {
      orders.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAID, userId: 'user-1' }));

      await service.cancel('order-1', customerActor('user-1'), { reason: 'test' });

      const restockCall = updateQb.set.mock.calls.find(
        (call: [{ stock?: unknown }]) => typeof call[0].stock === 'function',
      );
      expect(restockCall).toBeDefined();
      const restockExpr = (restockCall![0].stock as () => string)();
      expect(restockExpr).toBe('stock + 2');
      expect(updateQb.where).toHaveBeenCalledWith('id = :id', { id: 'product-1' });
      expect(updateQb.execute).toHaveBeenCalled();
    });
  });

  describe('accès à une commande', () => {
    it('un client ne peut pas lire la commande d’un autre client', async () => {
      readQb.getOne.mockResolvedValue(makeOrder({ userId: 'user-1' }));

      await expect(
        service.findOne('order-1', { userId: 'user-2', role: UserRole.CUSTOMER }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_NOT_OWNED,
      });
    });

    it('un vendeur ne voit que ses propres articles', async () => {
      readQb.getOne.mockResolvedValue(
        makeOrder({
          items: [
            { id: 'i1', productId: 'p1', sellerId: 'seller-1' },
            { id: 'i2', productId: 'p2', sellerId: 'seller-2' },
          ] as never,
        }),
      );

      const order = await service.findOne('order-1', sellerActor('seller-1'));
      expect(order.items).toHaveLength(1);
      expect(order.items[0].sellerId).toBe('seller-1');
    });

    it('l’admin peut lire n’importe quelle commande', async () => {
      readQb.getOne.mockResolvedValue(makeOrder({ userId: 'user-1' }));

      await expect(
        service.findOne('order-1', { userId: 'admin-1', role: UserRole.ADMIN }),
      ).resolves.toMatchObject({ id: 'order-1' });
    });

    it('expose le paiement au client propriétaire', async () => {
      readQb.getOne.mockResolvedValue(makeOrder({ userId: 'user-1' }));
      const payment = { id: 'pay-1', orderId: 'order-1', status: 'submitted' };
      paymentRepo.findOne.mockResolvedValue(payment);

      const order = await service.findOne('order-1', customerActor('user-1'));

      expect(order.payment).toEqual(payment);
    });

    it('ne divulgue pas le paiement global à un vendeur', async () => {
      readQb.getOne.mockResolvedValue(makeOrder({ userId: 'user-1' }));
      paymentRepo.findOne.mockResolvedValue({ id: 'pay-1', status: 'submitted' });

      const order = await service.findOne('order-1', sellerActor('seller-1'));

      // §35 : le vendeur voit ses lignes, jamais le paiement global de la commande.
      expect(order.payment).toBeUndefined();
      expect(paymentRepo.findOne).not.toHaveBeenCalled();
    });
  });
});

function adminActor(): ActorContext {
  return { userId: 'admin-1', role: UserRole.ADMIN };
}

function sellerActor(sellerId: string): ActorContext {
  return { userId: 'seller-user', role: UserRole.SELLER, sellerId };
}

function customerActor(userId: string): ActorContext {
  return { userId, role: UserRole.CUSTOMER };
}
