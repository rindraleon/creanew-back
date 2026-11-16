import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { IsSafeEmail, NormalizeEmail } from '../../common/validators/email-disposable.validator';
import { ContactStatus } from '../entities/contact-message.entity';

export class CreateContactDto {
  @ApiProperty({ example: 'Miora Rakoto' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ example: 'client@example.mg' })
  @NormalizeEmail()
  @IsSafeEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'Question produit' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  subject?: string;

  @ApiProperty({ example: 'Bonjour, je souhaite des infos sur le canapé Oslo…' })
  @IsString()
  @Length(10, 5000)
  message!: string;

  /** Honeypot anti-spam (doit rester vide) — validé côté service. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;
}

export class ReplyContactDto {
  @ApiProperty({ example: 'Merci pour votre message, voici notre réponse…' })
  @IsString()
  @Length(2, 5000)
  reply!: string;
}

export class ContactResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional() subject!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ContactStatus }) status!: ContactStatus;
  @ApiPropertyOptional() adminReply!: string | null;
  @ApiPropertyOptional() repliedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ContactQueryDto {
  @ApiPropertyOptional({ enum: ContactStatus })
  @IsOptional()
  @IsString()
  status?: ContactStatus;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}
