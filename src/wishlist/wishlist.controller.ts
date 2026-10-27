import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WishlistService, type WishlistProduct } from './wishlist.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { AddWishlistItemDto, WishlistProductResponseDto } from './dto/wishlist.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('wishlist')
@ApiBearerAuth('access-token')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Ma liste de souhaits' })
  @ApiResponse({ status: 200, type: [WishlistProductResponseDto] })
  findAll(@CurrentUser() user: JwtUser): Promise<WishlistProduct[]> {
    return this.wishlistService.findAll(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Ajouter un produit aux favoris' })
  @ApiResponse({ status: 404, description: 'Produit introuvable.' })
  @ApiResponse({ status: 200, type: [WishlistProductResponseDto] })
  @HttpCode(HttpStatus.OK)
  add(@CurrentUser() user: JwtUser, @Body() dto: AddWishlistItemDto): Promise<WishlistProduct[]> {
    return this.wishlistService.add(user.id, dto.productId);
  }

  @Post('items/:productId/toggle')
  @ApiOperation({ summary: 'Ajouter ou retirer un produit des favoris' })
  @ApiResponse({ status: 200, type: [WishlistProductResponseDto] })
  @HttpCode(HttpStatus.OK)
  toggle(
    @CurrentUser() user: JwtUser,
    @Param('productId', UuidParamPipe) productId: string,
  ): Promise<WishlistProduct[]> {
    return this.wishlistService.toggle(user.id, productId);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Retirer un produit des favoris' })
  @ApiResponse({ status: 200, type: [WishlistProductResponseDto] })
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('productId', UuidParamPipe) productId: string,
  ): Promise<WishlistProduct[]> {
    return this.wishlistService.remove(user.id, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Vider ma liste de souhaits' })
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: JwtUser): Promise<void> {
    return this.wishlistService.clear(user.id);
  }
}
