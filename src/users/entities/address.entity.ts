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
import { User } from './user.entity';

@Entity('addresses')
@Index('idx_addresses_user', ['userId'])
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 60, nullable: true })
  label!: string | null;

  @Column({ type: 'varchar', name: 'full_name', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 40 })
  phone!: string;

  @Column({ type: 'varchar', name: 'address_line1', length: 200 })
  addressLine1!: string;

  @Column({ type: 'varchar', name: 'address_line2', length: 200, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', name: 'postal_code', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 120 })
  city!: string;

  @Column({ type: 'varchar', length: 120, default: 'Madagascar' })
  country!: string;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
