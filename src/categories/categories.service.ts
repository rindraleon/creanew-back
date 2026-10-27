import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Request } from 'express';
import { Category } from './entities/category.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { uniqueSlug } from '../common/utils/slug.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../common/enums';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Liste publique : uniquement les catégories actives. */
  async findAll(includeInactive = false): Promise<Category[]> {
    return this.categories.find({
      where: includeInactive ? {} : { isActive: true },
      order: { position: 'ASC', name: 'ASC' },
    });
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { slug } });
    if (!category) {
      throw BusinessException.notFound('Catégorie introuvable.', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return category;
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw BusinessException.notFound('Catégorie introuvable.', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return category;
  }

  async create(dto: CreateCategoryDto, request?: Request): Promise<Category> {
    const base = dto.normalizedSlug();
    const slug = await uniqueSlug(base, async (candidate) => {
      const found = await this.categories.findOne({ where: { slug: candidate } });
      return Boolean(found);
    });

    const category = this.categories.create({
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      position: dto.position ?? 0,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.categories.save(category);
    await this.audit.log({
      userId: (request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.CATEGORY_CREATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { name: saved.name },
    });
    return saved;
  }

  async update(id: string, dto: UpdateCategoryDto, request?: Request): Promise<Category> {
    // `findById` garantit l'existence : on recharge la catégorie pour la muter.
    const category = await this.findById(id);

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.imageUrl !== undefined) category.imageUrl = dto.imageUrl;
    if (dto.position !== undefined) category.position = dto.position;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.slug !== undefined) {
      const slug = await uniqueSlug(dto.slug, async (candidate) => {
        const found = await this.categories
          .createQueryBuilder('c')
          .where('c.slug = :slug', { slug: candidate })
          .andWhere('c.id != :id', { id })
          .getOne();
        return Boolean(found);
      });
      category.slug = slug;
    }

    const saved = await this.categories.save(category);
    await this.audit.log({
      userId: (request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.CATEGORY_UPDATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  /** Soft delete : les commandes historiques restent cohérentes. */
  async remove(id: string, request?: Request): Promise<void> {
    // Lève une 404 si la catégorie n'existe pas.
    await this.findById(id);
    const productsCount = await this.dataSource
      .getRepository('products')
      .createQueryBuilder('p')
      .where('p."category_id" = :id', { id })
      .andWhere('p."deleted_at" IS NULL')
      .getCount();

    if (productsCount > 0) {
      throw BusinessException.conflict(
        `Cette catégorie contient ${productsCount} produit(s). Archivez-la plutôt que de la supprimer.`,
        ErrorCode.CATEGORY_IN_USE,
      );
    }

    await this.categories.softDelete(id);
    await this.audit.log({
      userId: (request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.CATEGORY_DELETED,
      entity: AuditEntity.CATEGORY,
      entityId: id,
      request,
    });
  }

  async countByCategory(): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('p."category_id"', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .from('products', 'p')
      .where('p."status" = \'published\'')
      .andWhere('p."deleted_at" IS NULL')
      .groupBy('p."category_id"')
      .getRawMany<{ categoryId: string; count: string }>();

    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
  }
}
