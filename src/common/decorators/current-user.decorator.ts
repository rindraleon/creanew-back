import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { SellerStatus, UserRole } from '../enums';

/** Utilisateur injecté par la stratégie JWT (rôle et statut validés à la lecture du jeton). */
export interface JwtUser {
  id: string;
  email: string;
  role: UserRole;
  sellerStatus?: SellerStatus | null;
  sellerId?: string | null;
}

type RequestWithUser = Request & { user?: JwtUser };

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
