import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MobileMoneyProvider, PaymentStatus } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('payments')
@Index('idx_payments_order', ['orderId'])
@Index('idx_payments_status', ['status'])
@Index('idx_payments_reference_active', ['provider', 'transactionReference'], {
  unique: true,
  where: "\"status\" IN ('pending','submitted','verified')",
})
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'enum', enum: MobileMoneyProvider })
  provider!: MobileMoneyProvider;

  @Column({ type: 'varchar', name: 'transaction_reference', length: 120 })
  transactionReference!: string;

  /** Montant attendu, recalculé côté serveur (jamais celui du frontend). */
  @Column({ type: 'integer' })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'MGA' })
  currency!: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'varchar', name: 'payer_phone', length: 40, nullable: true })
  payerPhone!: string | null;

  @Column({ type: 'varchar', name: 'proof_object_key', length: 500, nullable: true })
  proofObjectKey!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'uuid', name: 'verified_by', nullable: true })
  verifiedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifier!: User | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
