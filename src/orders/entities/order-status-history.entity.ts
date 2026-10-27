import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderStatus } from '../../common/enums';
import { Order } from './order.entity';

/** Toute transition de statut est historisée (jamais de simple `status = ...`). */
@Entity('order_status_history')
@Index('idx_order_status_history_order', ['orderId'])
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'previous_status', type: 'enum', enum: OrderStatus, nullable: true })
  previousStatus!: OrderStatus | null;

  @Column({ name: 'new_status', type: 'enum', enum: OrderStatus })
  newStatus!: OrderStatus;

  /** Utilisateur à l'origine du changement (null = système). */
  @Column({ type: 'varchar', name: 'changed_by', nullable: true })
  changedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
