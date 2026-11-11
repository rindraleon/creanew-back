import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

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
  coverObjectKey?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  isPublished?: boolean;

  @IsOptional()
  position?: number;

  normalizedSlug(): string {
    const base = this.slug ?? this.name;
    return base
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
  @ApiPropertyOptional() @IsOptional() @IsString() coverObjectKey?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() position?: number;
}

export class CollectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() tagline!: string | null;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() coverImageUrl!: string | null;
  @ApiPropertyOptional() coverObjectKey!: string | null;
  @ApiProperty() productIds!: string[];
  @ApiProperty() position!: number;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
