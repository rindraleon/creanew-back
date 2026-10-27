import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/enums';

export class RegisterDto {
  @ApiProperty({ example: 'Camille Moreau' })
  @IsString()
  @Length(1, 120)
  firstName!: string;

  @ApiProperty({ example: 'Rakoto' })
  @IsString()
  @Length(1, 120)
  lastName!: string;

  @ApiProperty({ example: 'client@example.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Motdepasse1!', minLength: 8 })
  @IsString()
  @MinLength(8)
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
    example: false,
    description: 'Devenir vendeur (crée une demande PENDING).',
  })
  @IsOptional()
  @IsBoolean()
  asSeller?: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'client@example.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Motdepasse1!' })
  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (sinon cookie httpOnly).' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'client@example.local' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Jeton reçu par e-mail.' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NouveauMotdepasse1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  })
  password!: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional() phone!: string | null;
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
