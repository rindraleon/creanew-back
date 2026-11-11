import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity, UserRole } from '../common/enums';
import type { AuthResponseDto, AuthUserDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { MailService } from '../shared/mail/mail.service';
import { QueueService } from '../shared/queue/queue.service';
import { passwordResetTemplate } from '../shared/mail/templates';
import { assertValidEmail, validateEmail } from '../common/validators/email-disposable.validator';
import { RedisService } from '../shared/redis/redis.service';

const REFRESH_TOKEN_BYTES = 48;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
// Hash de temporisation sans compte associé, pour réduire les différences de réponse.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$7ZzIdiJARHRqmPrNBxuvxw$Sirmdy383oTz5GS+Z+zqvuduhCLOp+TVuGRzHSssTM0';

const LOGIN_MAX_ATTEMPTS_DEFAULT = 5;
const LOGIN_LOCK_TTL_SECONDS_DEFAULT = 15 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly loginFailures = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly queue: QueueService,
    private readonly redis: RedisService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
  ) {}

  /* ------------------------------- Inscription ------------------------------- */

  async register(dto: RegisterDto, _request?: Request): Promise<void> {
    assertValidEmail(dto.email);
    await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      // Le rôle ne provient jamais de la requête publique.
      role: UserRole.CUSTOMER,
    });
  }

  /* --------------------------------- Login ---------------------------------- */

  private loginFailureKey(email: string): string {
    const digest = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return `auth:login-fail:${digest}`;
  }

  private async readLoginFailures(key: string): Promise<number> {
    const stored = await this.redis.get<number>(key);
    if (stored !== null) return Number(stored) || 0;

    const memoire = this.loginFailures.get(key);
    if (!memoire) return 0;
    if (memoire.expiresAt < Date.now()) {
      this.loginFailures.delete(key);
      return 0;
    }
    return memoire.count;
  }

  private async writeLoginFailures(key: string, count: number, ttl: number): Promise<void> {
    const ecrit = await this.redis.set(key, count, ttl);
    if (!ecrit) {
      // Redis indisponible : on ne désactive pas la protection pour autant.
      this.loginFailures.set(key, { count, expiresAt: Date.now() + ttl * 1000 });
    }
  }

  private async clearLoginFailures(key: string): Promise<void> {
    await this.redis.del(key);
    this.loginFailures.delete(key);
  }

  async login(dto: LoginDto, request?: Request): Promise<AuthResponseDto> {
    const identifier = (dto.identifier ?? dto.email ?? '').trim().toLowerCase();
    if (!identifier) {
      throw BusinessException.unauthorized(
        'Identifiants invalides.',
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    // Identifiants inconnus ou interdits : même réponse et même politique de limitation.
    const allowedIdentifier = !identifier.includes('@') || validateEmail(identifier).valid;
    const user = allowedIdentifier
      ? await this.usersService.findByUsernameOrEmail(identifier, true)
      : null;
    const identifierKey = this.loginFailureKey(`identifier:${identifier}`);
    const accountKey = user ? this.loginFailureKey(`account:${user.id}`) : null;
    const maxAttempts =
      Number(process.env.LOGIN_MAX_ATTEMPTS ?? LOGIN_MAX_ATTEMPTS_DEFAULT) ||
      LOGIN_MAX_ATTEMPTS_DEFAULT;
    const lockTtl =
      Number(process.env.LOGIN_LOCK_TTL ?? LOGIN_LOCK_TTL_SECONDS_DEFAULT) ||
      LOGIN_LOCK_TTL_SECONDS_DEFAULT;
    const identifierFailures = await this.readLoginFailures(identifierKey);
    const accountFailures = accountKey ? await this.readLoginFailures(accountKey) : 0;
    if (identifierFailures >= maxAttempts || accountFailures >= maxAttempts) {
      throw BusinessException.tooManyRequests(
        `Trop de tentatives de connexion. Réessayez dans ${Math.ceil(lockTtl / 60)} minutes.`,
        ErrorCode.TOO_MANY_REQUESTS,
      );
    }
    const passwordValid = await argon2
      .verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, dto.password)
      .catch(() => false);
    if (!user || !passwordValid || !validateEmail(user.email).valid) {
      await this.writeLoginFailures(identifierKey, identifierFailures + 1, lockTtl);
      if (accountKey) await this.writeLoginFailures(accountKey, accountFailures + 1, lockTtl);
      await this.audit.log({
        ...(user ? { userId: user.id } : {}),
        action: AuditAction.USER_LOGIN_FAILED,
        entity: AuditEntity.AUTH,
        request,
        metadata: { reason: 'invalid_credentials' },
      });
      throw BusinessException.unauthorized(
        'Identifiants invalides.',
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    await this.clearLoginFailures(identifierKey);
    if (accountKey) await this.clearLoginFailures(accountKey);

    if (!user.isActive) {
      throw BusinessException.forbidden('Compte désactivé.', ErrorCode.ACCOUNT_DISABLED);
    }

    await this.dataSource.getRepository(User).update({ id: user.id }, { lastLoginAt: new Date() });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.USER_LOGIN,
      entity: AuditEntity.AUTH,
      entityId: user.id,
      request,
    });

    return this.issueTokens(user, request);
  }

  /* -------------------------------- Refresh --------------------------------- */

  async refresh(token: string, request?: Request): Promise<AuthResponseDto> {
    if (!token) {
      throw BusinessException.unauthorized(
        'Refresh token manquant.',
        ErrorCode.INVALID_REFRESH_TOKEN,
      );
    }

    const tokenHash = this.hashToken(token);
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (!stored) {
      throw BusinessException.unauthorized(
        'Refresh token invalide.',
        ErrorCode.INVALID_REFRESH_TOKEN,
      );
    }

    // Réutilisation détectée (vol probable) : on révoque toute la famille.
    if (stored.revokedAt) {
      await this.revokeFamily(stored.userId, tokenHash);
      await this.dataSource
        .getRepository(User)
        .increment({ id: stored.userId }, 'sessionVersion', 1);
      await this.audit.log({
        userId: stored.userId,
        action: AuditAction.USER_LOGOUT,
        entity: AuditEntity.AUTH,
        request,
        metadata: { reason: 'refresh_token_reuse' },
      });
      throw BusinessException.unauthorized(
        'Refresh token révoqué. Veuillez vous reconnecter.',
        ErrorCode.REFRESH_TOKEN_REUSED,
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw BusinessException.unauthorized(
        'Refresh token expiré.',
        ErrorCode.INVALID_REFRESH_TOKEN,
      );
    }

    const user = await this.usersService.findById(stored.userId);
    if (!user.isActive || !validateEmail(user.email).valid) {
      throw BusinessException.unauthorized('Session invalide.', ErrorCode.INVALID_REFRESH_TOKEN);
    }

    // Rotation : l'ancien jeton est révoqué et remplacé.
    stored.revokedAt = new Date();
    await this.refreshTokens.save(stored);

    const response = await this.issueTokens(user, request);
    const newHash = this.hashToken(response.refreshToken);
    const created = await this.refreshTokens.findOne({ where: { tokenHash: newHash } });
    if (created) {
      created.replacedById = created.id;
      stored.replacedById = created.id;
      await this.refreshTokens.save([stored, created]);
    }
    return response;
  }

  async logout(token: string | undefined, request?: Request): Promise<void> {
    if (!token) return;
    const tokenHash = this.hashToken(token);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await this.refreshTokens.save(stored);
      await this.dataSource
        .getRepository(User)
        .increment({ id: stored.userId }, 'sessionVersion', 1);
      await this.audit.log({
        userId: stored.userId,
        action: AuditAction.USER_LOGOUT,
        entity: AuditEntity.AUTH,
        entityId: stored.userId,
        request,
      });
    }
  }

  /* ---------------------------- Mot de passe oublié -------------------------- */

  async forgotPassword(email: string, request?: Request): Promise<void> {
    const normalized = assertValidEmail(email);
    const user = await this.usersService.findByEmail(normalized);
    // Réponse toujours identique : pas d'énumération de comptes.
    if (!user || !user.isActive || !validateEmail(user.email).valid) return;

    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.resetTokens.save(
      this.resetTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
      }),
    );

    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const mail = passwordResetTemplate(
      user.email,
      user.firstName ?? user.username,
      `${frontendUrl}/reinitialiser-mot-de-passe#token=${rawToken}`,
    );
    const queued = await this.queue.addEmail({
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });
    if (!queued) await this.mail.send({ to: mail.to, subject: mail.subject, html: mail.html });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      entity: AuditEntity.USER,
      entityId: user.id,
      request,
    });
  }

  async resetPassword(token: string, newPassword: string, request?: Request): Promise<void> {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw BusinessException.badRequest(
        'Jeton de réinitialisation invalide ou expiré.',
        ErrorCode.INVALID_RESET_TOKEN,
      );
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const userId = await this.dataSource.transaction(async (manager) => {
      const rows: Array<{ user_id: string }> = await manager.query(
        `WITH used AS (UPDATE "password_reset_tokens" SET "used_at" = now()
         WHERE "token_hash" = $1 AND "used_at" IS NULL AND "expires_at" > now()
         RETURNING "user_id") SELECT "user_id" FROM used`,
        [this.hashToken(token)],
      );
      if (rows.length !== 1) {
        throw BusinessException.badRequest(
          'Jeton de réinitialisation invalide ou expiré.',
          ErrorCode.INVALID_RESET_TOKEN,
        );
      }
      const repo = manager.getRepository(User);
      const user = await repo.findOne({
        where: { id: rows[0].user_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || !user.isActive || !validateEmail(user.email).valid) {
        throw BusinessException.badRequest(
          'Jeton de réinitialisation invalide ou expiré.',
          ErrorCode.INVALID_RESET_TOKEN,
        );
      }
      user.passwordHash = passwordHash;
      user.sessionVersion += 1;
      await repo.save(user);
      await manager.query(
        `UPDATE "password_reset_tokens" SET "used_at" = now() WHERE "user_id" = $1 AND "used_at" IS NULL`,
        [user.id],
      );
      await manager.query(
        `UPDATE "refresh_tokens" SET "revoked_at" = now() WHERE "user_id" = $1 AND "revoked_at" IS NULL`,
        [user.id],
      );
      return user.id;
    });
    await this.audit.log({
      userId,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      entity: AuditEntity.USER,
      entityId: userId,
      request,
    });
  }

  /* --------------------------------- Session -------------------------------- */

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.usersService.findById(userId);
    const seller = await this.dataSource.getRepository(Seller).findOne({
      where: { userId },
      select: { id: true, status: true },
    });
    return this.toAuthUser(user, seller?.status ?? null, seller?.id ?? null);
  }

  /* --------------------------------- Interne -------------------------------- */

  async issueOAuthTokens(user: User, request?: Request): Promise<AuthResponseDto> {
    return this.issueTokens(user, request);
  }

  private async issueTokens(user: User, request?: Request): Promise<AuthResponseDto> {
    if (!user.isActive || !validateEmail(user.email).valid) {
      throw BusinessException.unauthorized('Session invalide.', ErrorCode.UNAUTHORIZED);
    }
    const seller = await this.dataSource
      .getRepository(Seller)
      .findOne({ where: { userId: user.id }, select: { id: true, status: true } });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sellerStatus: seller?.status ?? null,
      sellerId: seller?.id ?? null,
      sessionVersion: user.sessionVersion ?? 0,
    };

    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: accessTtl,
    });

    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';
    const rawRefresh = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(rawRefresh),
        expiresAt: this.addTtl(new Date(), refreshTtl),
        userAgent: request?.headers?.['user-agent']?.slice(0, 400) ?? null,
        ipAddress: request?.ip ?? null,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefresh,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(accessTtl),
      user: this.toAuthUser(user, seller?.status ?? null, seller?.id ?? null),
    };
  }

  private async revokeFamily(userId: string, exceptHash?: string): Promise<void> {
    const qb = this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('"user_id" = :userId', { userId })
      .andWhere('"revoked_at" IS NULL');
    if (exceptHash) qb.andWhere('"token_hash" != :exceptHash', { exceptHash });
    await qb.execute();
  }

  async purgeExpiredTokens(): Promise<number> {
    const result = await this.refreshTokens.delete({ expiresAt: LessThan(new Date()) });
    return result.affected ?? 0;
  }

  private toAuthUser(
    user: User,
    sellerStatus: string | null,
    sellerId: string | null,
  ): AuthUserDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName,
      fullName: `${user.firstName ?? ''} ${user.lastName}`.trim() || user.username,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      provider: user.provider ?? null,
      role: user.role,
      sellerStatus,
      sellerId,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private addTtl(date: Date, ttl: string): Date {
    const seconds = this.ttlToSeconds(ttl);
    return new Date(date.getTime() + seconds * 1000);
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return value * factor;
  }

  /** Dépose le refresh token dans un cookie httpOnly (optionnel pour le frontend). */
  setRefreshCookie(response: Response, token: string): void {
    const secure = (this.config.get<string>('nodeEnv') ?? 'development') === 'production';
    response.cookie(this.config.get<string>('jwt.refreshCookieName') ?? 'creanew_rt', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      maxAge: this.ttlToSeconds(this.config.get<string>('jwt.refreshTtl') ?? '30d') * 1000,
      path: '/',
    });
  }

  clearRefreshCookie(response: Response): void {
    response.clearCookie(this.config.get<string>('jwt.refreshCookieName') ?? 'creanew_rt', {
      path: '/',
    });
  }
}
