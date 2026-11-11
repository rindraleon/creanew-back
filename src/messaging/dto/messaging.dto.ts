import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

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
