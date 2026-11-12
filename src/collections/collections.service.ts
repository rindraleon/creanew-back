import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Collection } from './entities/collection.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { uniqueSlug } from '../common/utils/slug.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../common/enums';
import type { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);
  constructor(
    @InjectRepository(Collection)
    private readonly collections: Repository<Collection>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async findAll(includeUnpublished = false): Promise<Collection[]> {
    return this.collections.find({
      where: includeUnpublished ? {} : { isPublished: true },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async findPublishedBySlug(slug: string): Promise<Collection | null> {
    return this.collections.findOne({ where: { slug, isPublished: true } });
  }

  async findBySlug(slug: string): Promise<Collection> {
    const col = await this.findPublishedBySlug(slug);
    if (!col) throw BusinessException.notFound('Collection introuvable.', ErrorCode.NOT_FOUND);
    return col;
  }

  async findById(id: string): Promise<Collection> {
    const col = await this.collections.findOne({ where: { id } });
    if (!col) throw BusinessException.notFound('Collection introuvable.', ErrorCode.NOT_FOUND);
    return col;
  }

  async create(dto: CreateCollectionDto, request?: AuthenticatedRequest): Promise<Collection> {
    const base = dto.normalizedSlug();
    const slug = await uniqueSlug(base, async (candidate) => {
      const found = await this.collections.findOne({ where: { slug: candidate } });
      return Boolean(found);
    });

    const col = this.collections.create({
      name: dto.name.trim(),
      slug,
      tagline: dto.tagline ?? null,
      description: dto.description ?? null,
      coverImageUrl: dto.coverImageUrl ?? null,
      coverObjectKey: dto.coverObjectKey ?? null,
      productIds: dto.productIds ?? [],
      position: dto.position ?? 0,
      isPublished: dto.isPublished ?? true,
    });
    const saved = await this.collections.save(col);
    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_CREATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { entity: 'collection', name: saved.name },
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdateCollectionDto,
    request?: AuthenticatedRequest,
  ): Promise<Collection> {
    const col = await this.findById(id);
    if (dto.name !== undefined) col.name = dto.name.trim();
    if (dto.tagline !== undefined) col.tagline = dto.tagline;
    if (dto.description !== undefined) col.description = dto.description;
    if (dto.coverImageUrl !== undefined) col.coverImageUrl = dto.coverImageUrl;
    if (dto.coverObjectKey !== undefined) col.coverObjectKey = dto.coverObjectKey;
    if (dto.productIds !== undefined) col.productIds = dto.productIds;
    if (dto.position !== undefined) col.position = dto.position;
    if (dto.isPublished !== undefined) col.isPublished = dto.isPublished;
    if (dto.slug !== undefined) {
      const slug = await uniqueSlug(dto.slug, async (candidate) => {
        const found = await this.collections
          .createQueryBuilder('c')
          .where('c.slug = :slug', { slug: candidate })
          .andWhere('c.id != :id', { id })
          .getOne();
        return Boolean(found);
      });
      col.slug = slug;
    }
    const saved = await this.collections.save(col);
    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_UPDATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { entity: 'collection', fields: Object.keys(dto) },
    });
    return saved;
  }

  async remove(id: string, request?: AuthenticatedRequest): Promise<void> {
    await this.findById(id);
    await this.collections.softDelete(id);
    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_DELETED,
      entity: AuditEntity.CATEGORY,
      entityId: id,
      request,
      metadata: { entity: 'collection' },
    });
  }

  async setPublish(
    id: string,
    isPublished: boolean,
    _request?: AuthenticatedRequest,
  ): Promise<Collection> {
    const col = await this.findById(id);
    col.isPublished = isPublished;
    const saved = await this.collections.save(col);
    return saved;
  }
}
