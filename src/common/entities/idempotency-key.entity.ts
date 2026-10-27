import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('idempotency_keys')
@Index('idx_idempotency_unique', ['scope', 'key'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  scope!: string;

  @Column({ type: 'varchar', length: 200 })
  key!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /** Empreinte du payload : même clé + payload différent = conflit. */
  @Column({ type: 'varchar', name: 'request_hash', length: 128 })
  requestHash!: string;

  @Column({ name: 'response', type: 'jsonb', nullable: true })
  response!: Record<string, unknown> | null;

  @Column({ name: 'status_code', type: 'integer', nullable: true })
  statusCode!: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
