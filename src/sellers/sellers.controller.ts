import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { SellersService } from './sellers.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  ApplySellerDto,
  SellerQueryDto,
  SellerResponseDto,
  UpdateSellerDto,
} from './dto/seller.dto';
import { Seller } from './entities/seller.entity';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('sellers')
@ApiBearerAuth('access-token')
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post('apply')
  @ApiOperation({
    summary: 'Demander à devenir vendeur',
    description:
      "Crée une demande en statut PENDING. Aucune publication n'est possible avant validation par un administrateur.",
  })
  @ApiResponse({ status: 201, type: SellerResponseDto })
  @ApiResponse({ status: 409, description: 'Demande déjà en cours ou vendeur déjà approuvé.' })
  async apply(
    @CurrentUser() user: JwtUser,
    @Body() dto: ApplySellerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Seller> {
    return this.sellersService.apply(user.id, dto, request);
  }

  @Get('me')
  @ApiOperation({ summary: 'Ma boutique vendeur' })
  @ApiResponse({ status: 200, type: SellerResponseDto })
  @ApiResponse({ status: 404, description: 'Aucune boutique associée.' })
  async me(@CurrentUser() user: JwtUser): Promise<Seller> {
    return this.sellersService.findMine(user.id);
  }

  @Get('me/application')
  @ApiOperation({ summary: 'Ma demande vendeur (null si aucune)' })
  @ApiResponse({ status: 200, type: SellerResponseDto })
  async myApplication(@CurrentUser() user: JwtUser): Promise<Seller | null> {
    return this.sellersService.myApplication(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Modifier les informations de ma boutique' })
  @ApiResponse({ status: 200, type: SellerResponseDto })
  async updateMe(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSellerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Seller> {
    return this.sellersService.updateMine(user.id, dto, request);
  }

  /* ------------------------------ Administration ----------------------------- */

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Lister les vendeurs' })
  async findAll(@Query() query: SellerQueryDto): Promise<Paginated<Seller>> {
    return this.sellersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Détail d’un vendeur' })
  async findOne(@Param('id', UuidParamPipe) id: string): Promise<Seller> {
    return this.sellersService.findById(id);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Approuver un vendeur' })
  @ApiResponse({ status: 200, type: SellerResponseDto })
  async approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Seller> {
    return this.sellersService.approve(id, admin.id, request);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Refuser un vendeur' })
  async reject(
    @Param('id', UuidParamPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Seller> {
    return this.sellersService.reject(id, admin.id, body?.reason ?? 'Motif non précisé.', request);
  }

  @Post(':id/suspend')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Suspendre un vendeur' })
  async suspend(
    @Param('id', UuidParamPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Seller> {
    return this.sellersService.suspend(id, admin.id, body?.reason ?? 'Motif non précisé.', request);
  }
}
