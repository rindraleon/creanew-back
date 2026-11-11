import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsSafeEmail, NormalizeEmail } from '../../common/validators/email-disposable.validator';
import { UserRole } from '../../common/enums';

export class RegisterDto {
  @ApiProperty({
    example: 'johndoe_92',
    description: 'Nom d’utilisateur unique (3-30, lettres/chiffres/._-)',
  })
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username invalide : lettres, chiffres, . _ - uniquement.',
  })
  username!: string;

  @ApiPropertyOptional({ example: 'Camille' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  firstName?: string;

  @ApiProperty({ example: 'Rakoto' })
  @IsString()
  @Length(1, 120)
  lastName!: string;

  @ApiProperty({ example: 'client@creanew.mg' })
  @NormalizeEmail()
  @IsSafeEmail()
  email!: string;

  @ApiProperty({ example: 'Motdepasse1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  })
  password!: string;

  @ApiPropertyOptional({ example: '+261 34 12 345 67' })
  @IsOptional()
  @IsString()
  @Length(4, 40)
  phone?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Champ historique facultatif, ignoré par le serveur.',
  })
  @IsBoolean()
  @IsOptional()
  acceptsTerms?: boolean;
}

export class LoginDto {
  @ApiProperty({
    example: 'johndoe_92 ou client@creanew.mg',
    description: 'Email ou nom d’utilisateur',
  })
  @IsOptional()
  @IsString()
  @Length(1, 190)
  identifier?: string;

  @ApiPropertyOptional({ example: 'client@creanew.mg', description: 'Alias email (compatibilité)' })
  @IsOptional()
  @NormalizeEmail()
  @IsString()
  @Length(1, 190)
  email?: string;

  @ApiProperty({ example: 'Motdepasse1!' })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (sinon cookie httpOnly).' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'client@creanew.mg' })
  @NormalizeEmail()
  @IsSafeEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Jeton reçu par e-mail.' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NouveauMotdepasse1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  })
  password!: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional() firstName!: string | null;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional() phone!: string | null;
  @ApiPropertyOptional() avatarUrl!: string | null;
  @ApiPropertyOptional() provider!: string | null;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiPropertyOptional({ description: 'Statut vendeur si le compte est vendeur.' })
  sellerStatus!: string | null;
  @ApiPropertyOptional() sellerId!: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT d’accès (courte durée).' })
  accessToken!: string;

  @ApiProperty({ description: 'Refresh token opaque (rotation à chaque usage).' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900, description: 'Durée de vie de l’access token en secondes.' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}
