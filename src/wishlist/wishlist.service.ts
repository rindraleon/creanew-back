import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Wishlist } from './entities/wishlist.entity';
import { WishlistItem } from './entities/wishlist-item.entity';
import { Product } from '../products/entities/product.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';

export interface WishlistProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  addedAt: Date;
}

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private readonly wishlists: Repository<Wishlist>,
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    private readonly dataSource: DataSource,
  ) {}

  /** Récupère la liste de l'utilisateur, la crée si elle n'existe pas encore. */
  private async getOrCreate(userId: string): Promise<Wishlist> {
    const existing = await this.wishlists.findOne({ where: { userId } });
    if (existing) return existing;

    return this.dataSource.transaction(async (manager) => {
      // Concurrence : un autre appel a pu créer la liste entre-temps.
      const recheck = await manager.findOne(Wishlist, { where: { userId } });
      if (recheck) return recheck;

      const created = manager.create(Wishlist, { userId });
      return manager.save(created);
    });
  }

  async findAll(userId: string): Promise<WishlistProduct[]> {
    const wishlist = await this.getOrCreate(userId);

    const rows = await this.items
      .createQueryBuilder('wi')
      .innerJoin(Product, 'p', 'p.id = wi."product_id"')
      .leftJoin('p.images', 'img', 'img."sort_order" = 0')
      .select([
        'wi.id AS "itemId"',
        'p.id AS "id"',
        'p.slug AS "slug"',
        'p.name AS "name"',
        'p.price AS "price"',
        'p.stock AS "stock"',
        'COALESCE(img."url", img."object_key") AS "imageUrl"',
        'wi."created_at" AS "addedAt"',
      ])
      .where('wi."wishlist_id" = :wishlistId', { wishlistId: wishlist.id })
      .andWhere('p."deleted_at" IS NULL')
      .orderBy('wi."created_at"', 'DESC')
      .getRawMany<{
        id: string;
        slug: string;
        name: string;
        price: number;
        stock: number;
        imageUrl: string | null;
        addedAt: Date;
      }>();

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      price: Number(row.price),
      stock: Number(row.stock),
      imageUrl: row.imageUrl,
      addedAt: row.addedAt,
    }));
  }

  async add(userId: string, productId: string): Promise<WishlistProduct[]> {
    const product = await this.dataSource.getRepository(Product).findOne({
      where: { id: productId },
    });

    if (!product || product.deletedAt) {
      throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
    }

    const wishlist = await this.getOrCreate(userId);

    const already = await this.items.findOne({
      where: { wishlistId: wishlist.id, productId },
    });

    if (!already) {
      await this.items.save(this.items.create({ wishlistId: wishlist.id, productId }));
    }

    return this.findAll(userId);
  }

  async remove(userId: string, productId: string): Promise<WishlistProduct[]> {
    const wishlist = await this.wishlists.findOne({ where: { userId } });
    if (!wishlist) return [];

    await this.items.delete({ wishlistId: wishlist.id, productId });
    return this.findAll(userId);
  }

  /** Bascule : ajoute si absent, retire si présent. */
  async toggle(userId: string, productId: string): Promise<WishlistProduct[]> {
    const wishlist = await this.getOrCreate(userId);
    const existing = await this.items.findOne({
      where: { wishlistId: wishlist.id, productId },
    });

    if (existing) {
      await this.items.remove(existing);
      return this.findAll(userId);
    }

    const product = await this.dataSource.getRepository(Product).findOne({
      where: { id: productId },
    });
    if (!product || product.deletedAt) {
      throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
    }

    await this.items.save(this.items.create({ wishlistId: wishlist.id, productId }));
    return this.findAll(userId);
  }

  async clear(userId: string): Promise<void> {
    const wishlist = await this.wishlists.findOne({ where: { userId } });
    if (!wishlist) return;
    await this.items.delete({ wishlistId: wishlist.id });
  }
}
