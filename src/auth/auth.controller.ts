import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import {
  AuthResponseDto,
  AuthUserDto,
  ForgotPasswordDto,
  LoginDto,
  MessageResponseDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Créer un compte',
    description:
      'Crée un compte client. Avec `asSeller: true`, crée également une demande vendeur en attente de validation (PENDING).',
  })
  @ApiResponse({ status: 201, type: AuthResponseDto, description: 'Compte créé.' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto, request);
    this.authService.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Se connecter (JWT + refresh token)' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto, request);
    this.authService.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Renouveler l’access token',
    description:
      'Rotation du refresh token : l’ancien est révoqué. La réutilisation d’un jeton révoqué révoque toute la famille.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 204, description: 'Aucun refresh token fourni : visiteur anonyme.' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide, expiré ou révoqué.' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto | void> {
    const token = dto.refreshToken ?? (request.cookies?.['mobilier_rt'] as string | undefined);

    // Visiteur anonyme : le frontend tente de restaurer une session à chaque
    // chargement. Répondre 401 dans ce cas polluait la console de tous les
    // visiteurs non connectés. « Aucune session à renouveler » n'est pas une
    // erreur d'authentification : on renvoie 204 sans lever d'exception.
    // Un jeton présent mais invalide, expiré ou révoqué renvoie toujours 401.
    if (!token) {
      response.status(HttpStatus.NO_CONTENT);
      return;
    }

    const result = await this.authService.refresh(token, request);
    this.authService.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Se déconnecter (révoque le refresh token courant)' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponseDto> {
    const token = dto.refreshToken ?? (request.cookies?.['mobilier_rt'] as string | undefined);
    await this.authService.logout(token, request);
    this.authService.clearRefreshCookie(response);
    return { message: 'Déconnexion réussie.' };
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Utilisateur courant (rôle + statut vendeur)' })
  @ApiResponse({ status: 200, type: AuthUserDto })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  async me(@CurrentUser() user: JwtUser): Promise<AuthUserDto> {
    return this.authService.me(user.id);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @ApiOperation({
    summary: 'Demander un lien de réinitialisation',
    description: 'Réponse toujours identique afin d’éviter l’énumération de comptes.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    await this.authService.forgotPassword(dto.email, request);
    return {
      message: 'Si un compte existe pour cet e-mail, un lien de réinitialisation a été envoyé.',
    };
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: 'Réinitialiser le mot de passe avec le jeton reçu par e-mail' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    await this.authService.resetPassword(dto.token, dto.password, request);
    return { message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' };
  }
}
