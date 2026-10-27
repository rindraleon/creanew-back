import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { UserRole, AuditAction, AuditEntity } from '../../common/enums';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Recherche sur nom ou email.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  inactiveOnly?: boolean;
}

export class ChangeRoleDto {
  @ApiPropertyOptional({ enum: UserRole, example: UserRole.SELLER })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class SuspendUserDto {
  @ApiPropertyOptional({ example: 'Activité suspecte.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AuditLogQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditEntity })
  @IsOptional()
  @IsEnum(AuditEntity)
  entity?: AuditEntity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'] as unknown as object)
  order?: 'ASC' | 'DESC' = 'DESC';
}

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: ['sales', 'orders', 'products', 'customers', 'sellers'],
    example: 'sales',
  })
  @IsOptional()
  @IsEnum(['sales', 'orders', 'products', 'customers', 'sellers'] as unknown as object)
  type?: 'sales' | 'orders' | 'products' | 'customers' | 'sellers' = 'sales';

  @ApiPropertyOptional({
    enum: ['today', '7d', '30d', 'this_month', 'last_month', 'this_year', 'custom'],
    example: '30d',
  })
  @IsOptional()
  @IsString()
  period?: 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'this_year' | 'custom' = '30d';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}
