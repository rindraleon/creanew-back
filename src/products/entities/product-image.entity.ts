import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
@Index('idx_product_images_product', ['productId'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  /** Clé objet MinIO — jamais fournie par le client. */
  @Column({ type: 'varchar', name: 'object_key', length: 500 })
  objectKey!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url!: string | null;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  alt!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
