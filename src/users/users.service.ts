import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { Request } from 'express';
import { User } from './entities/user.entity';
import { Address } from './entities/address.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity, UserRole } from '../common/enums';
import type { AddressDto, UpdateProfileDto } from './dto/user.dto';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Wishlist } from '../wishlist/entities/wishlist.entity';
import { Cart } from '../cart/entities/cart.entity';
import { assertValidEmail, normalizeEmail } from '../common/validators/email-disposable.validator';

export interface RegisterUserInput {
  username: string;
  email: string;
  password: string;
  firstName?: string | null;
  lastName: string;
  phone?: string | null;
  role?: User['role'];
  provider?: string | null;
  providerId?: string | null;
  avatarUrl?: string | null;
  /** Réservé au backend OAuth après validation cryptographique du fournisseur. */
  isEmailVerified?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Address)
    private readonly addresses: Repository<Address>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw BusinessException.notFound('Utilisateur introuvable.', ErrorCode.NOT_FOUND);
    return user;
  }

  async findByEmail(email: string, withPassword = false): Promise<User | null> {
    return this.users.findOne({
      where: { email: normalizeEmail(email) },
      ...(withPassword
        ? {
            select: {
              id: true,
              email: true,
              username: true,
              passwordHash: true,
              role: true,
              isActive: true,
              isEmailVerified: true,
              sessionVersion: true,
              phone: true,
              avatarUrl: true,
              firstName: true,
              lastName: true,
              provider: true,
            },
          }
        : {}),
    });
  }

  async findByUsername(username: string, withPassword = false): Promise<User | null> {
    return this.users.findOne({
      where: { username: username.trim().toLowerCase() },
      ...(withPassword
        ? {
            select: {
              id: true,
              email: true,
              username: true,
              passwordHash: true,
              role: true,
              isActive: true,
              isEmailVerified: true,
              sessionVersion: true,
              phone: true,
              avatarUrl: true,
              firstName: true,
              lastName: true,
              provider: true,
            },
          }
        : {}),
    });
  }

  async findByUsernameOrEmail(identifier: string, withPassword = false): Promise<User | null> {
    const id = identifier.trim().toLowerCase();
    if (id.includes('@')) return this.findByEmail(id, withPassword);
    return this.findByUsername(id, withPassword);
  }

  async create(input: RegisterUserInput): Promise<User> {
    const email = assertValidEmail(input.email);
    const username = input.username.trim().toLowerCase();

    const existingEmail = await this.findByEmail(email);
    if (existingEmail)
      throw BusinessException.conflict('Cet email est déjà utilisé.', ErrorCode.EMAIL_ALREADY_USED);

    const existingUsername = await this.findByUsername(username);
    if (existingUsername)
      throw BusinessException.conflict(
        'Ce nom d’utilisateur est déjà pris.',
        ErrorCode.USERNAME_ALREADY_USED,
      );

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = this.users.create({
      username,
      email,
      passwordHash,
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName.trim(),
      phone: input.phone ?? null,
      role: input.role ?? UserRole.CUSTOMER,
      provider: input.provider ?? null,
      providerId: input.providerId ?? null,
      avatarUrl: input.avatarUrl ?? null,
      isEmailVerified: input.isEmailVerified === true,
    });

    const saved = await this.users.save(user);

    await this.dataSource
      .getRepository(Cart)
      .save(this.dataSource.getRepository(Cart).create({ userId: saved.id }));
    await this.dataSource
      .getRepository(Wishlist)
      .save(this.dataSource.getRepository(Wishlist).create({ userId: saved.id }));

    await this.audit.log({
      userId: saved.id,
      action: AuditAction.USER_REGISTERED,
      entity: AuditEntity.USER,
      entityId: saved.id,
      metadata: { role: saved.role },
    });

    return saved;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, request?: Request): Promise<User> {
    const user = await this.findById(userId);

    if (dto.username && dto.username.trim().toLowerCase() !== user.username) {
      const u = dto.username.trim().toLowerCase();
      const taken = await this.findByUsername(u);
      if (taken)
        throw BusinessException.conflict(
          'Ce nom d’utilisateur est déjà pris.',
          ErrorCode.USERNAME_ALREADY_USED,
        );
      user.username = u;
    }
    const normalizedEmail = dto.email !== undefined ? assertValidEmail(dto.email) : undefined;
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== user.email;
    if (emailChanged && normalizedEmail) {
      const email = normalizedEmail;
      const taken = await this.findByEmail(email);
      if (taken)
        throw BusinessException.conflict(
          'Cet email est déjà utilisé par un autre compte.',
          ErrorCode.EMAIL_ALREADY_USED,
        );
      user.email = email;
      user.isEmailVerified = false;
      user.sessionVersion += 1;
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName?.trim() || null;
    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    const saved = await this.users.save(user);
    if (emailChanged) {
      await this.dataSource
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('"user_id" = :userId', { userId })
        .andWhere('"revoked_at" IS NULL')
        .execute();
    }
    await this.audit.log({
      userId,
      action: AuditAction.PROFILE_UPDATED,
      entity: AuditEntity.USER,
      entityId: userId,
      request,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    request?: Request,
  ): Promise<void> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, passwordHash: true, sessionVersion: true },
    });
    if (!user) throw BusinessException.notFound('Utilisateur introuvable.', ErrorCode.NOT_FOUND);

    const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!valid)
      throw BusinessException.badRequest(
        'Mot de passe actuel incorrect.',
        ErrorCode.INVALID_CREDENTIALS,
      );

    user.passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.sessionVersion += 1;
    await this.users.save(user);

    await this.dataSource
      .getRepository(RefreshToken)
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('"user_id" = :userId', { userId })
      .andWhere('"revoked_at" IS NULL')
      .execute();

    await this.audit.log({
      userId,
      action: AuditAction.PASSWORD_CHANGED,
      entity: AuditEntity.USER,
      entityId: userId,
      request,
    });
  }

  /* ------------------------------ Adresses ------------------------------ */

  async listAddresses(userId: string): Promise<Address[]> {
    return this.addresses.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async createAddress(userId: string, dto: AddressDto): Promise<Address> {
    const count = await this.addresses.count({ where: { userId } });
    const address = this.addresses.create({
      userId,
      label: dto.label ?? null,
      fullName: dto.fullName,
      phone: dto.phone,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2 ?? null,
      postalCode: dto.postalCode ?? null,
      city: dto.city,
      country: dto.country ?? 'Madagascar',
      isDefault: dto.isDefault ?? count === 0,
    });
    if (address.isDefault) await this.clearDefault(userId);
    return this.addresses.save(address);
  }

  async updateAddress(userId: string, addressId: string, dto: AddressDto): Promise<Address> {
    const address = await this.addresses.findOne({ where: { id: addressId } });
    if (!address || address.userId !== userId)
      throw BusinessException.notFound('Adresse introuvable.', ErrorCode.NOT_FOUND);
    Object.assign(address, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1 } : {}),
      ...(dto.addressLine2 !== undefined ? { addressLine2: dto.addressLine2 } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
    });
    if (address.isDefault) await this.clearDefault(userId, addressId);
    return this.addresses.save(address);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.addresses.findOne({ where: { id: addressId } });
    if (!address || address.userId !== userId)
      throw BusinessException.notFound('Adresse introuvable.', ErrorCode.NOT_FOUND);
    await this.addresses.remove(address);
    if (address.isDefault) {
      const next = await this.addresses.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
      if (next) {
        next.isDefault = true;
        await this.addresses.save(next);
      }
    }
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.addresses.findOne({ where: { id: addressId } });
    if (!address || address.userId !== userId)
      throw BusinessException.notFound('Adresse introuvable.', ErrorCode.NOT_FOUND);
    await this.clearDefault(userId);
    address.isDefault = true;
    await this.addresses.save(address);
  }

  async listUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    inactiveOnly?: boolean;
  }): Promise<{ items: User[]; total: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.users.createQueryBuilder('u');
    if (query.search)
      qb.andWhere(
        '(u.email ILIKE :search OR u.username ILIKE :search OR u."first_name" ILIKE :search OR u."last_name" ILIKE :search)',
        { search: `%${query.search}%` },
      );
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.inactiveOnly) qb.andWhere('u."is_active" = false');
    const [items, total] = await qb
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total };
  }

  async setRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    user.role = role;
    return this.users.save(user);
  }

  async setActive(userId: string, isActive: boolean): Promise<User> {
    const user = await this.findById(userId);
    user.isActive = isActive;
    return this.users.save(user);
  }

  private async clearDefault(userId: string, exceptId?: string): Promise<void> {
    const qb = this.addresses
      .createQueryBuilder()
      .update()
      .set({ isDefault: false })
      .where('"user_id" = :userId', { userId });
    if (exceptId) qb.andWhere('"id" != :exceptId', { exceptId });
    await qb.execute();
  }
}
