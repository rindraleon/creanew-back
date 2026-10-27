import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus, ShippingMethod } from '../../common/enums';
import { User } from '../../users/entities/user.entity';
import type { Payment } from '../../payments/entities/payment.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';

export interface OrderAddressSnapshot {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  postalCode?: string | null;
  city: string;
  country: string;
}

@Entity('orders')
@Index('idx_orders_user', ['userId'])
@Index('idx_orders_status', ['status'])
@Index('idx_orders_number', ['orderNumber'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', name: 'order_number', length: 40 })
  orderNumber!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status!: OrderStatus;

  /** Sous-total = somme des lignes, entier MGA. */
  @Column({ type: 'integer' })
  subtotal!: number;

  @Column({ type: 'integer', default: 0 })
  discount!: number;

  @Column({ type: 'varchar', name: 'promo_code', length: 40, nullable: true })
  promoCode!: string | null;

  @Column({
    name: 'shipping_method',
    type: 'enum',
    enum: ShippingMethod,
    default: ShippingMethod.STANDARD,
  })
  shippingMethod!: ShippingMethod;

  @Column({ name: 'shipping_cost', type: 'integer', default: 0 })
  shippingCost!: number;

  @Column({ type: 'integer' })
  total!: number;

  @Column({ type: 'varchar', length: 3, default: 'MGA' })
  currency!: string;

  /** Snapshot de l'adresse : la commande reste historiquement correcte. */
  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress!: OrderAddressSnapshot;

  @Column({ type: 'varchar', name: 'customer_name', length: 160 })
  customerName!: string;

  @Column({ type: 'varchar', name: 'customer_email', length: 190 })
  customerEmail!: string;

  @Column({ type: 'varchar', name: 'customer_phone', length: 40, nullable: true })
  customerPhone!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'placed_at', type: 'timestamptz', nullable: true })
  placedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];

  @OneToMany(() => OrderStatusHistory, (history) => history.order, { cascade: true })
  statusHistory!: OrderStatusHistory[];

  payment?: Payment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
