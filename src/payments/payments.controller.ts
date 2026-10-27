import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { requireUser } from '../common/utils/request.util';
import { PaymentsService } from './payments.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  PaymentQueryDto,
  PaymentResponseDto,
  RejectPaymentDto,
  SubmitPaymentDto,
} from './dto/payment.dto';
import { Payment } from './entities/payment.entity';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { OrdersService } from '../orders/orders.service';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Opérateurs Mobile Money disponibles',
    description: 'La vérification est manuelle tant qu’aucune API officielle n’est branchée.',
  })
  providers() {
    return this.paymentsService.providers();
  }

  @Post('orders/:orderId')
  @ApiOperation({
    summary: 'Soumettre une référence de paiement Mobile Money',
    description:
      "Le paiement passe en SUBMITTED. Il ne devient VALIDE qu'après vérification par un administrateur : jamais de validation automatique simulée.",
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiResponse({ status: 201, type: PaymentResponseDto })
  @ApiResponse({ status: 409, description: 'Paiement déjà soumis ou référence déjà utilisée.' })
  async submit(
    @CurrentUser() user: JwtUser,
    @Param('orderId', UuidParamPipe) orderId: string,
    @Body() dto: SubmitPaymentDto,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Payment> {
    return this.paymentsService.submit(user.id, orderId, dto, { idempotencyKey, request });
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Paiement d’une de mes commandes' })
  async findForOrder(
    @Param('orderId', UuidParamPipe) orderId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Payment | null> {
    const user = requireUser(request);
    if (user.role !== UserRole.ADMIN) {
      const order = await this.ordersService.findByIdRaw(orderId);
      if (order.userId !== user.id) {
        throw BusinessException.forbidden(
          'Cette commande ne vous appartient pas.',
          ErrorCode.ORDER_NOT_OWNED,
        );
      }
    }
    return this.paymentsService.findForOrder(orderId);
  }

  /* ------------------------------ Administration ----------------------------- */

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Lister les paiements' })
  async findAll(@Query() query: PaymentQueryDto): Promise<Paginated<Payment>> {
    return this.paymentsService.findAll(query);
  }

  @Post(':id/verify')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin] Vérifier un paiement',
    description: 'Passe le paiement en VERIFIED et la commande en PAID.',
  })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  async verify(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Payment> {
    return this.paymentsService.verify(id, admin.id, request);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin] Rejeter un paiement',
    description:
      'La commande repasse en attente de paiement pour permettre une nouvelle référence.',
  })
  async reject(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<Payment> {
    return this.paymentsService.reject(id, admin.id, dto.reason, request);
  }
}
