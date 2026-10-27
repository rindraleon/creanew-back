import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellersService } from './sellers.service';
import { SellersController } from './sellers.controller';
import { SellerController } from './seller.controller';
import { Seller } from './entities/seller.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Seller]),
    forwardRef(() => UsersModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => PaymentsModule),
    NotificationsModule,
    AnalyticsModule,
  ],
  controllers: [SellersController, SellerController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
