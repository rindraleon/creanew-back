import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { StorageBucket } from '../../common/enums';

export class UploadedFileResponseDto {
  @ApiProperty({ enum: StorageBucket }) bucket!: StorageBucket;
  @ApiProperty({ description: 'Clé objet générée côté serveur.' })
  objectKey!: string;
  @ApiProperty() url!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() size!: number;
  @ApiProperty() originalName!: string;
}

export class DeleteFileDto {
  @ApiProperty({ enum: StorageBucket })
  @IsEnum(StorageBucket)
  bucket!: StorageBucket;

  @ApiProperty()
  @IsString()
  @Length(3, 500)
  objectKey!: string;
}

/** Types MIME acceptés par bucket (documentation Swagger). */
export const UPLOAD_RULES = {
  [StorageBucket.PRODUCTS]: { accept: 'image/jpeg,image/png,image/webp', maxSizeMb: 5 },
  [StorageBucket.AVATARS]: { accept: 'image/jpeg,image/png,image/webp', maxSizeMb: 2 },
  [StorageBucket.SELLER_DOCUMENTS]: {
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
    maxSizeMb: 10,
  },
  [StorageBucket.PAYMENT_PROOFS]: {
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
    maxSizeMb: 5,
  },
} as const;
