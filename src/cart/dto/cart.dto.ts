import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ description: 'Identifiant du produit.' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 99, default: 1 })
  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  quantity: number = 1;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  quantity!: number;
}

export class CartProductSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Prix unitaire courant en MGA.' })
  price!: number;
  @ApiPropertyOptional() compareAtPrice!: number | null;
  @ApiProperty() stock!: number;
  @ApiPropertyOptional() imageUrl!: string | null;
  @ApiProperty() sellerId!: string;
  @ApiPropertyOptional() sellerName!: string | null;
}

export class CartItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Prix unitaire recalculé côté serveur.' })
  unitPrice!: number;
  @ApiProperty({ description: 'unitPrice × quantity.' })
  lineTotal!: number;
  @ApiProperty({ type: CartProductSummaryDto })
  product!: CartProductSummaryDto;
  @ApiProperty({ description: 'false si le produit n’est plus commandable.' })
  available!: boolean;
  @ApiPropertyOptional({ description: 'Raison si indisponible.' })
  issue!: string | null;
}

export class CartResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];
  @ApiProperty({ description: 'Somme serveur des lignes disponibles.' })
  subtotal!: number;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ description: 'Nombre total d’unités.' })
  quantity!: number;
  @ApiProperty({ example: 'MGA' })
  currency!: string;
  @ApiProperty({ description: 'Articles retirés du calcul (rupture, produit archivé…).' })
  warnings!: string[];
}
