import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWishlistItemDto {
  @ApiProperty({ description: 'UUID du produit à ajouter aux favoris.' })
  @IsUUID()
  productId!: string;
}

export class WishlistProductResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Prix unitaire en MGA (entier).' }) price!: number;
  @ApiProperty() stock!: number;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;
  @ApiProperty() addedAt!: Date;
}
