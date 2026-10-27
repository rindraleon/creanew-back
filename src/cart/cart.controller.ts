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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { AddCartItemDto, CartResponseDto, UpdateCartItemDto } from './dto/cart.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('cart')
@ApiBearerAuth('access-token')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({
    summary: 'Mon panier',
    description: 'Les montants sont recalculés côté serveur à partir du prix produit courant.',
  })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async getCart(@CurrentUser() user: JwtUser): Promise<CartResponseDto> {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Ajouter un article au panier' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  @ApiResponse({ status: 409, description: 'Stock insuffisant.' })
  async addItem(
    @CurrentUser() user: JwtUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartService.addItem(user.id, dto.productId, dto.quantity ?? 1);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Modifier la quantité d’un article' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async updateItem(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartService.updateItem(user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Retirer un article du panier' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async removeItem(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CartResponseDto> {
    return this.cartService.removeItem(user.id, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vider le panier' })
  async clear(@CurrentUser() user: JwtUser): Promise<void> {
    await this.cartService.clear(user.id);
  }
}
