import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProductStatus } from '../common/enums';
import type { CartResponseDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(Cart)
    private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly items: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.carts.findOne({ where: { userId } });
    cart ??= await this.carts.save(this.carts.create({ userId }));
    return cart;
  }

  async getCart(userId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.items.find({
      where: { cartId: cart.id },
      relations: { product: true },
      order: { createdAt: 'ASC' },
    });

    const warnings: string[] = [];
    let subtotal = 0;
    let quantity = 0;

    const lines = items.map((item) => {
      const product = item.product;
      let available = true;
      let issue: string | null = null;

      if (!product || product.deletedAt) {
        available = false;
        issue = 'Ce produit n’est plus disponible.';
      } else if (product.status !== ProductStatus.PUBLISHED) {
        available = false;
        issue = 'Ce produit n’est plus en vente.';
      } else if (product.stock <= 0) {
        available = false;
        issue = 'Rupture de stock.';
      } else if (item.quantity > product.stock) {
        available = false;
        issue = `Stock insuffisant (${product.stock} disponible(s)).`;
      }

      const unitPrice = product?.price ?? 0;
      const lineTotal = available ? unitPrice * item.quantity : 0;

      if (available) {
        subtotal += lineTotal;
        quantity += item.quantity;
      } else if (issue) {
        warnings.push(`${product?.name ?? 'Article'} : ${issue}`);
      }

      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        available,
        issue,
        product: {
          id: product?.id ?? item.productId,
          name: product?.name ?? 'Produit indisponible',
          slug: product?.slug ?? '',
          price: unitPrice,
          compareAtPrice: product?.compareAtPrice ?? null,
          stock: product?.stock ?? 0,
          imageUrl: this.primaryImage(product),
          sellerId: product?.sellerId ?? '',
          sellerName: null,
        },
      };
    });

    return {
      id: cart.id,
      items: lines,
      subtotal,
      itemCount: lines.filter((line) => line.available).length,
      quantity,
      currency: 'MGA',
      warnings,
    };
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartResponseDto> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product || product.deletedAt) {
      throw BusinessException.notFound('Produit introuvable.', ErrorCode.PRODUCT_NOT_FOUND);
    }
    if (product.status !== ProductStatus.PUBLISHED) {
      throw BusinessException.badRequest(
        "Ce produit n'est pas disponible à la vente.",
        ErrorCode.PRODUCT_NOT_PUBLISHED,
      );
    }
    if (product.stock <= 0) {
      throw BusinessException.conflict(
        'Produit en rupture de stock.',
        ErrorCode.INSUFFICIENT_STOCK,
      );
    }

    const cart = await this.getOrCreateCart(userId);
    const existing = await this.items.findOne({ where: { cartId: cart.id, productId } });
    const currentQty = existing?.quantity ?? 0;
    const desired = Math.min(currentQty + quantity, product.stock, 99);

    if (desired <= currentQty) {
      throw BusinessException.conflict(
        `Stock maximum atteint pour « ${product.name} » (${product.stock} disponible(s)).`,
        ErrorCode.INSUFFICIENT_STOCK,
      );
    }

    if (existing) {
      existing.quantity = desired;
      await this.items.save(existing);
    } else {
      await this.items.save(this.items.create({ cartId: cart.id, productId, quantity: desired }));
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.items.findOne({
      where: { id: itemId, cartId: cart.id },
      relations: { product: true },
    });
    if (!item) {
      throw BusinessException.notFound(
        'Article introuvable dans le panier.',
        ErrorCode.CART_ITEM_NOT_FOUND,
      );
    }

    const stock = item.product?.stock ?? 0;
    if (quantity > stock) {
      throw BusinessException.conflict(
        `Stock insuffisant (${stock} disponible(s)).`,
        ErrorCode.INSUFFICIENT_STOCK,
      );
    }
    item.quantity = quantity;
    await this.items.save(item);
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.items.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) {
      throw BusinessException.notFound(
        'Article introuvable dans le panier.',
        ErrorCode.CART_ITEM_NOT_FOUND,
      );
    }
    await this.items.remove(item);
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.carts.findOne({ where: { userId } });
    if (!cart) return;
    await this.items.delete({ cartId: cart.id });
  }

  /** Utilisé par la création de commande (dans la transaction). */
  async getItemsForOrder(userId: string): Promise<{ cart: Cart; items: CartItem[] }> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.items.find({
      where: { cartId: cart.id },
      relations: { product: true },
    });
    return { cart, items };
  }

  private primaryImage(product?: Product | null): string | null {
    if (!product?.images || product.images.length === 0) return null;
    const primary = product.images.find((image) => image.isPrimary) ?? product.images[0];
    return primary?.url ?? null;
  }
}
