import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CollectionGalleryImageDto {
  @ApiProperty({ description: 'Clé objet MinIO retournée par POST /files/upload.' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i, { message: 'objectKey invalide.' })
  objectKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class CreateCollectionDto {
  @ApiProperty({ example: 'Signature CreaNew' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional({ example: 'signature-creanew' })
  @IsOptional()
  @IsString()
  @Length(2, 180)
  slug?: string;

  @ApiPropertyOptional({ example: 'Nos classiques intemporels' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i, { message: 'coverObjectKey invalide.' })
  coverObjectKey?: string;

  @ApiPropertyOptional({ type: [CollectionGalleryImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CollectionGalleryImageDto)
  gallery?: CollectionGalleryImageDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  normalizedSlug(): string {
    const base = this.slug ?? this.name;
    return base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export class UpdateCollectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 180) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(220) tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) coverImageUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9/_-]{2,}\.[a-z0-9]{1,8}$/i, { message: 'coverObjectKey invalide.' })
  coverObjectKey?: string;
  @ApiPropertyOptional({ type: [CollectionGalleryImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CollectionGalleryImageDto)
  gallery?: CollectionGalleryImageDto[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;
}

export class CollectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() tagline!: string | null;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() coverImageUrl!: string | null;
  @ApiPropertyOptional() coverObjectKey!: string | null;
  @ApiPropertyOptional({ type: [CollectionGalleryImageDto] }) gallery!: CollectionGalleryImageDto[];
  @ApiProperty() productIds!: string[];
  @ApiProperty() position!: number;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
