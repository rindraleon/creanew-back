import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { requireUser } from '../common/utils/request.util';
import { SellersService } from './sellers.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { PaymentsService } from '../payments/payments.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireApprovedSeller } from '../common/decorators/approved-seller.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { OrderQueryDto } from '../orders/dto/order.dto';
import { PaymentQueryDto } from '../payments/dto/payment.dto';
import { ProductQueryDto } from '../products/dto/product.dto';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('seller')
@ApiBearerAuth('access-token')
@Roles(UserRole.SELLER)
@RequireApprovedSeller()
@Controller('seller')
export class SellerController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly analyticsService: AnalyticsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: '[Vendeur approuvé] Tableau de bord',
    description: 'Ventes du jour/mois, commandes, produits, stock faible, revenus.',
  })
  async dashboard(@Req() request: AuthenticatedRequest) {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.analyticsService.sellerDashboard(seller.id);
  }

  @Get('products')
  @ApiOperation({ summary: '[Vendeur approuvé] Mes produits' })
  async products(
    @Query() query: ProductQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Paginated<Product>> {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.productsService.findAll(query, { ownerId: seller.id });
  }

  @Get('orders')
  @ApiOperation({
    summary: '[Vendeur approuvé] Commandes contenant mes produits',
    description: 'Le vendeur ne voit que les commandes qui le concernent.',
  })
  async orders(
    @Query() query: OrderQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Paginated<Order>> {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.ordersService.findSellerOrders(seller.id, query);
  }

  @Get('orders/:id')
  @ApiOperation({
    summary: '[Vendeur approuvé] Détail d’une commande (articles me concernant uniquement)',
  })
  async order(
    @Param('id', UuidParamPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Order> {
    const user = requireUser(request);
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.ordersService.findOne(id, {
      userId: user.id,
      role: UserRole.SELLER,
      sellerId: seller.id,
    });
  }

  @Get('analytics')
  @ApiOperation({ summary: '[Vendeur approuvé] Analyses : sales | products' })
  @ApiResponse({ status: 403, description: 'Vendeur non approuvé.' })
  async analytics(
    @Query('type') type: 'sales' | 'products' = 'sales',
    @Query('period') period: '7d' | '30d' | 'this_month' | 'this_year' = '30d',
    @Req() request: AuthenticatedRequest,
  ) {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    if (type === 'products') {
      return {
        topProducts: await this.analyticsService.sellerTopProducts(seller.id),
        ordersByStatus: await this.analyticsService.sellerOrdersStats(seller.id),
      };
    }
    return {
      sales: await this.analyticsService.sellerSales(seller.id, period),
      ordersByStatus: await this.analyticsService.sellerOrdersStats(seller.id),
    };
  }

  @Get('sales')
  @ApiOperation({ summary: '[Vendeur approuvé] Ventes par période' })
  async sales(
    @Query('period') period: '7d' | '30d' | 'this_month' | 'this_year' = '30d',
    @Req() request: AuthenticatedRequest,
  ) {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    return this.analyticsService.sellerSales(seller.id, period);
  }

  @Get('profile')
  @ApiOperation({ summary: '[Vendeur approuvé] Ma boutique' })
  async profile(@CurrentUser() user: JwtUser) {
    try {
      return await this.sellersService.findMine(user.id);
    } catch {
      throw BusinessException.notFound(
        'Aucune boutique associée à ce compte.',
        ErrorCode.NOT_SELLER,
      );
    }
  }

  @Get('payments')
  @ApiOperation({ summary: '[Vendeur approuvé] Paiements des commandes me concernant' })
  async payments(@Query() query: PaymentQueryDto, @Req() request: AuthenticatedRequest) {
    const seller = request.seller;
    if (!seller) throw new Error('SELLER_CONTEXT_MISSING');
    // Filtrage côté serveur : un vendeur ne voit que ses propres paiements.
    return this.paymentsService.findAll(query, { sellerId: seller.id });
  }
}
