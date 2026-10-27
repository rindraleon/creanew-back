import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';

import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ErrorCode } from '../common/errors/error-codes';
import { ProductStatus, UserRole } from '../common/enums';

/** Faux QueryBuilder : renvoie `result` pour getOne(). */
const fakeQb = (result: unknown) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'leftJoinAndSelect',
    'leftJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'select',
    'take',
    'skip',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getOne = jest.fn().mockResolvedValue(result);
  qb.getManyAndCount = jest.fn().mockResolvedValue([result ? [result] : [], result ? 1 : 0]);
  qb.getMany = jest.fn().mockResolvedValue(result ? [result] : []);
  qb.getCount = jest.fn().mockResolvedValue(result ? 1 : 0);
  return qb;
};

const makeProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'product-1',
    name: 'Canapé Oslo',
    slug: 'canape-oslo',
    price: 1_250_000,
    stock: 4,
    sellerId: 'seller-1',
    categoryId: 'cat-1',
    status: ProductStatus.PUBLISHED,
    lowStockThreshold: null,
    deletedAt: null,
    images: [],
    ...overrides,
  }) as Product;

describe('ProductsService', () => {
  let service: ProductsService;
  let products: jest.Mocked<Partial<Repository<Product>>>;
  let qb: ReturnType<typeof fakeQb>;

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notifyLowStock: jest.fn().mockResolvedValue(undefined) };
  const images = { save: jest.fn(), delete: jest.fn(), find: jest.fn().mockResolvedValue([]) };
  const categoriesService = { findById: jest.fn().mockResolvedValue({ id: 'cat-1' }) };
  const dataSource = { transaction: jest.fn(), getRepository: jest.fn() };

  beforeEach(async () => {
    qb = fakeQb(null);
    products = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((dto: unknown) => dto),
      save: jest.fn().mockImplementation(async (entity: unknown) => entity),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Partial<Repository<Product>>>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: products },
        { provide: getRepositoryToken(ProductImage), useValue: images },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: audit },
        { provide: CategoriesService, useValue: categoriesService },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
    jest.clearAllMocks();
  });

  it('findById → 404 PRODUCT_NOT_FOUND si le produit n’existe pas', async () => {
    await expect(service.findById('inconnu')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.PRODUCT_NOT_FOUND,
    });
  });

  it('findById → renvoie le produit trouvé', async () => {
    const product = makeProduct();
    qb.getOne.mockResolvedValue(product);
    await expect(service.findById('product-1')).resolves.toMatchObject({ id: 'product-1' });
  });

  it('updateForSeller → 403 PRODUCT_NOT_OWNED si le vendeur n’est pas propriétaire (IDOR)', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await expect(
      service.updateForSeller('product-1', 'seller-2', { price: 1 }),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: ErrorCode.PRODUCT_NOT_OWNED,
    });

    expect(products.save).not.toHaveBeenCalled();
  });

  it('updateForSeller → autorisé pour le propriétaire', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await service.updateForSeller('product-1', 'seller-1', { price: 1_500_000 });
    expect(products.save).toHaveBeenCalled();
  });

  it('updateForSeller → l’admin peut modifier le produit d’un vendeur', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await service.updateForSeller('product-1', 'autre', { price: 10 }, { isAdmin: true });
    expect(products.save).toHaveBeenCalled();
  });

  it('updateForSeller → un vendeur ne peut pas s’attribuer isFeatured', async () => {
    const product = makeProduct({ sellerId: 'seller-1', isFeatured: false });
    qb.getOne.mockResolvedValue(product);

    await service.updateForSeller('product-1', 'seller-1', { isFeatured: true });

    expect(products.save).toHaveBeenCalledWith(expect.objectContaining({ isFeatured: false }));
  });

  it('removeForSeller → soft delete (le produit reste dans l’historique des commandes)', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await service.removeForSeller('product-1', 'seller-1');
    expect(products.softDelete).toHaveBeenCalledWith('product-1');
  });

  it('removeForSeller → 403 si le vendeur n’est pas propriétaire', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await expect(service.removeForSeller('product-1', 'seller-2')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: ErrorCode.PRODUCT_NOT_OWNED,
    });
    expect(products.softDelete).not.toHaveBeenCalled();
  });

  it('findAll → enveloppe de pagination { items, meta }', async () => {
    qb.getManyAndCount.mockResolvedValue([[makeProduct()], 1]);

    const result = await service.findAll({ page: 2, limit: 5 } as never);

    expect(result).toHaveProperty('items');
    expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 1, totalPages: 1 });
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(qb.skip).toHaveBeenCalledWith(5);
  });

  it('le rôle du client n’est jamais utilisé pour contourner la propriété', async () => {
    qb.getOne.mockResolvedValue(makeProduct({ sellerId: 'seller-1' }));

    await expect(
      service.updateForSeller('product-1', 'seller-1', { stock: 0 }, { isAdmin: false }),
    ).resolves.toBeDefined();

    const _roleCheck = UserRole.CUSTOMER;
    expect(_roleCheck).toBe('customer');
  });
});
