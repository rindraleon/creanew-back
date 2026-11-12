import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Category } from './entities/category.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { uniqueSlug } from '../common/utils/slug.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../common/enums';
import { StorageService } from '../shared/storage/storage.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

export type CategoryWithCount = Category & {
  productCount: number;
  childCount: number;
  parentName: string | null;
};

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async findAll(
    options: { includeInactive?: boolean; search?: string; isActive?: boolean } = {},
  ): Promise<CategoryWithCount[]> {
    const qb = this.categories
      .createQueryBuilder('category')
      .leftJoin('category.parent', 'parent')
      .orderBy('COALESCE(parent.position, category.position)', 'ASC')
      .addOrderBy('category.parentId', 'ASC', 'NULLS FIRST')
      .addOrderBy('category.position', 'ASC')
      .addOrderBy('category.name', 'ASC');

    if (options.isActive !== undefined) {
      qb.andWhere('category.isActive = :isActive', { isActive: options.isActive });
    } else if (!options.includeInactive) {
      qb.andWhere('category.isActive = true');
    }

    if (!options.includeInactive) {
      qb.andWhere('(category.parent_id IS NULL OR parent.is_active = true)');
    }

    if (options.search) {
      qb.andWhere('(category.name ILIKE :search OR category.description ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [items, counts, children] = await Promise.all([
      qb.getMany(),
      this.countProducts(),
      this.countChildren(),
    ]);
    const parentNames = await this.parentNames(items);
    return items.map((category) =>
      this.decorate(category, counts, children, parentNames.get(category.parentId ?? '') ?? null),
    );
  }

  async findBySlug(slug: string, includeInactive = false): Promise<CategoryWithCount> {
    const category = await this.categories.findOne({ where: { slug } });
    if (!category || (!includeInactive && !category.isActive)) {
      throw BusinessException.notFound('Catégorie introuvable.', ErrorCode.CATEGORY_NOT_FOUND);
    }

    let parentName: string | null = null;
    if (category.parentId) {
      const parent = await this.categories.findOne({ where: { id: category.parentId } });
      if (!parent || (!includeInactive && !parent.isActive)) {
        throw BusinessException.notFound('Catégorie introuvable.', ErrorCode.CATEGORY_NOT_FOUND);
      }
      parentName = parent.name;
    }

    const [counts, children] = await Promise.all([this.countProducts(), this.countChildren()]);
    return this.decorate(category, counts, children, parentName);
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw BusinessException.notFound('Catégorie introuvable.', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return category;
  }

  async create(dto: CreateCategoryDto, request?: AuthenticatedRequest): Promise<CategoryWithCount> {
    const base = dto.normalizedSlug();
    const slug = await uniqueSlug(base, async (candidate) => {
      const found = await this.categories.findOne({ where: { slug: candidate } });
      return Boolean(found);
    });

    const image = await this.resolveImage(dto.imageObjectKey);
    const parentId = await this.assertValidParent(dto.parentId ?? null);

    const category = this.categories.create({
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
      imageObjectKey: image.objectKey,
      imageUrl: image.url,
      position: dto.position ?? 0,
      isActive: dto.isActive ?? true,
      parentId,
    });

    const saved = await this.categories.save(category);
    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_CREATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { name: saved.name },
    });
    return Object.assign(saved, { productCount: 0, childCount: 0, parentName: null });
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    request?: AuthenticatedRequest,
  ): Promise<CategoryWithCount> {
    const category = await this.findById(id);
    const previousImage = category.imageObjectKey;

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.position !== undefined) category.position = dto.position;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.slug !== undefined) {
      category.slug = await uniqueSlug(dto.slug, async (candidate) => {
        const found = await this.categories
          .createQueryBuilder('c')
          .where('c.slug = :slug', { slug: candidate })
          .andWhere('c.id != :id', { id })
          .getOne();
        return Boolean(found);
      });
    }
    if (dto.imageObjectKey !== undefined) {
      const image = await this.resolveImage(dto.imageObjectKey || undefined);
      category.imageObjectKey = image.objectKey;
      category.imageUrl = image.url;
    }
    if (dto.parentId !== undefined) {
      category.parentId = await this.assertValidParent(dto.parentId, id);
    }

    const saved = await this.categories.save(category);

    if (previousImage && previousImage !== saved.imageObjectKey) {
      await this.storage.deleteByKey(previousImage);
    }

    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_UPDATED,
      entity: AuditEntity.CATEGORY,
      entityId: saved.id,
      request,
      metadata: { fields: Object.keys(dto) },
    });

    const [counts, children] = await Promise.all([this.countProducts(), this.countChildren()]);
    const parentNames = await this.parentNames([saved]);
    return this.decorate(saved, counts, children, parentNames.get(saved.parentId ?? '') ?? null);
  }

  async remove(id: string, request?: AuthenticatedRequest): Promise<void> {
    const category = await this.findById(id);
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

    const childrenCount = await this.dataSource
      .getRepository(Category)
      .createQueryBuilder('c')
      .where('c."parent_id" = :id', { id })
      .getCount();

    if (childrenCount > 0) {
      throw BusinessException.conflict(
        `Cette catégorie contient ${childrenCount} sous-catégorie(s). Rattachez-les à un autre parent avant de la supprimer.`,
        ErrorCode.CATEGORY_HAS_CHILDREN,
      );
    }

    await this.categories.softDelete(id);
    if (category.imageObjectKey) {
      await this.storage.deleteByKey(category.imageObjectKey);
    }
    await this.audit.log({
      userId: request?.user?.id ?? null,
      action: AuditAction.CATEGORY_DELETED,
      entity: AuditEntity.CATEGORY,
      entityId: id,
      request,
    });
  }

  async countByCategory(): Promise<Map<string, number>> {
    return this.countProducts();
  }

  private async countChildren(): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('c."parent_id"', 'parentId')
      .addSelect('COUNT(*)', 'count')
      .from('categories', 'c')
      .where('c."parent_id" IS NOT NULL')
      .andWhere('c."deleted_at" IS NULL')
      .groupBy('c."parent_id"')
      .getRawMany<{ parentId: string; count: string }>();

    return new Map(rows.map((row) => [row.parentId, Number(row.count)]));
  }

  private async parentNames(categories: Category[]): Promise<Map<string, string>> {
    const ids = [...new Set(categories.map((category) => category.parentId).filter(Boolean))];
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.categories.find({
      where: { id: In(ids as string[]) },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private decorate(
    category: Category,
    counts: Map<string, number>,
    children: Map<string, number>,
    parentName: string | null,
  ): CategoryWithCount {
    return Object.assign(category, {
      productCount: counts.get(category.id) ?? 0,
      childCount: children.get(category.id) ?? 0,
      parentName,
    });
  }

  private async assertValidParent(
    parentId: string | null,
    selfId?: string,
  ): Promise<string | null> {
    if (!parentId) {
      return null;
    }
    if (selfId && parentId === selfId) {
      throw BusinessException.badRequest(
        'Une catégorie ne peut pas être son propre parent.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
    const parent = await this.categories.findOne({ where: { id: parentId } });
    if (!parent) {
      throw BusinessException.badRequest(
        'La catégorie parente est introuvable.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
    if (parent.parentId) {
      throw BusinessException.badRequest(
        'La hiérarchie est limitée à deux niveaux : choisissez une catégorie racine comme parent.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
    if (selfId) {
      const childOfSelf = await this.categories.findOne({ where: { id: selfId, parentId } });
      if (childOfSelf) {
        throw BusinessException.badRequest(
          'Ce rattachement créerait une boucle dans la hiérarchie.',
          ErrorCode.VALIDATION_ERROR,
        );
      }
    }
    return parent.id;
  }

  private async countProducts(): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('p."category_id"', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .from('products', 'p')
      .where('p."deleted_at" IS NULL')
      .groupBy('p."category_id"')
      .getRawMany<{ categoryId: string; count: string }>();

    return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
  }

  private async resolveImage(
    objectKey: string | undefined,
  ): Promise<{ objectKey: string | null; url: string | null }> {
    if (!objectKey || !objectKey.trim()) {
      return { objectKey: null, url: null };
    }
    const key = objectKey.trim();
    const prefix = key.split('/')[0];
    const prefixes = this.storage.getStatus().prefixes as string[];
    if (!prefixes.includes(prefix)) {
      throw BusinessException.badRequest(
        `Cette image doit provenir de l’un des espaces de stockage : ${prefixes.join(', ')}.`,
        ErrorCode.VALIDATION_ERROR,
      );
    }
    return { objectKey: key, url: this.storage.urlForKey(key) };
  }
}
