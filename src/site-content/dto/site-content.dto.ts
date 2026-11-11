import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertSiteSettingDto {
  @ApiProperty({ example: 'homepage' })
  @IsString()
  key!: string;

  @ApiProperty({ example: { heroTitle: 'Donnez une nouvelle vie à votre salon' } })
  @IsObject()
  value!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SiteSettingResponseDto {
  @ApiProperty() key!: string;
  @ApiProperty() value!: Record<string, unknown>;
  @ApiPropertyOptional() description!: string | null;
}
