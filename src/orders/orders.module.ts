import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Product } from '../products/entities/product.entity';
import { Address } from '../users/entities/address.entity';
import { IdempotencyKey } from '../common/entities/idempotency-key.entity';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdempotencyService } from '../common/services/idempotency.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      Product,
      Address,
      IdempotencyKey,
    ]),
    CartModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, IdempotencyService],
  exports: [OrdersService],
})
export class OrdersModule {}
