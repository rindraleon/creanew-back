import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { MobileMoneyProvider, PaymentStatus } from '../../common/enums';
import { ApplyTransform } from '../../common/decorators/transform.decorator';

export class SubmitPaymentDto {
  @ApiProperty({ enum: MobileMoneyProvider, example: MobileMoneyProvider.MVOLA })
  @IsEnum(MobileMoneyProvider)
  provider!: MobileMoneyProvider;

  @ApiProperty({
    example: 'MP240815.1234.A00001',
    description: 'Référence de transaction fournie par l’opérateur.',
  })
  @IsString()
  @Length(6, 40)
  transactionReference!: string;

  @ApiPropertyOptional({ example: '+261 34 12 345 67' })
  @IsOptional()
  @IsString()
  @Length(4, 40)
  payerPhone?: string;

  @ApiPropertyOptional({ description: 'Clé objet MinIO d’une capture (via /files/upload).' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  proofObjectKey?: string;
}

export class RejectPaymentDto {
  @ApiProperty({ example: 'Référence introuvable auprès de l’opérateur.' })
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class PaymentQueryDto {
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
  limit?: number = 20;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: MobileMoneyProvider })
  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  provider?: MobileMoneyProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanLike()
  pendingOnly?: boolean;
}

// Petit décorateur local : accepte "true"/true/1
function IsBooleanLike(): PropertyDecorator {
  return ApplyTransform<unknown>(
    ({ value }) => value === true || value === 'true' || value === '1',
  );
}

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty({ enum: MobileMoneyProvider }) provider!: MobileMoneyProvider;
  @ApiProperty() transactionReference!: string;
  @ApiProperty({ description: 'Montant attendu recalculé côté serveur.' })
  amount!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiPropertyOptional() payerPhone!: string | null;
  @ApiPropertyOptional() proofObjectKey!: string | null;
  @ApiPropertyOptional() submittedAt!: Date | null;
  @ApiPropertyOptional() verifiedAt!: Date | null;
  @ApiPropertyOptional() rejectionReason!: string | null;
  @ApiProperty() createdAt!: Date;
}
