import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';
import { Seller } from './entities/seller.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity, SellerStatus, UserRole } from '../common/enums';
import { uniqueSlug } from '../common/utils/slug.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import type { ApplySellerDto, SellerQueryDto, UpdateSellerDto } from './dto/seller.dto';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';

@Injectable()
export class SellersService {
  private readonly logger = new Logger(SellersService.name);

  constructor(
    @InjectRepository(Seller)
    private readonly sellers: Repository<Seller>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /* -------------------------------- Candidature ------------------------------ */

  async apply(userId: string, dto: ApplySellerDto, request?: Request): Promise<Seller> {
    const existing = await this.sellers.findOne({ where: { userId } });

    if (existing && [SellerStatus.PENDING, SellerStatus.APPROVED].includes(existing.status)) {
      throw BusinessException.conflict(
        existing.status === SellerStatus.APPROVED
          ? 'Vous êtes déjà vendeur approuvé.'
          : 'Une demande est déjà en cours de validation.',
        existing.status === SellerStatus.APPROVED
          ? ErrorCode.SELLER_ALREADY_EXISTS
          : ErrorCode.SELLER_APPLICATION_PENDING,
      );
    }

    const user = await this.usersService.findById(userId);
    const slug = await uniqueSlug(dto.shopName, async (candidate) =>
      Boolean(await this.sellers.findOne({ where: { slug: candidate } })),
    );

    const seller = existing ?? this.sellers.create({ userId });

    seller.shopName = dto.shopName.trim();
    seller.slug = slug;
    seller.description = dto.description ?? seller.description ?? null;
    seller.phone = dto.phone ?? seller.phone ?? null;
    seller.city = dto.city ?? seller.city ?? null;
    seller.addressLine = dto.addressLine ?? seller.addressLine ?? null;
    seller.documentKeys = dto.documentKeys ?? seller.documentKeys ?? [];
    seller.status = SellerStatus.PENDING;
    seller.submittedAt = new Date();
    seller.rejectionReason = null;
    seller.reviewedAt = null;
    seller.reviewedById = null;

    // Le compte doit pouvoir accéder à l'espace vendeur (mais rester bloqué
    // tant qu'il n'est pas approuvé : voir SellerApprovedGuard).
    if (user.role === UserRole.CUSTOMER) {
      await this.dataSource
        .createQueryBuilder()
        .update('users')
        .set({ role: UserRole.SELLER })
        .where('id = :id', { id: userId })
        .execute();
    }

    const saved = await this.sellers.save(seller);

    await this.audit.log({
      userId,
      action: AuditAction.SELLER_REGISTERED,
      entity: AuditEntity.SELLER,
      entityId: saved.id,
      request,
      metadata: { shopName: saved.shopName },
    });

    // Notification au demandeur + aux administrateurs.
    await this.notifications.notifySellerPending(userId, user.email, user.firstName);
    const admins = await this.notifications.adminIds();
    await this.notifications.notifySellerApplicationReceived(admins, saved.shopName, user.email);

    return saved;
  }

  async findMine(userId: string): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { userId } });
    if (!seller) {
      throw BusinessException.notFound(
        'Aucune boutique vendeur associée à ce compte.',
        ErrorCode.NOT_SELLER,
      );
    }
    return seller;
  }

  async myApplication(userId: string): Promise<Seller | null> {
    return this.sellers.findOne({ where: { userId } });
  }

  async updateMine(userId: string, dto: UpdateSellerDto, request?: Request): Promise<Seller> {
    const seller = await this.findMine(userId);
    if (dto.shopName !== undefined) seller.shopName = dto.shopName.trim();
    if (dto.description !== undefined) seller.description = dto.description;
    if (dto.phone !== undefined) seller.phone = dto.phone;
    if (dto.city !== undefined) seller.city = dto.city;
    if (dto.addressLine !== undefined) seller.addressLine = dto.addressLine;

    const saved = await this.sellers.save(seller);
    await this.audit.log({
      userId,
      action: AuditAction.SELLER_UPDATED,
      entity: AuditEntity.SELLER,
      entityId: saved.id,
      request,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  /* ------------------------------- Administration ---------------------------- */

  async findAll(query: SellerQueryDto): Promise<Paginated<Seller>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb: SelectQueryBuilder<Seller> = this.sellers
      .createQueryBuilder('seller')
      .leftJoinAndSelect('seller.user', 'user');

    if (query.status) qb.andWhere('seller.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(seller."shop_name" ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.userId) qb.andWhere('seller."user_id" = :userId', { userId: query.userId });
    if (query.withDeleted) qb.withDeleted();

    const [items, total] = await qb
      .orderBy('seller.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: buildMeta(total, page, limit) };
  }

  async findById(id: string): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id }, relations: { user: true } });
    if (!seller) {
      throw BusinessException.notFound('Vendeur introuvable.', ErrorCode.NOT_FOUND);
    }
    return seller;
  }

  async approve(id: string, adminId: string, request?: Request): Promise<Seller> {
    const seller = await this.findById(id);
    if (seller.status === SellerStatus.APPROVED) {
      return seller;
    }

    seller.status = SellerStatus.APPROVED;
    seller.reviewedAt = new Date();
    seller.reviewedById = adminId;
    seller.rejectionReason = null;
    const saved = await this.sellers.save(seller);

    await this.dataSource
      .createQueryBuilder()
      .update('users')
      .set({ role: UserRole.SELLER })
      .where('id = :id', { id: seller.userId })
      .execute();

    await this.audit.log({
      userId: adminId,
      action: AuditAction.SELLER_APPROVED,
      entity: AuditEntity.SELLER,
      entityId: saved.id,
      request,
    });

    const user = await this.usersService.findById(seller.userId);
    await this.notifications.notifySellerApproved(seller.userId, user.email, user.firstName);
    return saved;
  }

  async reject(id: string, adminId: string, reason: string, request?: Request): Promise<Seller> {
    const seller = await this.findById(id);
    seller.status = SellerStatus.REJECTED;
    seller.rejectionReason = reason;
    seller.reviewedAt = new Date();
    seller.reviewedById = adminId;
    const saved = await this.sellers.save(seller);

    await this.audit.log({
      userId: adminId,
      action: AuditAction.SELLER_REJECTED,
      entity: AuditEntity.SELLER,
      entityId: saved.id,
      request,
      metadata: { reason },
    });

    const user = await this.usersService.findById(seller.userId);
    await this.notifications.notifySellerRejected(
      seller.userId,
      user.email,
      user.firstName,
      reason,
    );
    return saved;
  }

  async suspend(id: string, adminId: string, reason: string, request?: Request): Promise<Seller> {
    const seller = await this.findById(id);
    seller.status = SellerStatus.SUSPENDED;
    seller.rejectionReason = reason;
    seller.reviewedAt = new Date();
    seller.reviewedById = adminId;
    const saved = await this.sellers.save(seller);

    await this.audit.log({
      userId: adminId,
      action: AuditAction.SELLER_SUSPENDED,
      entity: AuditEntity.SELLER,
      entityId: saved.id,
      request,
      metadata: { reason },
    });
    return saved;
  }

  async countByStatus(): Promise<Record<SellerStatus, number>> {
    const rows = await this.sellers
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.status')
      .getRawMany<{ status: SellerStatus; count: string }>();

    const result: Record<SellerStatus, number> = {
      [SellerStatus.PENDING]: 0,
      [SellerStatus.APPROVED]: 0,
      [SellerStatus.REJECTED]: 0,
      [SellerStatus.SUSPENDED]: 0,
    };
    for (const row of rows) result[row.status] = Number(row.count);
    return result;
  }
}
