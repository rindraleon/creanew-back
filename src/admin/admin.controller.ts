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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AnalyticsService } from '../analytics/analytics.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { SellersService } from '../sellers/sellers.service';
import { ProductsService } from '../products/products.service';
import { ProductQueryDto } from '../products/dto/product.dto';
import { Product } from '../products/entities/product.entity';
import { CategoriesService } from '../categories/categories.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { AuditAction, AuditEntity, UserRole } from '../common/enums';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  AdminAnalyticsQueryDto,
  AdminUsersQueryDto,
  AuditLogQueryDto,
  ChangeRoleDto,
  SuspendUserDto,
} from './dto/admin.dto';
import type { UserResponseDto } from '../users/dto/user.dto';
import { toUserResponse } from '../users/dto/user.dto';
import { buildMeta, type Paginated } from '../common/interfaces/paginated.interface';
import { Order } from '../orders/entities/order.entity';
import { UpdateOrderStatusDto } from '../orders/dto/order.dto';
import { RejectPaymentDto } from '../payments/dto/payment.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly sellersService: SellersService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  /* -------------------------------- Dashboard -------------------------------- */

  @Get('dashboard')
  @ApiOperation({ summary: '[Admin] Tableau de bord (statistiques calculées côté serveur)' })
  async dashboard(@Query() query: AdminAnalyticsQueryDto) {
    return this.analyticsService.adminDashboard(query.period ?? '30d', query.from, query.to);
  }

  @Get('analytics')
  @ApiOperation({
    summary: '[Admin] Analyses détaillées',
    description: 'type = sales | orders | products | customers | sellers',
  })
  async analytics(@Query() query: AdminAnalyticsQueryDto) {
    const period = query.period ?? '30d';
    switch (query.type) {
      case 'orders':
        return {
          byStatus: await this.analyticsService.ordersByStatus(),
          overTime: await this.analyticsService.salesOverTime(period, query.from, query.to),
        };
      case 'products':
        return {
          topProducts: await this.analyticsService.topProducts(10),
          byCategory: await this.analyticsService.salesByCategory(period),
        };
      case 'customers':
        return this.analyticsService.customersAnalytics(period);
      case 'sellers':
        return { bySeller: await this.analyticsService.salesBySeller(period) };
      case 'sales':
      default:
        return {
          overTime: await this.analyticsService.salesOverTime(period, query.from, query.to),
          byCategory: await this.analyticsService.salesByCategory(period),
        };
    }
  }

  /* --------------------------------- Utilisateurs ---------------------------- */

  @Get('users')
  @ApiOperation({ summary: '[Admin] Lister les utilisateurs' })
  async users(@Query() query: AdminUsersQueryDto): Promise<Paginated<UserResponseDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const { items, total } = await this.usersService.listUsers({
      page,
      limit,
      search: query.search,
      role: query.role,
      inactiveOnly: query.inactiveOnly,
    });

    return {
      items: items.map((user) => toUserResponse(user)),
      meta: buildMeta(total, page, limit),
    };
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: '[Admin] Changer le rôle d’un utilisateur' })
  async changeRole(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    this.assertNotSelf(admin.id, id);
    const saved = await this.usersService.setRole(id, dto.role);
    await this.audit.log({
      userId: admin.id,
      action: AuditAction.USER_ROLE_CHANGED,
      entity: AuditEntity.USER,
      entityId: id,
      request,
      metadata: { role: dto.role },
    });
    return toUserResponse(saved);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Suspendre un utilisateur' })
  async suspend(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    this.assertNotSelf(admin.id, id);
    const saved = await this.usersService.setActive(id, false);
    await this.audit.log({
      userId: admin.id,
      action: AuditAction.USER_SUSPENDED,
      entity: AuditEntity.USER,
      entityId: id,
      request,
      metadata: { reason: dto.reason ?? null },
    });
    return toUserResponse(saved);
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Réactiver un utilisateur' })
  async reactivate(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    this.assertNotSelf(admin.id, id);
    const saved = await this.usersService.setActive(id, true);
    await this.audit.log({
      userId: admin.id,
      action: AuditAction.USER_REACTIVATED,
      entity: AuditEntity.USER,
      entityId: id,
      request,
    });
    return toUserResponse(saved);
  }

  /* ---------------------------------- Vendeurs ------------------------------- */

  @Get('sellers')
  @ApiOperation({ summary: '[Admin] Lister les vendeurs' })
  async sellers(@Query() query: never) {
    return this.sellersService.findAll(query ?? {});
  }

  @Get('sellers/pending')
  @ApiOperation({ summary: '[Admin] Demandes vendeur en attente' })
  async pendingSellers() {
    return this.sellersService.findAll({ status: 'pending' as never, page: 1, limit: 100 });
  }

  @Post('sellers/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Approuver un vendeur' })
  async approveSeller(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sellersService.approve(id, admin.id, request);
  }

  @Post('sellers/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Refuser un vendeur' })
  async rejectSeller(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sellersService.reject(id, admin.id, dto.reason, request);
  }

  @Post('sellers/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Suspendre un vendeur' })
  async suspendSeller(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sellersService.suspend(
      id,
      admin.id,
      dto.reason ?? 'Suspendu par un administrateur.',
      request,
    );
  }

  /* ------------------------------- Produits / catégories --------------------- */

  @Get('products')
  @ApiOperation({
    summary: '[Admin] Lister tous les produits (tous statuts, brouillons compris)',
    description:
      'Mêmes filtres que le catalogue public (search, category, minPrice, maxPrice, sort…), ' +
      "mais sans la restriction `status = 'published'` : l'admin modère aussi les brouillons.",
  })
  async products(@Query() query: ProductQueryDto): Promise<Paginated<Product>> {
    return this.productsService.findAll(query, { allStatuses: true });
  }

  @Get('categories')
  @ApiOperation({ summary: '[Admin] Lister les catégories (y compris inactives)' })
  async categories() {
    return this.categoriesService.findAll(true);
  }

  /* --------------------------------- Commandes ------------------------------- */

  @Get('orders')
  @ApiOperation({ summary: '[Admin] Lister toutes les commandes' })
  async orders(@Query() query: never): Promise<Paginated<Order>> {
    return this.ordersService.findAll(query ?? {});
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: '[Admin] Changer le statut d’une commande' })
  async updateOrderStatus(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Order> {
    return this.ordersService.updateStatus(
      id,
      dto.status,
      { userId: admin.id, role: UserRole.ADMIN },
      dto.comment ?? null,
      request,
    );
  }

  /* ---------------------------------- Paiements ------------------------------ */

  @Get('payments')
  @ApiOperation({ summary: '[Admin] Lister les paiements' })
  async payments(@Query() query: never) {
    return this.paymentsService.findAll(query ?? {});
  }

  @Post('payments/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Vérifier un paiement (commande → PAID)' })
  async verifyPayment(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentsService.verify(id, admin.id, request);
  }

  @Post('payments/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Rejeter un paiement' })
  async rejectPayment(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentsService.reject(id, admin.id, dto.reason, request);
  }

  /* ---------------------------------- Audit ---------------------------------- */

  @Get('audit-logs')
  @ApiOperation({
    summary: '[Admin] Journal d’audit',
    description: 'Qui a fait quoi, quand, sur quelle ressource, depuis quelle IP.',
  })
  async auditLogs(@Query() query: AuditLogQueryDto) {
    return this.audit.findAll(query);
  }

  /** Garde-fou : un admin ne peut pas se rétrograder par erreur. */
  private assertNotSelf(adminId: string, targetId: string): void {
    if (adminId === targetId) {
      throw BusinessException.badRequest(
        'Vous ne pouvez pas modifier votre propre compte via cet endpoint.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
  }
}
