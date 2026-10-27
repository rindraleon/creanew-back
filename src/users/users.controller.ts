import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { UsersService } from './users.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import {
  AddressDto,
  AddressResponseDto,
  ChangePasswordDto,
  UpdateProfileDto,
  UserResponseDto,
  toUserResponse,
} from './dto/user.dto';
import { Address } from './entities/address.entity';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async me(@CurrentUser() user: JwtUser): Promise<UserResponseDto> {
    const entity = await this.usersService.findById(user.id);
    return toUserResponse(entity);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    const updated = await this.usersService.updateProfile(user.id, dto, request);
    return toUserResponse(updated);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changer mon mot de passe (révoque toutes les sessions)' })
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.usersService.changePassword(user.id, dto.currentPassword, dto.newPassword, request);
    return { message: 'Mot de passe mis à jour. Toutes vos sessions ont été révoquées.' };
  }

  /* -------------------------------- Adresses -------------------------------- */

  @Get('me/addresses')
  @ApiOperation({ summary: 'Mes adresses de livraison' })
  @ApiResponse({ status: 200, type: [AddressResponseDto] })
  async listAddresses(@CurrentUser() user: JwtUser): Promise<Address[]> {
    return this.usersService.listAddresses(user.id);
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Ajouter une adresse' })
  @ApiResponse({ status: 201, type: AddressResponseDto })
  async createAddress(@CurrentUser() user: JwtUser, @Body() dto: AddressDto): Promise<Address> {
    return this.usersService.createAddress(user.id, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Modifier une de mes adresses' })
  async updateAddress(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: AddressDto,
  ): Promise<Address> {
    return this.usersService.updateAddress(user.id, id, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une de mes adresses' })
  async deleteAddress(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.usersService.deleteAddress(user.id, id);
  }

  @Post('me/addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Définir une adresse par défaut' })
  async setDefault(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<{ message: string }> {
    await this.usersService.setDefaultAddress(user.id, id);
    return { message: 'Adresse par défaut mise à jour.' };
  }
}
