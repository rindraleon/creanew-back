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
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

export enum ConversationStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity('conversations')
@Index('idx_conversations_status', ['status'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 220 })
  subject!: string;

  @Column({ type: 'uuid', nullable: true, name: 'order_id' })
  orderId!: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order!: Order | null;

  /** Créateur (client) */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  /** Participant vendeur/admin — si null, admin peut répondre. */
  @Column({ type: 'uuid', nullable: true, name: 'seller_id' })
  sellerId!: string | null;

  @Column({ type: 'enum', enum: ConversationStatus, default: ConversationStatus.OPEN })
  status!: ConversationStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_message_at' })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany('Message', 'conversation')
  messages!: import('./message.entity').Message[];

  @OneToMany('ConversationParticipant', 'conversation', { cascade: true })
  participants!: import('./conversation-participant.entity').ConversationParticipant[];
}
