import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Seller } from '../../sellers/entities/seller.entity';
import { Order } from './order.entity';

/** Ligne de commande : le prix unitaire est figé au moment de l'achat. */
@Entity('order_items')
@Index('idx_order_items_order', ['orderId'])
@Index('idx_order_items_seller', ['sellerId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product!: Product | null;

  /** Vendeur propriétaire au moment de la commande. */
  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @ManyToOne(() => Seller, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_id' })
  seller!: Seller;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 220, nullable: true })
  slug!: string | null;

  @Column({ type: 'varchar', name: 'image_url', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sku!: string | null;

  @Column({ name: 'unit_price', type: 'integer' })
  unitPrice!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'line_total', type: 'integer' })
  lineTotal!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
