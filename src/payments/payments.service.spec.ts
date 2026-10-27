import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { ErrorCode } from '../common/errors/error-codes';
import { OrderStatus, MobileMoneyProvider, PaymentStatus } from '../common/enums';
import type { SubmitPaymentDto } from './dto/payment.dto';

const makeOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'order-1',
    orderNumber: 'CMD-TEST0001',
    userId: 'user-1',
    status: OrderStatus.PENDING_PAYMENT,
    total: 1_010_000,
    currency: 'MGA',
    customerEmail: 'client@example.local',
    customerName: 'Client',
    items: [],
    ...overrides,
  }) as unknown as Order;

const makePayment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'payment-1',
    orderId: 'order-1',
    provider: MobileMoneyProvider.MVOLA,
    transactionReference: 'MP2408151234A00001',
    amount: 1_010_000,
    status: PaymentStatus.SUBMITTED,
    ...overrides,
  }) as Payment;

const dto: SubmitPaymentDto = {
  provider: MobileMoneyProvider.MVOLA,
  transactionReference: 'MP2408151234A00001',
  payerPhone: '+261340000003',
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let payments: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifyPaymentSubmitted: jest.fn().mockResolvedValue(undefined),
    notifyPaymentVerified: jest.fn().mockResolvedValue(undefined),
    notifyPaymentRejected: jest.fn().mockResolvedValue(undefined),
    adminIds: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue(undefined),
  };
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

  /** Construit un faux EntityManager pour les blocs transactionnels. */
  const buildManager = ({
    order = makeOrder(),
    existingPayment = null as Payment | null,
    referenceTaken = null as Payment | null,
  } = {}) => {
    const cache = new Map<unknown, unknown>();
    const repo = (entity: unknown) => {
      if (cache.has(entity)) return cache.get(entity);
      const built = buildRepo(entity);
      cache.set(entity, built);
      return built;
    };
    const buildRepo = (entity: unknown) => {
      if (entity === Order) {
        return {
          findOne: jest.fn().mockResolvedValue(order),
          save: jest.fn().mockImplementation(async (o: unknown) => o),
        };
      }
      if (entity === Payment) {
        return {
          findOne: jest.fn().mockResolvedValue(existingPayment),
          create: jest.fn((d: unknown) => d),
          save: jest.fn().mockImplementation(async (p: unknown) => p),
          createQueryBuilder: jest.fn(() => {
            const qb: Record<string, jest.Mock> = {
              where: jest.fn(() => qb),
              andWhere: jest.fn(() => qb),
              getOne: jest.fn().mockResolvedValue(referenceTaken),
            };
            return qb;
          }),
        };
      }
      if (entity === OrderStatusHistory) {
        return {
          create: jest.fn((d: unknown) => d),
          save: jest.fn().mockImplementation(async (h: unknown) => h),
        };
      }
      return { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    };
    return {
      getRepository: jest.fn(repo),
      repoFor: (entity: unknown) => repo(entity) as { save: jest.Mock; findOne: jest.Mock },
    };
  };

  beforeEach(async () => {
    payments = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (p: unknown) => p),
      create: jest.fn((d: unknown) => d),
      createQueryBuilder: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: payments },
        { provide: getRepositoryToken(Order), useValue: {} },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn(), getRepository: jest.fn() },
        },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
    jest.clearAllMocks();
  });

  const withTransaction = (manager: unknown): void => {
    (
      (service as unknown as { dataSource: DataSource }).dataSource.transaction as jest.Mock
    ).mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => cb(manager));
  };

  describe('soumission', () => {
    it('crée un paiement SUBMITTED (jamais vérifié automatiquement)', async () => {
      const manager = buildManager({ order: makeOrder() });
      withTransaction(manager);

      const payment = await service.submit('user-1', 'order-1', dto);

      expect(payment.status).toBe(PaymentStatus.SUBMITTED);
      // Une référence n'est JAMAIS une preuve de paiement : pas de vérif auto.
      expect(payment.status).not.toBe(PaymentStatus.VERIFIED);
    });

    it('enregistre le montant de la commande côté serveur (pas celui du client)', async () => {
      const manager = buildManager({ order: makeOrder({ total: 2_500_000 }) });
      withTransaction(manager);

      const payment = await service.submit('user-1', 'order-1', {
        ...dto,
        amount: 1,
      } as never);

      expect(payment.amount).toBe(2_500_000);
    });

    it('refuse de payer la commande d’un autre client', async () => {
      const manager = buildManager({ order: makeOrder({ userId: 'autre' }) });
      withTransaction(manager);

      await expect(service.submit('user-1', 'order-1', dto)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.ORDER_NOT_OWNED,
      });
    });

    it('refuse un double paiement sur une commande déjà en cours', async () => {
      const manager = buildManager({
        order: makeOrder(),
        existingPayment: makePayment({ status: PaymentStatus.SUBMITTED }),
      });
      withTransaction(manager);

      await expect(service.submit('user-1', 'order-1', dto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.PAYMENT_ALREADY_VERIFIED,
      });
    });

    it('refuse une référence de transaction déjà utilisée', async () => {
      const manager = buildManager({
        order: makeOrder(),
        existingPayment: makePayment({ status: PaymentStatus.REJECTED }),
        referenceTaken: makePayment(),
      });
      withTransaction(manager);

      await expect(service.submit('user-1', 'order-1', dto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.PAYMENT_REFERENCE_USED,
      });
    });

    it('refuse un format de référence invalide (400)', async () => {
      const manager = buildManager();
      withTransaction(manager);

      await expect(
        service.submit('user-1', 'order-1', { ...dto, transactionReference: 'abc' }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('refuse de payer une commande annulée', async () => {
      const manager = buildManager({ order: makeOrder({ status: OrderStatus.CANCELLED }) });
      withTransaction(manager);

      await expect(service.submit('user-1', 'order-1', dto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });
  });

  describe('vérification manuelle', () => {
    it('un admin peut vérifier un paiement SUBMITTED → VERIFIED + commande PAID', async () => {
      payments.findOne.mockResolvedValue(makePayment({ status: PaymentStatus.SUBMITTED }));
      const manager = buildManager({ order: makeOrder({ total: 1_010_000 }) });
      withTransaction(manager);

      const result = await service.verify('payment-1', 'admin-1');

      expect(result.status).toBe(PaymentStatus.VERIFIED);
      expect(result.verifiedBy).toBe('admin-1');
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(manager.repoFor(Order).save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAID }),
      );
    });

    it('refuse la vérification d’un paiement déjà vérifié', async () => {
      payments.findOne.mockResolvedValue(makePayment({ status: PaymentStatus.VERIFIED }));

      await expect(service.verify('payment-1', 'admin-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.PAYMENT_ALREADY_VERIFIED,
      });
    });

    it('refuse la vérification d’un paiement non soumis', async () => {
      payments.findOne.mockResolvedValue(makePayment({ status: PaymentStatus.PENDING }));

      await expect(service.verify('payment-1', 'admin-1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.PAYMENT_NOT_SUBMITTED,
      });
    });

    it('refuse la vérification si le montant ne correspond plus à la commande', async () => {
      payments.findOne.mockResolvedValue(
        makePayment({ status: PaymentStatus.SUBMITTED, amount: 1_010_000 }),
      );
      const manager = buildManager({ order: makeOrder({ total: 999_000 }) });
      withTransaction(manager);

      await expect(service.verify('payment-1', 'admin-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
      });
    });

    it('404 si le paiement n’existe pas', async () => {
      payments.findOne.mockResolvedValue(null);

      await expect(service.verify('inconnu', 'admin-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.PAYMENT_NOT_FOUND,
      });
    });
  });

  describe('cloisonnement par vendeur', () => {
    /** Faux query builder pour `findAll`. */
    const buildListQb = () => {
      const qb: Record<string, jest.Mock> = {
        leftJoinAndSelect: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        skip: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      return qb;
    };

    it('un admin liste tous les paiements (aucun filtre vendeur)', async () => {
      const qb = buildListQb();
      payments.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('un vendeur ne voit que les paiements de SES commandes', async () => {
      const qb = buildListQb();
      payments.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({}, { sellerId: 'seller-1' });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      const [predicate] = qb.andWhere.mock.calls[0];
      expect(String(predicate)).toContain('seller_id');
    });
  });
});
