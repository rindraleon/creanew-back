import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, ShippingMethod } from '../../common/enums';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class OrderItemInputDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class OrderAddressInputDto {
  @ApiProperty({ example: 'Camille Moreau' })
  @IsString()
  @Length(1, 160)
  fullName!: string;

  @ApiProperty({ example: '+261 34 12 345 67' })
  @IsString()
  @Length(4, 40)
  phone!: string;

  @ApiProperty({ example: 'Lot II M 12 Bis' })
  @IsString()
  @Length(1, 200)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiProperty({ example: 'Antananarivo' })
  @IsString()
  @Length(1, 120)
  city!: string;

  @ApiPropertyOptional({ default: 'Madagascar' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  country?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Adresse enregistrée à utiliser. Si absent, `shippingAddress` doit être fourni.',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ description: 'Adresse ponctuelle (si pas d’addressId).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderAddressInputDto)
  shippingAddress?: OrderAddressInputDto;

  @ApiPropertyOptional({
    description: "Articles à commander. Si absent, le panier serveur de l'utilisateur est utilisé.",
    type: [OrderItemInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @ApiPropertyOptional({ enum: ShippingMethod, default: ShippingMethod.STANDARD })
  @IsOptional()
  @IsEnum(ShippingMethod)
  shippingMethod?: ShippingMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Enregistrer l’adresse ponctuelle dans le carnet.' })
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  @ApiPropertyOptional({ description: 'Label de l’adresse si sauvegardée.' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  addressLabel?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PROCESSING })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ example: 'Colis remis au transporteur.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'Commande passée par erreur.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class OrderQueryDto {
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

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Recherche sur numéro de commande ou client.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  onlyMine?: boolean;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'] as unknown as object)
  order?: 'ASC' | 'DESC' = 'DESC';
}

export class OrderItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string | null;
  @ApiProperty() sellerId!: string;
  @ApiPropertyOptional() sellerName!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() slug!: string | null;
  @ApiPropertyOptional() imageUrl!: string | null;
  @ApiPropertyOptional() sku!: string | null;
  @ApiProperty({ description: 'Prix figé au moment de la commande (MGA).' })
  unitPrice!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() lineTotal!: number;
}

export class OrderStatusHistoryDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ enum: OrderStatus }) previousStatus!: OrderStatus | null;
  @ApiProperty({ enum: OrderStatus }) newStatus!: OrderStatus;
  @ApiPropertyOptional() changedBy!: string | null;
  @ApiPropertyOptional() comment!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CMD-26AB12CD' }) orderNumber!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() subtotal!: number;
  @ApiProperty() discount!: number;
  @ApiPropertyOptional() promoCode!: string | null;
  @ApiProperty({ enum: ShippingMethod }) shippingMethod!: ShippingMethod;
  @ApiProperty() shippingCost!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ example: 'MGA' }) currency!: string;
  @ApiProperty() shippingAddress!: unknown;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerEmail!: string;
  @ApiPropertyOptional() customerPhone!: string | null;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: [OrderStatusHistoryDto] }) statusHistory!: OrderStatusHistoryDto[];
  @ApiPropertyOptional() payment!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
