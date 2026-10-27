import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { IdempotencyService } from '../common/services/idempotency.service';
import { IdempotencyKey } from '../common/entities/idempotency-key.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, OrderStatusHistory, IdempotencyKey]),
    NotificationsModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, IdempotencyService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
