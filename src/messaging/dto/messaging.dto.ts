import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateConversationDto {
  @ApiProperty({ example: 'Question sur ma commande CN-2026-001' })
  @IsString()
  @Length(3, 220)
  subject!: string;

  @ApiProperty({ example: 'Bonjour, je souhaite modifier mon adresse…' })
  @IsString()
  @Length(1, 5000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Vendeur destinataire (sinon admin)' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  recipientId?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Merci pour votre réponse !' })
  @IsString()
  @Length(1, 5000)
  body!: string;
}

export class ConversationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiPropertyOptional() orderId!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() lastMessageAt!: Date | null;
  @ApiProperty() unreadCount!: number;
  @ApiPropertyOptional() lastMessage!: { body: string; createdAt: Date } | null;
}

export class ConversationQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class MessageQueryDto {
  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
