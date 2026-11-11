import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { IsSafeEmail, NormalizeEmail } from '../../common/validators/email-disposable.validator';
import { UserRole } from '../../common/enums';

export class UserResponseDto {
  @ApiProperty({ example: '3f1b2c...' })
  id!: string;

  @ApiProperty({ example: 'johndoe' })
  username!: string;

  @ApiProperty({ example: 'client@creanew.mg' })
  email!: string;

  @ApiPropertyOptional({ example: 'Camille' })
  firstName!: string | null;

  @ApiProperty({ example: 'Moreau' })
  lastName!: string;

  @ApiProperty({ example: 'Camille Moreau' })
  fullName!: string;

  @ApiPropertyOptional({ example: '+261 34 00 000 00' })
  phone!: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.CUSTOMER })
  role!: UserRole;

  @ApiPropertyOptional({ example: null })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ example: 'google' })
  provider!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'johndoe' })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: 'Camille' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Moreau' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  lastName?: string;

  @ApiPropertyOptional({ example: '+261 34 12 345 67' })
  @IsOptional()
  @IsString()
  @Length(4, 40)
  @Matches(/^[+0-9 ().-]+$/, { message: 'Numéro de téléphone invalide.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'client@creanew.mg' })
  @IsOptional()
  @NormalizeEmail()
  @IsSafeEmail()
  email?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'Motdepasse1!' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NouveauMotdepasse1!' })
  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class AddressDto {
  @ApiPropertyOptional({ example: 'Domicile' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  label?: string;

  @ApiProperty({ example: 'Camille Moreau' })
  @IsString()
  @Length(1, 160)
  fullName!: string;

  @ApiProperty({ example: '+261 34 12 345 67' })
  @IsString()
  @Length(4, 40)
  phone!: string;

  @ApiProperty({ example: 'Lot II M 12 Bis Antananarivo' })
  @IsString()
  @Length(1, 200)
  addressLine1!: string;

  @ApiPropertyOptional({ example: 'Appartement 4B' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;

  @ApiPropertyOptional({ example: '101' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiProperty({ example: 'Antananarivo' })
  @IsString()
  @Length(1, 120)
  city!: string;

  @ApiPropertyOptional({ example: 'Madagascar', default: 'Madagascar' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  country?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AddressResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() label!: string | null;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional() addressLine2!: string | null;
  @ApiPropertyOptional() postalCode!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() country!: string;
  @ApiProperty() isDefault!: boolean;
}

export function toUserResponse(user: {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  avatarUrl?: string | null;
  provider?: string | null;
  avatarObjectKey?: string | null;
}): UserResponseDto {
  const dto = new UserResponseDto();
  dto.id = user.id;
  dto.username = user.username;
  dto.email = user.email;
  dto.firstName = user.firstName ?? null;
  dto.lastName = user.lastName;
  dto.fullName = `${user.firstName ?? ''} ${user.lastName}`.trim();
  dto.phone = user.phone ?? null;
  dto.role = user.role;
  dto.isActive = user.isActive;
  dto.createdAt = user.createdAt;
  dto.avatarUrl = user.avatarUrl ?? null;
  dto.provider = user.provider ?? null;
  return dto;
}

export class SecureUserResponse extends UserResponseDto {
  @Exclude()
  declare passwordHash?: never;
}

export { Expose };
