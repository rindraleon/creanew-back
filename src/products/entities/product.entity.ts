import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductStatus } from '../../common/enums';
import { Category } from '../../categories/entities/category.entity';
import { Seller } from '../../sellers/entities/seller.entity';
import { ProductImage } from './product-image.entity';

@Entity('products')
@Index('idx_products_seller', ['sellerId'])
@Index('idx_products_category', ['categoryId'])
@Index('idx_products_status', ['status'])
@Index('idx_products_slug', ['slug'], { unique: true, where: '"deleted_at" IS NULL' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'seller_id' })
  sellerId!: string;

  @ManyToOne(() => Seller, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller!: Seller;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 220 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', name: 'short_description', length: 500, nullable: true })
  shortDescription!: string | null;

  /** Prix de vente, entier MGA. */
  @Column({ type: 'integer' })
  price!: number;

  /** Prix barré, entier MGA. */
  @Column({ name: 'compare_at_price', type: 'integer', nullable: true })
  compareAtPrice!: number | null;

  @Column({ type: 'integer', default: 0 })
  stock!: number;

  @Column({ name: 'low_stock_threshold', type: 'integer', nullable: true })
  lowStockThreshold!: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sku!: string | null;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status!: ProductStatus;

  @Column({ type: 'varchar', name: 'material', length: 200, nullable: true })
  material!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dimensions!: string | null;

  @Column({ type: 'boolean', name: 'is_featured', default: false })
  isFeatured!: boolean;

  @Column({ type: 'boolean', name: 'is_new', default: true })
  isNew!: boolean;

  @Column({ name: 'rating_average', type: 'numeric', precision: 3, scale: 2, default: 0 })
  ratingAverage!: number;

  @Column({ name: 'rating_count', type: 'integer', default: 0 })
  ratingCount!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images!: ProductImage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;

  get isPurchasable(): boolean {
    return this.status === ProductStatus.PUBLISHED && this.stock > 0;
  }
}
