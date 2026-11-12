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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { requireUser } from '../common/utils/request.util';
import { ProductsService } from './products.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireApprovedSeller } from '../common/decorators/approved-seller.decorator';
import { UserRole } from '../common/enums';
import {
  CreateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  UpdateProductDto,
} from './dto/product.dto';
import { Product } from './entities/product.entity';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /* --------------------------------- Public --------------------------------- */

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Catalogue public (recherche, filtres, tri, pagination)',
    description:
      'Filtres : search, category, seller, minPrice, maxPrice, availability, featured, sort.',
  })
  @ApiResponse({ status: 200, description: 'Liste paginée.' })
  async findAll(@Query() query: ProductQueryDto): Promise<Paginated<Product>> {
    return this.productsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Fiche produit publique par slug' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Produit introuvable.' })
  async findBySlug(@Param('slug') slug: string): Promise<Product> {
    return this.productsService.findBySlug(slug);
  }

  /* --------------------------------- Vendeur -------------------------------- */

  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @RequireApprovedSeller()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Vendeur approuvé / Admin] Créer un produit',
    description:
      'Pour un vendeur, le vendeur est déduit du JWT. Pour un administrateur, `sellerId` est exigé.',
  })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  @ApiResponse({ status: 403, description: 'Vendeur non approuvé.' })
  async create(
    @Body() dto: CreateProductDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Product> {
    const user = requireUser(request);

    if (user.role === UserRole.ADMIN) {
      if (!dto.sellerId) {
        throw BusinessException.badRequest(
          "sellerId est requis lorsqu'un administrateur crée un produit.",
          ErrorCode.VALIDATION_ERROR,
        );
      }
      return this.productsService.createForSeller(dto.sellerId, dto, request);
    }

    const seller = request.seller;
    if (!seller) {
      throw new Error('SELLER_CONTEXT_MISSING');
    }
    return this.productsService.createForSeller(seller.id, dto, request);
  }

  @Patch(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Vendeur/Admin] Modifier un produit' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 403, description: 'Le produit ne vous appartient pas.' })
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Product> {
    const user = requireUser(request);
    const isAdmin = user.role === UserRole.ADMIN;
    const sellerId = request.seller?.id ?? user.sellerId ?? '';
    return this.productsService.updateForSeller(id, sellerId, dto, {
      isAdmin,
      request,
    });
  }

  @Delete(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Vendeur/Admin] Supprimer un produit (soft delete)' })
  @ApiResponse({ status: 403, description: 'Le produit ne vous appartient pas.' })
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const user = requireUser(request);
    const isAdmin = user.role === UserRole.ADMIN;
    const sellerId = request.seller?.id ?? user.sellerId ?? '';
    await this.productsService.removeForSeller(id, sellerId, { isAdmin, request });
  }

  @Get('seller/me')
  @Roles(UserRole.SELLER)
  @RequireApprovedSeller()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Vendeur approuvé] Mes produits (tous statuts)' })
  async myProducts(
    @Query() query: ProductQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Paginated<Product>> {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.productsService.findAll(query, { ownerId: seller.id });
  }
}
