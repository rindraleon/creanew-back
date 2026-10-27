import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction, AuditEntity } from '../../common/enums';

/** Journal d'audit : qui a fait quoi, quand, sur quelle ressource, depuis quelle IP. */
@Entity('audit_logs')
@Index('idx_audit_logs_user', ['userId'])
@Index('idx_audit_logs_action', ['action'])
@Index('idx_audit_logs_entity', ['entity', 'entityId'])
@Index('idx_audit_logs_created', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** null = action système ou anonyme. */
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action!: AuditAction;

  @Column({ type: 'enum', enum: AuditEntity })
  entity!: AuditEntity;

  @Column({ type: 'varchar', name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Column({ type: 'varchar', name: 'ip_address', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', name: 'user_agent', length: 400, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
