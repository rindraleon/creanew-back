import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { slugify as slugifyFn } from '../../common/utils/slug.util';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Canapés' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'canapes', description: 'Généré depuis le nom si absent.' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  slug?: string;

  @ApiPropertyOptional({ example: 'Canapés et banquettes pour le salon.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://.../categories/canapes.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Normalise le slug reçu ou le dérive du nom. */
  normalizedSlug(): string {
    return slugifyFn(this.slug && this.slug.trim() ? this.slug : this.name);
  }
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() imageUrl!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ description: 'Nombre de produits publiés.' })
  productCount?: number;
  @ApiProperty() createdAt!: Date;
}

export class CategoryQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;

  @ApiPropertyOptional({ description: 'Inclure les catégories inactives (admin).' })
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }) => value === true || value === 'true')
  includeInactive?: boolean;
}
