import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { SellersService } from './sellers.service';
import { Seller } from './entities/seller.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ErrorCode } from '../common/errors/error-codes';
import { SellerStatus, UserRole } from '../common/enums';
import type { ApplySellerDto } from './dto/seller.dto';

const makeSeller = (overrides: Partial<Seller> = {}): Seller =>
  ({
    id: 'seller-1',
    userId: 'user-1',
    shopName: 'Atelier Bois de Rose',
    slug: 'atelier-bois-de-rose',
    status: SellerStatus.PENDING,
    ...overrides,
  }) as Seller;

const application: ApplySellerDto = {
  shopName: 'Atelier Bois de Rose',
  description: 'Mobilier en bois massif',
  phone: '+261340000001',
  city: 'Antananarivo',
  addressLine: 'Lot II M 12',
  documentKeys: [],
};

describe('SellersService', () => {
  let service: SellersService;
  let sellers: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let updateQb: Record<string, jest.Mock>;

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifySellerPending: jest.fn().mockResolvedValue(undefined),
    notifySellerApproved: jest.fn().mockResolvedValue(undefined),
    notifySellerRejected: jest.fn().mockResolvedValue(undefined),
    notifySellerApplicationReceived: jest.fn().mockResolvedValue(undefined),
    adminIds: jest.fn().mockResolvedValue(['admin-1']),
  };
  const usersService = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'vendeur@example.local', firstName: 'Vendeur' }),
  };

  beforeEach(async () => {
    updateQb = {
      update: jest.fn(() => updateQb),
      set: jest.fn(() => updateQb),
      where: jest.fn(() => updateQb),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    sellers = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (entity: unknown) => entity),
      create: jest.fn((dto: unknown) => ({ ...(dto as object) })),
      createQueryBuilder: jest.fn().mockReturnValue(updateQb),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SellersService,
        { provide: getRepositoryToken(Seller), useValue: sellers },
        {
          provide: DataSource,
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(updateQb) },
        },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = moduleRef.get(SellersService);
    jest.clearAllMocks();
  });

  describe('demande vendeur', () => {
    it('crée la boutique en statut PENDING', async () => {
      const seller = await service.apply('user-1', application);
      expect(seller.status).toBe(SellerStatus.PENDING);
      expect(sellers.save).toHaveBeenCalled();
    });

    it('refuse une seconde demande tant que la première est en attente', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.PENDING }));

      await expect(service.apply('user-1', application)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.SELLER_APPLICATION_PENDING,
      });
    });

    it('refuse une nouvelle demande si le vendeur est déjà approuvé', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.APPROVED }));

      await expect(service.apply('user-1', application)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.SELLER_ALREADY_EXISTS,
      });
    });
  });

  describe('validation admin', () => {
    it('approuve une demande PENDING → APPROVED + rôle vendeur', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.PENDING }));

      const seller = await service.approve('seller-1', 'admin-1');

      expect(seller.status).toBe(SellerStatus.APPROVED);
      expect(seller.reviewedById).toBe('admin-1');
      expect(updateQb.set).toHaveBeenCalledWith({ role: UserRole.SELLER });
      expect(notifications.notifySellerApproved).toHaveBeenCalled();
    });

    it('approuver une boutique déjà approuvée est idempotent', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.APPROVED }));

      await service.approve('seller-1', 'admin-1');

      // Pas de nouvelle sauvegarde ni de notification.
      expect(sellers.save).not.toHaveBeenCalled();
      expect(notifications.notifySellerApproved).not.toHaveBeenCalled();
    });

    it('rejette une demande avec motif', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.PENDING }));

      const seller = await service.reject('seller-1', 'admin-1', 'Documents illisibles');

      expect(seller.status).toBe(SellerStatus.REJECTED);
      expect(seller.rejectionReason).toBe('Documents illisibles');
      expect(notifications.notifySellerRejected).toHaveBeenCalledWith(
        'user-1',
        'vendeur@example.local',
        'Vendeur',
        'Documents illisibles',
      );
    });

    it('suspend une boutique approuvée', async () => {
      sellers.findOne.mockResolvedValue(makeSeller({ status: SellerStatus.APPROVED }));

      const seller = await service.suspend('seller-1', 'admin-1', 'Fraude');

      expect(seller.status).toBe(SellerStatus.SUSPENDED);
      expect(seller.rejectionReason).toBe('Fraude');
    });

    it('404 si la boutique n’existe pas', async () => {
      sellers.findOne.mockResolvedValue(null);

      await expect(service.approve('inconnu', 'admin-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });
  });
});
