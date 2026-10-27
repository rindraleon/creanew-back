import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { SellerStatus, UserRole } from '../enums';
import { APPROVED_SELLER_KEY } from '../decorators/approved-seller.decorator';
import { BusinessException } from '../errors/business.exception';
import { ErrorCode } from '../errors/error-codes';
import { Seller } from '../../sellers/entities/seller.entity';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class SellerApprovedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(APPROVED_SELLER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return false;

    // L'admin opère pour la plateforme : il n'a pas besoin de boutique approuvée.
    if (user.role === UserRole.ADMIN) return true;

    if (user.role !== UserRole.SELLER) {
      throw BusinessException.forbidden(
        "Vous n'êtes pas enregistré comme vendeur.",
        ErrorCode.NOT_SELLER,
      );
    }

    const seller = await this.dataSource.getRepository(Seller).findOne({
      where: { userId: user.id },
    });

    if (!seller) {
      throw BusinessException.forbidden(
        'Aucune boutique vendeur associée à ce compte.',
        ErrorCode.NOT_SELLER,
      );
    }

    if (seller.status !== SellerStatus.APPROVED) {
      throw BusinessException.forbidden(
        seller.status === SellerStatus.PENDING
          ? 'Votre demande vendeur est en cours de validation par un administrateur.'
          : seller.status === SellerStatus.REJECTED
            ? 'Votre demande vendeur a été refusée.'
            : 'Votre boutique est suspendue.',
        ErrorCode.SELLER_NOT_APPROVED,
      );
    }

    // Le vendeur est injecté dans la requête : les services n'acceptent
    // jamais un sellerId provenant du frontend.
    request.seller = seller;
    return true;
  }
}
