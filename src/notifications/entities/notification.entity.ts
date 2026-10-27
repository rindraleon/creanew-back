import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationChannel, NotificationType } from '../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
@Index('idx_notifications_user', ['userId'])
@Index('idx_notifications_read', ['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: NotificationChannel, default: NotificationChannel.BOTH })
  channel!: NotificationChannel;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data!: Record<string, unknown>;

  @Column({ name: 'email_sent_at', type: 'timestamptz', nullable: true })
  emailSentAt!: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
