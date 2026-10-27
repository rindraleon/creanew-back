import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { SellerStatus, UserRole } from '../../common/enums';

const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && Object.values(UserRole).includes(value as UserRole);

const isSellerStatus = (value: unknown): value is SellerStatus =>
  typeof value === 'string' && Object.values(SellerStatus).includes(value as SellerStatus);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => (request?.cookies?.['mobilier_at'] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'dev-access-secret',
    });
  }

  // Sans async, l'exception serait synchrone : Passport répondrait 500 au lieu de 401.
  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    sellerStatus?: string | null;
    sellerId?: string | null;
  }): Promise<JwtUser> {
    // Le jeton est signé par nous : un rôle inconnu signale un jeton falsifié ou obsolète.
    if (!isUserRole(payload.role)) {
      throw new UnauthorizedException('Jeton d’authentification invalide.');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      sellerStatus: isSellerStatus(payload.sellerStatus) ? payload.sellerStatus : null,
      sellerId: payload.sellerId ?? null,
    };
  }
}
