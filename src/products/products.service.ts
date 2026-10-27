import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { uniqueSlug, generateSku } from '../common/utils/slug.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity, ProductStatus } from '../common/enums';
import { ProductSort, type CreateProductDto, type UpdateProductDto } from './dto/product.dto';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { buildMeta } from '../common/interfaces/paginated.interface';
import type { ProductQueryDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly categoriesService: CategoriesService,
    private readonly notifications: NotificationsService,
  ) {}

  /* --------------------------------- Public --------------------------------- */

  async findAll(
    query: ProductQueryDto,
    options: { ownerId?: string; allStatuses?: boolean } = {},
  ): Promise<Paginated<Product>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = this.baseQuery();

    if (options.ownerId) {
      // Espace vendeur : tous les statuts de ses propres produits.
      qb.andWhere('product."seller_id" = :ownerId', { ownerId: options.ownerId });
      if (query.status) qb.andWhere('product.status = :status', { status: query.status });
    } else if (options.allStatuses) {
      // Espace admin : modération de tout le catalogue, brouillons compris.
      // Sans cette porte, `GET /admin/products` renvoyait exactement la même
      // chose que le catalogue public et les filtres de statut étaient inopérants.
      if (query.status) qb.andWhere('product.status = :status', { status: query.status });
    } else {
      // Catalogue public : uniquement les produits publiés et non supprimés.
      qb.andWhere("product.status = 'published'");
      if (query.status) qb.andWhere('product.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search OR product."short_description" ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.category) {
      qb.andWhere('category.slug = :categorySlug', { categorySlug: query.category });
    }
    if (query.seller) {
      qb.andWhere('product."seller_id" = :sellerId', { sellerId: query.seller });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.availability === true) {
      qb.andWhere('product.stock > 0');
    }
    if (query.featured === true) {
      qb.andWhere('product."is_featured" = true');
    }

    this.applySort(qb, query.sort ?? ProductSort.NEWEST);

    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return { items, meta: buildMeta(total, page, limit) };
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.baseQuery()
      .andWhere('product.slug = :slug', { slug })
      .andWhere("product.status = 'published'")
      .getOne();
    if (!product) {
      throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
    }
    return product;
  }

  async findById(id: string): Promise<Product> {
    const product = await this.baseQuery().andWhere('product.id = :id', { id }).getOne();
    if (!product) {
      throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
    }
    return product;
  }

  /* --------------------------------- Vendeur -------------------------------- */

  async createForSeller(
    sellerId: string,
    dto: CreateProductDto,
    request?: Request,
  ): Promise<Product> {
    await this.categoriesService.findById(dto.categoryId);

    const slug = await uniqueSlug(dto.slug ?? dto.name, async (candidate) => {
      const found = await this.products
        .createQueryBuilder('p')
        .where('p.slug = :slug', { slug: candidate })
        .andWhere('p."deleted_at" IS NULL')
        .getOne();
      return Boolean(found);
    });

    const status = dto.status ?? ProductStatus.DRAFT;
    const product = this.products.create({
      sellerId,
      categoryId: dto.categoryId,
      name: dto.name.trim(),
      slug,
      shortDescription: dto.shortDescription ?? null,
      description: dto.description ?? null,
      price: dto.price,
      compareAtPrice: dto.compareAtPrice ?? null,
      stock: dto.stock,
      sku: dto.sku ?? generateSku(dto.name),
      lowStockThreshold: dto.lowStockThreshold ?? null,
      material: dto.material ?? null,
      dimensions: dto.dimensions ?? null,
      isFeatured: dto.isFeatured ?? false,
      status,
      publishedAt: status === ProductStatus.PUBLISHED ? new Date() : null,
    });

    const saved = await this.products.save(product);

    if (dto.images?.length) {
      await this.replaceImages(saved.id, dto.images);
    }

    await this.audit.log({
      userId: (request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.PRODUCT_CREATED,
      entity: AuditEntity.PRODUCT,
      entityId: saved.id,
      request,
      metadata: { name: saved.name, sellerId, status },
    });

    return this.findById(saved.id);
  }

  async updateForSeller(
    id: string,
    sellerId: string,
    dto: UpdateProductDto,
    options: { isAdmin?: boolean; request?: Request } = {},
  ): Promise<Product> {
    const product = await this.findById(id);

    // Règle de propriété : seul le propriétaire (ou un admin) peut modifier.
    if (!options.isAdmin && product.sellerId !== sellerId) {
      throw BusinessException.forbidden(
        "Vous n'êtes pas propriétaire de ce produit.",
        ErrorCode.PRODUCT_NOT_OWNED,
      );
    }

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.slug !== undefined) {
      product.slug = await uniqueSlug(dto.slug, async (candidate) => {
        const found = await this.products
          .createQueryBuilder('p')
          .where('p.slug = :slug', { slug: candidate })
          .andWhere('p.id != :id', { id })
          .andWhere('p."deleted_at" IS NULL')
          .getOne();
        return Boolean(found);
      });
    }
    if (dto.shortDescription !== undefined) product.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.compareAtPrice !== undefined) product.compareAtPrice = dto.compareAtPrice;
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.categoryId !== undefined) {
      await this.categoriesService.findById(dto.categoryId);
      product.categoryId = dto.categoryId;
    }
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.lowStockThreshold !== undefined) product.lowStockThreshold = dto.lowStockThreshold;
    if (dto.material !== undefined) product.material = dto.material;
    if (dto.dimensions !== undefined) product.dimensions = dto.dimensions;
    if (dto.isFeatured !== undefined && options.isAdmin) product.isFeatured = dto.isFeatured;
    if (dto.isNew !== undefined) product.isNew = dto.isNew;
    if (dto.status !== undefined) {
      product.status = dto.status;
      if (dto.status === ProductStatus.PUBLISHED && !product.publishedAt) {
        product.publishedAt = new Date();
      }
    }

    const saved = await this.products.save(product);

    if (dto.images) {
      await this.replaceImages(saved.id, dto.images);
    }

    // Alerte stock faible (seuil produit ou seuil global).
    await this.maybeNotifyLowStock(saved);

    await this.audit.log({
      userId: (options.request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.PRODUCT_UPDATED,
      entity: AuditEntity.PRODUCT,
      entityId: saved.id,
      request: options.request,
      metadata: { fields: Object.keys(dto) },
    });

    return this.findById(saved.id);
  }

  /** Soft delete : le produit reste référencé par les commandes historiques. */
  async removeForSeller(
    id: string,
    sellerId: string,
    options: { isAdmin?: boolean; request?: Request } = {},
  ): Promise<void> {
    const product = await this.findById(id);
    if (!options.isAdmin && product.sellerId !== sellerId) {
      throw BusinessException.forbidden(
        "Vous n'êtes pas propriétaire de ce produit.",
        ErrorCode.PRODUCT_NOT_OWNED,
      );
    }
    await this.products.softDelete(id);
    await this.audit.log({
      userId: (options.request as unknown as { user?: { id: string } })?.user?.id ?? null,
      action: AuditAction.PRODUCT_DELETED,
      entity: AuditEntity.PRODUCT,
      entityId: id,
      request: options.request,
    });
  }

  async replaceImages(
    productId: string,
    images: { objectKey: string; url?: string; alt?: string; isPrimary?: boolean }[],
  ): Promise<ProductImage[]> {
    await this.images.delete({ productId });
    const entities = images.map((image, index) =>
      this.images.create({
        productId,
        objectKey: image.objectKey,
        url: image.url ?? null,
        alt: image.alt ?? null,
        sortOrder: index,
        isPrimary: image.isPrimary ?? index === 0,
      }),
    );
    return this.images.save(entities);
  }

  /* ---------------------------------- Stock --------------------------------- */

  async decrementStock(
    manager: DataSource | { query: never },
    items: { productId: string; quantity: number }[],
  ): Promise<void> {
    // Utilisé avec le query runner de la transaction.
    const runner = manager as unknown as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };
    for (const item of items) {
      const rows = (await runner.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock',
        [item.quantity, item.productId],
      )) as { stock: number }[];
      if (!rows || rows.length === 0) {
        throw BusinessException.conflict(
          'Stock insuffisant pour un ou plusieurs articles.',
          ErrorCode.INSUFFICIENT_STOCK,
        );
      }
      const remaining = rows[0].stock;
      if (remaining <= 0) {
        await runner.query("UPDATE products SET status = 'out_of_stock' WHERE id = $1", [
          item.productId,
        ]);
      }
    }
  }

  async restock(productId: string, quantity: number): Promise<void> {
    await this.products
      .createQueryBuilder()
      .update()
      .set({ stock: () => `stock + ${Math.max(0, Math.trunc(quantity))}` })
      .where('id = :id', { id: productId })
      .execute();
  }

  async findLowStock(sellerId?: string): Promise<Product[]> {
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.seller', 'seller')
      .where('p."deleted_at" IS NULL')
      .andWhere('p.stock <= COALESCE(p."low_stock_threshold", :defaultThreshold)', {
        defaultThreshold: 5,
      });
    if (sellerId) qb.andWhere('p."seller_id" = :sellerId', { sellerId });
    return qb.getMany();
  }

  private async maybeNotifyLowStock(product: Product): Promise<void> {
    const threshold = product.lowStockThreshold ?? 5;
    if (product.stock > threshold) return;
    try {
      await this.notifications.notifyLowStock(product.sellerId, product);
    } catch (error) {
      this.logger.warn(`Notification stock impossible : ${(error as Error).message}`);
    }
  }

  /* -------------------------------- Interne --------------------------------- */

  private baseQuery(): SelectQueryBuilder<Product> {
    return this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.seller', 'seller')
      .where('product."deleted_at" IS NULL')
      .orderBy('images.sortOrder', 'ASC');
  }

  private applySort(qb: SelectQueryBuilder<Product>, sort: ProductSort): void {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        qb.orderBy('product.price', 'ASC');
        break;
      case ProductSort.PRICE_DESC:
        qb.orderBy('product.price', 'DESC');
        break;
      case ProductSort.NAME_ASC:
        qb.orderBy('product.name', 'ASC');
        break;
      case ProductSort.RATING:
        qb.orderBy('product.ratingAverage', 'DESC').addOrderBy('product.ratingCount', 'DESC');
        break;
      case ProductSort.POPULAR:
        qb.orderBy('product.isFeatured', 'DESC').addOrderBy('product.ratingCount', 'DESC');
        break;
      case ProductSort.NEWEST:
      default:
        qb.orderBy('product.createdAt', 'DESC');
        break;
    }
  }
}
