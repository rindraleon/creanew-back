import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { SellerApprovedGuard } from './seller-approved.guard';
import { UserRole, SellerStatus } from '../enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { APPROVED_SELLER_KEY } from '../decorators/approved-seller.decorator';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../errors/error-codes';

const contextWith = (user: unknown): ExecutionContext => {
  const request = { user };
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
};

const reflectorWith = (metadata: Record<string, unknown>): Reflector =>
  ({
    getAllAndOverride: (key: string) => metadata[key],
  }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('laisse passer une route publique', () => {
    const guard = new RolesGuard(reflectorWith({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('laisse passer si aucun rôle n’est requis', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(guard.canActivate(contextWith({ role: UserRole.CUSTOMER }))).toBe(true);
  });

  it('refuse un client sur une route admin', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.ADMIN] }));
    expect(guard.canActivate(contextWith({ role: UserRole.CUSTOMER }))).toBe(false);
  });

  it('autorise un admin sur une route admin', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.ADMIN] }));
    expect(guard.canActivate(contextWith({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('refuse un vendeur sur une route client', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.CUSTOMER] }));
    expect(guard.canActivate(contextWith({ role: UserRole.SELLER }))).toBe(false);
  });

  it('refuse un utilisateur non authentifié', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.ADMIN] }));
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });
});

describe('SellerApprovedGuard', () => {
  const newGuard = (seller: unknown): SellerApprovedGuard => {
    const dataSource = {
      getRepository: () => ({ findOne: jest.fn().mockResolvedValue(seller) }),
    };
    return new SellerApprovedGuard(
      reflectorWith({ [APPROVED_SELLER_KEY]: true }),
      dataSource as unknown as DataSource,
    );
  };

  it('laisse passer si aucune approbation requise', async () => {
    const dataSource = { getRepository: jest.fn() };
    const guard = new SellerApprovedGuard(reflectorWith({}), dataSource as unknown as DataSource);
    await expect(guard.canActivate(contextWith({ role: UserRole.CUSTOMER }))).resolves.toBe(true);
  });

  it('un vendeur APPROVED est autorisé et injecté dans la requête', async () => {
    const seller = { id: 'seller-1', status: SellerStatus.APPROVED };
    const request = { user: { id: 'user-1', role: UserRole.SELLER } };
    const context = {
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const guard = newGuard(seller);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('seller', seller);
  });

  it('un vendeur PENDING est bloqué (403 SELLER_NOT_APPROVED)', async () => {
    const guard = newGuard({ id: 'seller-1', status: SellerStatus.PENDING });
    const context = contextWith({ id: 'user-1', role: UserRole.SELLER });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.SELLER_NOT_APPROVED,
    });
  });

  it('un vendeur SUSPENDED est bloqué', async () => {
    const guard = newGuard({ id: 'seller-1', status: SellerStatus.SUSPENDED });
    const context = contextWith({ id: 'user-1', role: UserRole.SELLER });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.SELLER_NOT_APPROVED,
    });
  });

  it('un vendeur REJECTED est bloqué', async () => {
    const guard = newGuard({ id: 'seller-1', status: SellerStatus.REJECTED });
    const context = contextWith({ id: 'user-1', role: UserRole.SELLER });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.SELLER_NOT_APPROVED,
    });
  });

  it('un client sans boutique est bloqué (403 NOT_SELLER)', async () => {
    const guard = newGuard(null);
    const context = contextWith({ id: 'user-1', role: UserRole.CUSTOMER });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.NOT_SELLER,
    });
  });

  it('l’admin n’a pas besoin de boutique approuvée', async () => {
    const guard = newGuard(null);
    const context = contextWith({ id: 'admin-1', role: UserRole.ADMIN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('le statut est relu en base (JWT périmé ne suffit pas)', async () => {
    // Le JWT annonce "seller" mais la base dit PENDING → refus.
    const guard = newGuard({ id: 'seller-1', status: SellerStatus.PENDING });
    const context = contextWith({
      id: 'user-1',
      role: UserRole.SELLER,
      sellerStatus: SellerStatus.APPROVED,
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.SELLER_NOT_APPROVED,
    });
  });
});
