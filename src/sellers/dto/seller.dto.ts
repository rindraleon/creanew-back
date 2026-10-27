import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { SellerStatus } from '../../common/enums';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class ApplySellerDto {
  @ApiProperty({ example: 'Atelier Bois de Rose' })
  @IsString()
  @Length(2, 160)
  shopName!: string;

  @ApiPropertyOptional({ example: 'Fabrication artisanale de mobilier en bois massif.' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ example: '+261 34 12 345 67' })
  @IsOptional()
  @IsString()
  @Length(4, 40)
  phone?: string;

  @ApiPropertyOptional({ example: 'Antananarivo' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  city?: string;

  @ApiPropertyOptional({ example: 'Lot II M 12 Bis' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  addressLine?: string;

  @ApiPropertyOptional({
    description: 'Clés objet MinIO des justificatifs (via POST /files/upload).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentKeys?: string[];
}

export class UpdateSellerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  shopName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(4, 40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 250)
  addressLine?: string;
}

export class RejectSellerDto {
  @ApiProperty({ example: 'Documents illisibles.' })
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class SellerResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() shopName!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() phone!: string | null;
  @ApiPropertyOptional() city!: string | null;
  @ApiPropertyOptional() addressLine!: string | null;
  @ApiProperty({ enum: SellerStatus }) status!: SellerStatus;
  @ApiProperty() documentKeys!: string[];
  @ApiPropertyOptional() rejectionReason!: string | null;
  @ApiPropertyOptional() submittedAt!: Date | null;
  @ApiPropertyOptional() reviewedAt!: Date | null;
  @ApiPropertyOptional() createdAt!: Date;
}

export class SellerQueryDto {
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
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: SellerStatus })
  @IsOptional()
  @IsEnum(SellerStatus)
  status?: SellerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  withDeleted?: boolean;
}
