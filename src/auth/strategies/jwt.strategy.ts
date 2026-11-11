import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { UsersService } from '../../users/users.service';
import { Seller } from '../../sellers/entities/seller.entity';
import { validateEmail } from '../../common/validators/email-disposable.validator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => (request?.cookies?.['creanew_at'] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'dev-access-secret',
    });
  }

  async validate(payload: { sub: string; sessionVersion?: number }): Promise<JwtUser> {
    let user;
    try {
      user = await this.users.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Session invalide.');
    }
    // Chaque requête vérifie l'état courant; un ancien JWT ne conserve pas un rôle révoqué,
    // un compte désactivé, un e-mail interdit ou une session explicitement invalidée.
    if (
      !user.isActive ||
      !validateEmail(user.email).valid ||
      !Number.isInteger(payload.sessionVersion) ||
      payload.sessionVersion !== user.sessionVersion
    ) {
      throw new UnauthorizedException('Session invalide.');
    }
    const seller =
      user.role === UserRole.SELLER
        ? await this.dataSource
            .getRepository(Seller)
            .findOne({ where: { userId: user.id }, select: { id: true, status: true } })
        : null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      sellerStatus: seller?.status ?? null,
      sellerId: seller?.id ?? null,
    };
  }
}
