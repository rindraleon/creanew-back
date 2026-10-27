import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Request } from 'express';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction, AuditEntity } from '../common/enums';
export interface AuditQuery {
  page?: number;
  limit?: number;
  order?: 'ASC' | 'DESC';
  action?: AuditAction | AuditAction[];
  entity?: AuditEntity;
  userId?: string;
  entityId?: string;
  from?: string;
  to?: string;
}
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';

export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  userId?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      const log = this.repo.create({
        action: entry.action,
        entity: entry.entity,
        userId: entry.userId ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
        ipAddress: entry.request?.ip ?? null,
        userAgent: entry.request?.headers?.['user-agent']?.slice(0, 400) ?? null,
      });
      await this.repo.save(log);
    } catch (error) {
      this.logger.error(
        `Écriture du journal d'audit impossible : ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async findAll(query: AuditQuery): Promise<Paginated<AuditLog>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const where: FindOptionsWhere<AuditLog> = {};
    if (query.action) {
      where.action = Array.isArray(query.action) ? In(query.action) : query.action;
    }
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;
    if (query.entityId) where.entityId = query.entityId;

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : new Date('1970-01-01');
      const to = query.to ? new Date(query.to) : new Date();
      where.createdAt = Between(from, to);
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: query.order ?? 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, meta: buildMeta(total, page, limit) };
  }
}
