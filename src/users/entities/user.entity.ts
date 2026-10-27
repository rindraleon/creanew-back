import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums';
import { Address } from './address.entity';

@Entity('users')
@Index('idx_users_email_active', ['email'], { unique: true, where: '"deleted_at" IS NULL' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 190 })
  email!: string;

  /** Jamais renvoyé par l'API (select: false + @Exclude). */
  @Exclude()
  @Column({ type: 'varchar', name: 'password_hash', select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', name: 'first_name', length: 120 })
  firstName!: string;

  @Column({ type: 'varchar', name: 'last_name', length: 120 })
  lastName!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role!: UserRole;

  @Column({ type: 'varchar', name: 'avatar_object_key', nullable: true })
  avatarObjectKey!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_email_verified', default: false })
  isEmailVerified!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;

  @OneToMany(() => Address, (address) => address.user, { cascade: true })
  addresses!: Address[];

  @OneToOne('Seller', 'user')
  seller?: unknown;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}
