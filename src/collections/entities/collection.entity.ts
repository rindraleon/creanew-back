import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface CollectionGalleryImage {
  objectKey: string;
  url?: string | null;
  alt?: string | null;
}

@Entity('collections')
@Index('idx_collections_slug', ['slug'], { unique: true })
@Index('idx_collections_position', ['position'])
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 180 })
  slug!: string;

  @Column({ type: 'varchar', length: 220, nullable: true })
  tagline!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', name: 'cover_image_url', length: 500, nullable: true })
  coverImageUrl!: string | null;

  @Column({ type: 'varchar', name: 'cover_object_key', length: 500, nullable: true })
  coverObjectKey!: string | null;

  /** IDs des produits rattachés — relation souple via JSONB (évite table de jointure lourde). */
  @Column({ type: 'jsonb', name: 'product_ids', default: () => "'[]'::jsonb" })
  productIds!: string[];

  /** Galerie éditoriale de la collection (même format que images produit). */
  @Column({ type: 'jsonb', name: 'gallery', default: () => "'[]'::jsonb" })
  gallery!: CollectionGalleryImage[];

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'boolean', name: 'is_published', default: true })
  isPublished!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
