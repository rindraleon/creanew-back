import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '../../common/enums';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class ProductImageInputDto {
  @ApiProperty({ description: 'Clé objet MinIO retournée par POST /files/upload.' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i, { message: 'objectKey invalide.' })
  objectKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  alt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Canapé Oslo 3 places' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent.' })
  @IsOptional()
  @IsString()
  @Length(2, 220)
  slug?: string;

  @ApiPropertyOptional({ example: 'Canapé trois places en bouclé crème.' })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'Description longue du produit…' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 2_450_000, description: 'Prix en MGA (entier).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 2_990_000, description: 'Prix barré en MGA (entier).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPrice?: number;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiProperty({ description: 'Identifiant de catégorie.' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  sku?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  material?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  dimensions?: string;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [ProductImageInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 220)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  material?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  dimensions?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  @ApiPropertyOptional({ type: [ProductImageInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
}

export enum ProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  POPULAR = 'popular',
  RATING = 'rating',
}

export class ProductQueryDto {
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

  @ApiPropertyOptional({ example: 'canape' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ description: 'Slug de catégorie.' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  category?: string;

  @ApiPropertyOptional({ description: 'UUID du vendeur.' })
  @IsOptional()
  @IsUUID()
  seller?: string;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 3000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Uniquement les produits en stock.' })
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  availability?: boolean;

  @ApiPropertyOptional({ description: 'Uniquement les produits en vedette.' })
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  featured?: boolean;

  @ApiPropertyOptional({ enum: ProductSort, default: ProductSort.NEWEST })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Filtre de statut (vendeur/admin uniquement).',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class ProductImageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string | null;
  @ApiProperty() objectKey!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPrimary!: boolean;
  @ApiPropertyOptional() alt!: string | null;
}

export class ProductResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() shortDescription!: string | null;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty({ description: 'Prix en MGA (entier).' })
  price!: number;

  @ApiPropertyOptional() compareAtPrice!: number | null;
  @ApiProperty() stock!: number;
  @ApiPropertyOptional() sku!: string | null;
  @ApiProperty({ enum: ProductStatus }) status!: ProductStatus;
  @ApiPropertyOptional() material!: string | null;
  @ApiPropertyOptional() dimensions!: string | null;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() isNew!: boolean;
  @ApiProperty() ratingAverage!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() categoryId!: string;
  @ApiPropertyOptional() category!: { id: string; name: string; slug: string } | null;
  @ApiProperty() sellerId!: string;
  @ApiPropertyOptional() seller!: { id: string; shopName: string; slug: string } | null;
  @ApiProperty({ type: [ProductImageResponseDto] }) images!: ProductImageResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
