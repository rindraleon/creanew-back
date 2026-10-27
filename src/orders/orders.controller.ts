import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { requireUser } from '../common/utils/request.util';
import { OrdersService, type ActorContext } from './orders.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import {
  CancelOrderDto,
  CreateOrderDto,
  OrderQueryDto,
  OrderResponseDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { Order } from './entities/order.entity';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('orders')
@ApiBearerAuth('access-token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer une commande (authentification obligatoire)',
    description:
      "Le total est recalculé côté serveur. Le stock est vérifié puis décrémenté dans une transaction PostgreSQL. Utilisez l'en-tête `Idempotency-Key` pour éviter les doubles soumissions.",
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clé unique protégeant contre les doubles soumissions.',
  })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiResponse({ status: 409, description: 'Stock insuffisant.' })
  @ApiResponse({ status: 401, description: 'Authentification requise.' })
  async create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateOrderDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Order> {
    return this.ordersService.create(user.id, dto, { idempotencyKey, request });
  }

  @Get('me')
  @ApiOperation({ summary: 'Mes commandes' })
  async myOrders(
    @CurrentUser() user: JwtUser,
    @Query() query: OrderQueryDto,
  ): Promise<Paginated<Order>> {
    return this.ordersService.findMyOrders(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Détail d’une commande',
    description:
      "Contrôle d'appartenance côté serveur : un client ne voit que ses commandes, un vendeur que les articles qui le concernent.",
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 403, description: 'Cette commande ne vous appartient pas.' })
  async findOne(
    @Param('id', UuidParamPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Order> {
    const user = requireUser(request);
    const actor: ActorContext = {
      userId: user.id,
      role: user.role,
      sellerId: request.seller?.id ?? user.sellerId ?? null,
    };
    return this.ordersService.findOne(id, actor);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler ma commande (remise en stock)' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 409, description: 'Annulation impossible à ce stade.' })
  async cancel(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CancelOrderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Order> {
    const user = requireUser(request);
    const actor: ActorContext = {
      userId: user.id,
      role: user.role,
      sellerId: request.seller?.id ?? user.sellerId ?? null,
    };
    return this.ordersService.cancel(id, actor, dto, request);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: '[Vendeur/Admin] Changer le statut d’une commande',
    description:
      'Transitions contrôlées et historisées. Vendeur : préparation, prêt, expédié, livré.',
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 409, description: 'Transition de statut interdite.' })
  async updateStatus(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Order> {
    const user = requireUser(request);
    const actor: ActorContext = {
      userId: user.id,
      role: user.role,
      sellerId: request.seller?.id ?? user.sellerId ?? null,
    };
    return this.ordersService.updateStatus(id, dto.status, actor, dto.comment ?? null, request);
  }
}
