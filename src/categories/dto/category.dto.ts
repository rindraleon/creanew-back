import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { slugify as slugifyFn } from '../../common/utils/slug.util';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

const OBJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i;

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
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'products/2026/11/8d1b6c2a-7f2f-4e46-9b2f-0c9a1d3c5e77.webp',
    description: 'Clé objet renvoyée par POST /files/upload. Aucune URL externe acceptée.',
  })
  @IsOptional()
  @IsString()
  @Matches(OBJECT_KEY_PATTERN, { message: 'imageObjectKey invalide.' })
  imageObjectKey?: string;

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

  @ApiPropertyOptional({
    example: '5c1d4f7a-2f3e-4c8b-9d10-2b7a6e5f4d3c',
    description: 'Catégorie parente (hiérarchie sur un seul niveau).',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID('4', { message: 'parentId doit être un identifiant valide.' })
  parentId?: string | null;

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
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Nouvelle clé objet. Envoyer une chaîne vide retire l’image.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^$|^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i, { message: 'imageObjectKey invalide.' })
  imageObjectKey?: string;

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

  @ApiPropertyOptional({
    description: 'Nouvelle catégorie parente. Envoyer null retire le parent.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID('4', { message: 'parentId doit être un identifiant valide.' })
  parentId?: string | null;
}

export class CategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() imageObjectKey!: string | null;
  @ApiPropertyOptional() imageUrl!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() parentId!: string | null;
  @ApiPropertyOptional() parentName!: string | null;
  @ApiProperty({ description: 'Nombre de produits rattachés (tous statuts).' })
  productCount!: number;
  @ApiProperty({ description: 'Nombre de sous-catégories.' })
  childCount!: number;
  @ApiProperty() createdAt!: Date;
}

export class CategoryQueryDto {
  @ApiPropertyOptional({ description: 'Recherche sur le nom ou la description.' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par état (admin).' })
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Inclure les catégories inactives (admin uniquement).' })
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  includeInactive?: boolean;
}
