import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SellerStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('sellers')
@Index('idx_sellers_user', ['userId'], { unique: true })
@Index('idx_sellers_slug', ['slug'], { unique: true })
@Index('idx_sellers_status', ['status'])
export class Seller {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', name: 'shop_name', length: 160 })
  shopName!: string;

  @Column({ type: 'varchar', length: 190 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', name: 'address_line', length: 250, nullable: true })
  addressLine!: string | null;

  @Column({ type: 'enum', enum: SellerStatus, default: SellerStatus.PENDING })
  status!: SellerStatus;

  /** Documents déposés lors de la demande (clés MinIO, jamais de chemin client). */
  @Column({ name: 'document_keys', type: 'jsonb', default: () => "'[]'::jsonb" })
  documentKeys!: string[];

  @Column({ type: 'varchar', name: 'logo_object_key', nullable: true })
  logoObjectKey!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;

  get isApproved(): boolean {
    return this.status === SellerStatus.APPROVED;
  }
}
